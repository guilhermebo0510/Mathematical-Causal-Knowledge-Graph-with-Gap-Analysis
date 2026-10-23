"""Build the Python sidecar for this host; PyInstaller is not a cross-compiler."""

import pathlib
import shutil
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]


def main() -> None:
    target = subprocess.check_output(["rustc", "--print", "host-tuple"], text=True).strip()
    output = ROOT / "build" / "sidecar"
    subprocess.run(
        [
            sys.executable,
            "-m",
            "PyInstaller",
            "--noconfirm",
            "--clean",
            "--onefile",
            "--name",
            "knowledge-engine",
            "--paths",
            str(ROOT / "services" / "engine"),
            "--distpath",
            str(output),
            "--workpath",
            str(ROOT / "build" / "pyinstaller"),
            "--specpath",
            str(ROOT / "build"),
            "--collect-all",
            "pint",
            "--collect-all",
            "flexparser",
            str(ROOT / "services" / "engine" / "entrypoint.py"),
        ],
        check=True,
        cwd=ROOT,
    )
    extension = ".exe" if sys.platform == "win32" else ""
    binary = output / f"knowledge-engine{extension}"
    destination = ROOT / "apps" / "desktop" / "src-tauri" / "binaries"
    destination.mkdir(parents=True, exist_ok=True)
    packaged = destination / f"knowledge-engine-{target}{extension}"
    shutil.copy2(binary, packaged)
    print(f"Sidecar preparado: {packaged.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
