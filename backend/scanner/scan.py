"""Public scan API: ``scan_file`` and ``scan_repo``."""

from __future__ import annotations

from .catalog import SEVERITY_RANK
from .languages import detect_language
from .model import dedupe, make_finding
from .rules import buildflags, cpp, csharp, ffi, golang, rust
from .textutil import normalize, strip_for_language

_RUNNERS = {
    "c": (cpp.run,),
    "cpp": (cpp.run,),
    "rust": (rust.run,),
    "go": (golang.run,),
    "csharp": (csharp.run,),
    "python": (ffi.run,),
    "javascript": (ffi.run,),
    "typescript": (ffi.run,),
    "java": (ffi.run,),
    "swift": (ffi.run,),
    "build": (buildflags.run,),
}


def scan_file(path: str, text: str) -> list[dict[str, object]]:
    """Return findings (and positive notes) for one source file."""
    language = detect_language(path)
    if language is None:
        return []
    original = normalize(text or "")
    stripped = strip_for_language(language, original)
    findings: list[dict[str, object]] = []
    for runner in _RUNNERS.get(language, ()):
        findings.extend(runner(path, original, stripped, language))
    findings = dedupe(findings)
    findings.sort(
        key=lambda item: (
            int(item["line"]),  # type: ignore[arg-type]
            SEVERITY_RANK.get(str(item["severity"]), 9),
            str(item["rule_id"]),
        )
    )
    return findings


def scan_repo(files: list[dict[str, str]]) -> dict[str, object]:
    """Scan ``[{"path", "text"}, ...]`` and return a JSON-serializable report."""
    if not isinstance(files, list):
        raise TypeError("files must be a list of {path, text} objects")

    findings: list[dict[str, object]] = []
    notes: list[dict[str, object]] = []
    languages: dict[str, int] = {}
    first_c_family: str | None = None

    for item in files:
        if not isinstance(item, dict):
            continue
        path = str(item.get("path") or "<unknown>")
        text = item.get("text") or ""
        if not isinstance(text, str):
            text = str(text)
        language = detect_language(path)
        if language:
            languages[language] = languages.get(language, 0) + 1
            if first_c_family is None and language in ("c", "cpp"):
                first_c_family = path
        for found in scan_file(path, text):
            if found.get("kind") == "note":
                notes.append(found)
            else:
                findings.append(found)

    if first_c_family is not None:
        signal = make_finding(
            "repo.c_cpp_sources",
            path=first_c_family,
            line=1,
            column=1,
            text="",
            language="repo",
            repo_level=True,
        )
        signal["snippet"] = "(repository signal — not a specific vulnerable line)"
        findings.append(signal)

    findings.sort(
        key=lambda item: (
            SEVERITY_RANK.get(str(item["severity"]), 9),
            str(item["path"]),
            int(item["line"]),  # type: ignore[arg-type]
            str(item["rule_id"]),
        )
    )
    counts = {"high": 0, "medium": 0, "low": 0}
    for found in findings:
        severity = str(found["severity"])
        if severity in counts:
            counts[severity] += 1

    return {
        "files_scanned": len(files),
        "findings": findings,
        "notes": notes,
        "languages": languages,
        "counts": counts,
    }
