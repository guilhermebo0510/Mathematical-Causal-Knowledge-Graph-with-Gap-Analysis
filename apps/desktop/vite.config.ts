import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Development only: runs the same real engine used by the desktop sidecar.
// This plugin is not part of the built frontend and never executes uploaded code.
function localEngine(): Plugin {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  return {
    name: "local-python-engine",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__engine", (req, res) => {
        if (req.method !== "POST") {
          res.writeHead(405).end();
          return;
        }
        if (
          req.headers.origin &&
          req.headers.origin !== `http://${req.headers.host}`
        ) {
          res.writeHead(403).end();
          return;
        }
        let size = 0;
        const chunks: Buffer[] = [];
        req.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > 256_000) {
            res.writeHead(413).end();
            req.destroy();
          } else chunks.push(chunk);
        });
        req.on("end", () => {
          if (size > 256_000) return;
          let request: unknown;
          try {
            request = JSON.parse(Buffer.concat(chunks).toString());
          } catch {
            res.writeHead(400).end();
            return;
          }
          const python = path.join(
            root,
            ".venv",
            process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
          );
          const child = spawn(python, ["-m", "knowledge_engine.protocol"], {
            cwd: root,
            stdio: ["pipe", "pipe", "pipe"],
          });
          let output = "";
          let finished = false;
          function finish(status: number, body: string) {
            if (finished) return;
            finished = true;
            clearTimeout(timer);
            res.writeHead(status, {
              "Content-Type": "application/json",
              "Cache-Control": "no-store",
            });
            res.end(body);
          }
          const timer = setTimeout(() => {
            child.kill("SIGKILL");
            finish(
              504,
              JSON.stringify({
                error: "O motor excedeu o limite de 15 segundos.",
              }),
            );
          }, 15_000);
          res.on("close", () => {
            if (!finished) child.kill("SIGKILL");
          });
          child.stdout.on("data", (data: Buffer) => {
            output += data.toString();
            if (Buffer.byteLength(output) > 1_000_000) {
              child.kill("SIGKILL");
              finish(
                502,
                JSON.stringify({ error: "Resposta excede o limite." }),
              );
            }
          });
          child.stdin.on("error", () => {});
          child.stderr.resume();
          child.on("error", () =>
            finish(
              503,
              JSON.stringify({ error: "Motor indisponível. Execute uv sync." }),
            ),
          );
          child.on("close", (code) =>
            finish(
              code === 0 ? 200 : 502,
              output || JSON.stringify({ error: "Falha no motor." }),
            ),
          );
          child.stdin.end(JSON.stringify(request) + "\n");
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), localEngine()],
  clearScreen: false,
  server: { watch: { ignored: ["**/src-tauri/**"] } },
});
