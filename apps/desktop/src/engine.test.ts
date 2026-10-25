import { afterEach, expect, test, vi } from "vitest";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { request } from "./engine";

vi.mock("@tauri-apps/api/core", () => ({
  isTauri: vi.fn(() => false),
  invoke: vi.fn(),
}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(isTauri).mockReturnValue(false);
  vi.mocked(invoke).mockReset();
});

test("desktop startup requests never overlap in the single-process host", async () => {
  vi.mocked(isTauri).mockReturnValue(true);
  let running = false;
  vi.mocked(invoke).mockImplementation(async (_command, args) => {
    if (running) throw new Error("Já existe uma operação em andamento.");
    running = true;
    await new Promise((resolve) => setTimeout(resolve, 5));
    running = false;
    const payload = (args as { request: { id: string; operation: string } })
      .request;
    return { protocol_version: 1, id: payload.id, ok: true, data: payload.operation };
  });
  await expect(
    Promise.all([request("list_examples"), request("load_example")]),
  ).resolves.toEqual(["list_examples", "load_example"]);
});

test("a failed desktop invocation does not block the next request", async () => {
  vi.mocked(isTauri).mockReturnValue(true);
  vi.mocked(invoke).mockRejectedValueOnce(new Error("Motor indisponível."));
  await expect(request("list_examples")).rejects.toThrow("Motor indisponível.");
  vi.mocked(invoke).mockImplementation(async (_command, args) => ({
    protocol_version: 1,
    id: (args as { request: { id: string } }).request.id,
    ok: true,
    data: [],
  }));
  await expect(request("list_examples")).resolves.toEqual([]);
});

test("never treats an engine rejection as a successful result", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            protocol_version: 1,
            id: "x",
            ok: false,
            error: { message: "Modelo inválido." },
          }),
        ),
    ),
  );
  await expect(request("analyze")).rejects.toThrow("Modelo inválido.");
});

test("rejects a reply associated with a different model request", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            protocol_version: 1,
            id: "wrong-id",
            ok: true,
            data: { outcome: "consistent" },
          }),
        ),
    ),
  );
  await expect(request("analyze")).rejects.toThrow("Resposta incompatível");
});


test("a cancelled native result is discarded and the host queue remains serialized", async () => {
  vi.mocked(isTauri).mockReturnValue(true);
  const controller = new AbortController();
  let release!: () => void;
  const pendingHost = new Promise<void>((resolve) => { release = resolve; });
  vi.mocked(invoke).mockImplementation(async (command, args) => {
    if(command === "cancel_engine_request") return {state:"requested"};
    await pendingHost;
    return { protocol_version: 1, id: (args as { request: { id: string } }).request.id,
      ok: true, data: "result" };
  });
  const cancelled = request("analyze", {}, controller.signal);
  const rejection = expect(cancelled).rejects.toMatchObject({state:"discarded"});
  await Promise.resolve();
  controller.abort();
  const following = request("list_examples");
  await Promise.resolve();
  expect(invoke).toHaveBeenCalledTimes(2);
  expect(invoke).toHaveBeenNthCalledWith(2,"cancel_engine_request",{operationId:expect.any(String)});
  release();
  await rejection;
  await expect(following).resolves.toBe("result");
  expect(invoke).toHaveBeenCalledTimes(3);
});

test("native cancellation is confirmed only by the terminal host response",async()=>{
  vi.mocked(isTauri).mockReturnValue(true);
  const controller=new AbortController();
  let finish!:(value?:unknown)=>void;
  let operationId="";
  vi.mocked(invoke).mockImplementation(async(command,args)=>{
    if(command==="cancel_engine_request") {
      expect(args).toEqual({operationId});
      return {state:"requested"};
    }
    operationId=(args as {request:{id:string}}).request.id;
    await new Promise(resolve=>{finish=resolve;});
    throw "NEXO_CANCELLED";
  });
  const pending=request("analyze",{},controller.signal);
  const rejected=expect(pending).rejects.toMatchObject({state:"confirmed"});
  await Promise.resolve();controller.abort();await Promise.resolve();
  finish();await rejected;
});

test("a cancellation transport failure is not reported as confirmed termination",async()=>{
  vi.mocked(isTauri).mockReturnValue(true);
  const controller=new AbortController();
  let fail!:(error:unknown)=>void;
  vi.mocked(invoke).mockImplementation((command)=>{
    if(command==="cancel_engine_request") return Promise.reject(new Error("IPC failure"));
    return new Promise((_resolve,reject)=>{fail=reject;});
  });
  const pending=request("analyze",{},controller.signal);
  const rejected=expect(pending).rejects.toMatchObject({state:"unconfirmed",name:"NativeCancellationError"});
  await Promise.resolve();controller.abort();fail("termination failed");await rejected;
});

test("unconfirmed termination without a user abort remains an explicit blocked-engine error",async()=>{
  vi.mocked(isTauri).mockReturnValue(true);
  vi.mocked(invoke).mockRejectedValueOnce("NEXO_TERMINATION_UNCONFIRMED");
  await expect(request("analyze")).rejects.toThrow("novas execuções foram bloqueadas");
});

test("an already cancelled request never starts the native engine", async () => {
  vi.mocked(isTauri).mockReturnValue(true);
  const controller = new AbortController();
  controller.abort();
  await expect(request("analyze", {}, controller.signal)).rejects.toThrow();
  expect(invoke).not.toHaveBeenCalled();
});
