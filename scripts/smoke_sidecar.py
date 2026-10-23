"""Exercise the packaged binary, including numeric results; no system Python inside child."""

import json
import os
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]


def main() -> None:
    target = subprocess.check_output(["rustc", "--print", "host-tuple"], text=True).strip()
    extension = ".exe" if sys.platform == "win32" else ""
    binary = ROOT / "apps/desktop/src-tauri/binaries" / f"knowledge-engine-{target}{extension}"
    environment = {
        key: value
        for key, value in os.environ.items()
        if not key.startswith(("PYTHON", "VIRTUAL_ENV"))
    }

    def request(operation: str, **fields) -> dict:
        payload = {"protocol_version": 1, "id": "smoke", "operation": operation, **fields}
        completed = subprocess.run(
            [str(binary)],
            input=json.dumps(payload) + "\n",
            text=True,
            encoding="utf-8",
            capture_output=True,
            check=True,
            timeout=15,
            cwd=binary.parent,
            env=environment,
        )
        response = json.loads(completed.stdout)
        assert response["ok"], response
        assert response["id"] == "smoke"
        return response["data"]

    for name, power, failures in (("complete", 2200, 0), ("missing_air", 1000, 2)):
        loaded = request("load_example", example_id=name)
        run = request("analyze", model=loaded["model"])
        assert run["values"]["P_total"]["value"] == power, run
        assert run["counts"]["failed"] == failures, run
        print(f"{name}: {power} W; {failures} achados; sidecar aprovado.")


if __name__ == "__main__":
    main()
