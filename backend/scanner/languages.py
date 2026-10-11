"""Language detection from file path. The map lives in manifest.json."""

from __future__ import annotations

import json
from pathlib import Path

_MANIFEST = json.loads((Path(__file__).with_name("manifest.json")).read_text(encoding="utf-8"))

EXTENSION_LANGUAGES: dict[str, str] = {
    ext.lower(): lang for ext, lang in _MANIFEST["extension_languages"].items()
}
FILENAME_LANGUAGES: dict[str, str] = {
    name.lower(): lang for name, lang in _MANIFEST["filename_languages"].items()
}
VENDORED_DIRECTORIES: tuple[str, ...] = tuple(_MANIFEST["vendored_directories"])


def detect_language(path: str) -> str | None:
    normalized = path.replace("\\", "/").rstrip("/")
    if not normalized:
        return None
    name = normalized.rsplit("/", 1)[-1]
    by_name = FILENAME_LANGUAGES.get(name.lower())
    if by_name:
        return by_name
    dot = name.rfind(".")
    if dot <= 0:
        return None
    return EXTENSION_LANGUAGES.get(name[dot:].lower())
