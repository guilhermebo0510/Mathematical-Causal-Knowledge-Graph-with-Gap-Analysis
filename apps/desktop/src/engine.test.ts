import { afterEach, expect, test, vi } from "vitest";
import { request } from "./engine";

vi.mock("@tauri-apps/api/core", () => ({
  isTauri: () => false,
  invoke: vi.fn(),
}));
afterEach(() => vi.unstubAllGlobals());

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
