"""C# unsafe and interop heuristics."""

from __future__ import annotations

import re

from ..model import line_col, make_finding

_RULES = (
    (re.compile(r"\bunsafe\b"), "cs.unsafe"),
    (re.compile(r"\bfixed\b"), "cs.fixed"),
    (re.compile(r"\bstackalloc\b"), "cs.stackalloc"),
    (re.compile(r"\bMarshal\s*\."), "cs.marshal"),
    (re.compile(r"\bDllImport\s*\("), "cs.dllimport"),
)


def run(path: str, original: str, stripped: str, language: str) -> list[dict[str, object]]:
    del language
    findings: list[dict[str, object]] = []
    for pattern, rule_id in _RULES:
        for match in pattern.finditer(stripped):
            line, column = line_col(stripped, match.start())
            findings.append(
                make_finding(
                    rule_id,
                    path=path,
                    line=line,
                    column=column,
                    text=original,
                    language="csharp",
                )
            )
    return findings
