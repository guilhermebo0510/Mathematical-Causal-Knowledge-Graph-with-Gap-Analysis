import { invoke, isTauri } from "@tauri-apps/api/core";
import type { Example, LoadedModel, Model, Run } from "./types";

// Startup (including StrictMode remounts) can issue multiple requests. The native
// host deliberately permits only one engine process; queue calls before invoking.
let desktopQueue: Promise<unknown> = Promise.resolve();

export class NativeCancellationError extends Error {
  constructor(public readonly state: "confirmed" | "discarded" | "unconfirmed") {
    super(state === "confirmed" ? "Cancelamento confirmado pelo host." :
      state === "discarded" ? "Solicitação cancelada; resposta descartada." : "Cancelamento não confirmado pelo host.");
    this.name = "NativeCancellationError";
  }
}

export async function request<T>(
  operation: string,
  fields: Record<string, unknown> = {},
  signal?: AbortSignal,
): Promise<T> {
  signal?.throwIfAborted();
  const id = crypto.randomUUID();
  const payload = { ...fields, protocol_version: 1, id, operation };
  let response: {
    protocol_version: number;
    id: string;
    ok: boolean;
    data?: T;
    error?: { message: string };
  };
  if (isTauri()) {
    const pending = desktopQueue.then(async () => {
      signal?.throwIfAborted();
      // Cancellation bypasses the serialized request queue; completion never does.
      const cancel = () => { void invoke("cancel_engine_request", { operationId: id }).catch(()=>{}); };
      signal?.addEventListener("abort", cancel, {once:true});
      try {
        const result = await invoke<typeof response>("engine_request", { request: payload });
        if(signal?.aborted) throw new NativeCancellationError("discarded");
        return result;
      } catch(error) {
        if(error instanceof NativeCancellationError) throw error;
        if(String(error)==="NEXO_CANCELLED") throw new NativeCancellationError("confirmed");
        if(signal?.aborted) throw new NativeCancellationError("unconfirmed");
        if(String(error)==="NEXO_TERMINATION_UNCONFIRMED") throw new Error("Encerramento do motor não confirmado; novas execuções foram bloqueadas.");
        throw error;
      } finally { signal?.removeEventListener("abort",cancel); }
    });
    desktopQueue = pending.catch(() => undefined);
    response = await pending;
  } else {
    const result = await fetch("/__engine", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: signal ?? AbortSignal.timeout(120_000),
    });
    if (!result.ok) {
      const body = await result.json().catch(() => ({}));
      throw new Error(
        typeof body.error === "string"
          ? body.error
          : "O motor local está indisponível.",
      );
    }
    response = await result.json();
  }
  // Do not release the native queue until host termination/response is acknowledged.
  signal?.throwIfAborted();
  if (!response.ok)
    throw new Error(response.error?.message ?? "A análise não foi concluída.");
  if (response.protocol_version !== 1 || response.id !== id)
    throw new Error("Resposta incompatível do motor.");
  return response.data as T;
}

export const engine = {
  examples: () => request<Example[]>("list_examples"),
  load: (id: string) =>
    request<LoadedModel>("load_example", { example_id: id }),
  import: (model: unknown) => request<LoadedModel>("import_model", { model }),
  analyze: (model: Model, signal?: AbortSignal) =>
    request<Run>("analyze", { model }, signal),
};
