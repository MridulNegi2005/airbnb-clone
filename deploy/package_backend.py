"""Package only the backend files needed by its production Docker build."""

from __future__ import annotations

import argparse
import hashlib
import tarfile
from pathlib import Path


def production_files(backend: Path) -> list[Path]:
    required = ["Dockerfile", ".dockerignore", "requirements.txt", "alembic.ini", "compose.yaml"]
    files = [backend / name for name in required]
    for file in files:
        if not file.is_file():
            raise FileNotFoundError(f"Required deployment file is missing: {file.name}")
    for directory in ("app", "migrations"):
        files.extend(
            file
            for file in (backend / directory).rglob("*")
            if file.is_file()
            and "__pycache__" not in file.parts
            and file.suffix in {".py", ".mako"}
        )
    optional_gcs = backend / "compose.gcs.yaml"
    if optional_gcs.is_file():
        files.append(optional_gcs)
    for file in files:
        if file.is_symlink() or not file.resolve().is_relative_to(backend.resolve()):
            raise ValueError(f"Deployment files must stay within backend: {file.name}")
    return sorted(set(files))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True, help="Destination .tar.gz outside the source tree")
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    output = args.output.resolve()
    if output.is_relative_to(root):
        parser.error("Put deployment archives outside the project to avoid committing generated artifacts.")
    files = production_files(root / "backend")
    output.parent.mkdir(parents=True, exist_ok=True)
    with tarfile.open(output, "w:gz") as archive:
        for file in files:
            archive.add(file, arcname=file.relative_to(root / "backend").as_posix(), recursive=False)
    digest = hashlib.sha256(output.read_bytes()).hexdigest()
    print(f"Archive: {output}\nFiles: {len(files)}\nSHA256: {digest}")


if __name__ == "__main__":
    main()
