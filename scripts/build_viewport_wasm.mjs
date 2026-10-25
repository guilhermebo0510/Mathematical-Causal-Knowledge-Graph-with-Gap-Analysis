import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const manifest = path.join(root, "packages", "viewport-core", "Cargo.toml");
const wasmSource = path.join(
  root,
  "packages",
  "viewport-core",
  "target",
  "wasm32-unknown-unknown",
  "release",
  "viewport_core.wasm",
);
const wasmDestDir = path.join(root, "apps", "desktop", "public", "wasm");
const wasmDest = path.join(wasmDestDir, "viewport_core.wasm");

execFileSync(
  "cargo",
  [
    "build",
    "--locked",
    "--manifest-path",
    manifest,
    "--target",
    "wasm32-unknown-unknown",
    "--release",
  ],
  { stdio: "inherit", cwd: root },
);

mkdirSync(wasmDestDir, { recursive: true });
copyFileSync(wasmSource, wasmDest);
const size = statSync(wasmDest).size;
console.log(`Built Rust WASM viewport: ${wasmDest} (${size} bytes)`);
