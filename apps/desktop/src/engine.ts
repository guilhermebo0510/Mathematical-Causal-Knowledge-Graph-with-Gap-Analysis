import { invoke, isTauri } from "@tauri-apps/api/core";
import type { Example, LoadedModel, Model, Run } from "./types";

export async function request<T>(
  operation: string,
  fields: Record<string, unknown> = {},
): Promise<T> {
  const id = crypto.randomUUID();
  const payload = { protocol_version: 1, id, operation, ...fields };
  let response: {
    protocol_version: number;
    id: string;
    ok: boolean;
    data?: T;
    error?: { message: string };
  };
  if (isTauri()) {
    response = await invoke("engine_request", { request: payload });
  } else {
    const result = await fetch("/__engine", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(17_000),
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
  analyze: (model: Model) => request<Run>("analyze", { model }),
};
