"""JSON-serializable finding records."""

from __future__ import annotations

from .catalog import CATALOG


def line_col(text: str, index: int) -> tuple[int, int]:
    line = text.count("\n", 0, index) + 1
    last_nl = text.rfind("\n", 0, index)
    column = index - last_nl
    return line, column


def snippet(text: str, line: int, context: int = 1) -> str:
    lines = text.splitlines()
    if not lines:
        return ""
    if line < 1:
        line = 1
    if line > len(lines):
        line = len(lines)
    start = max(1, line - context)
    end = min(len(lines), line + context)
    rendered: list[str] = []
    for number in range(start, end + 1):
        raw = lines[number - 1]
        if len(raw) > 240:
            raw = raw[:240] + "…"
        mark = ">" if number == line else " "
        rendered.append(f"{mark} {number}: {raw}")
    return "\n".join(rendered)


def make_finding(
    rule_id: str,
    *,
    path: str,
    line: int,
    column: int,
    text: str,
    language: str,
    kind: str = "finding",
    repo_level: bool = False,
) -> dict[str, object]:
    meta = CATALOG[rule_id]
    return {
        "rule_id": rule_id,
        "severity": meta["severity"],
        "title": meta["title"],
        "explanation": meta["explanation"],
        "safer_alternative": meta["safer_alternative"],
        "language": language,
        "path": path,
        "line": line,
        "column": max(1, column),
        "snippet": snippet(text, line),
        "kind": kind,
        "repo_level": repo_level,
    }


def dedupe(findings: list[dict[str, object]]) -> list[dict[str, object]]:
    seen: set[tuple[object, object, object]] = set()
    unique: list[dict[str, object]] = []
    for finding in findings:
        key = (finding["rule_id"], finding["path"], finding["line"])
        if key in seen:
            continue
        seen.add(key)
        unique.append(finding)
    return unique
