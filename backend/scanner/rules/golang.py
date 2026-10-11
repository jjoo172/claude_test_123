"""Go unsafe, cgo, and linkname heuristics."""

from __future__ import annotations

import re

from ..model import line_col, make_finding

_POINTER = re.compile(r"\bunsafe\s*\.\s*Pointer\b")
_SLICE = re.compile(r"\bunsafe\s*\.\s*Slice\b")
_HEADER = re.compile(r"\breflect\s*\.\s*(?:SliceHeader|StringHeader)\b")
_LINKNAME = re.compile(r"(?m)^\s*//go:linkname\b")
_CGO = re.compile(r'(?m)^\s*import\s+(?:\.\s+)?"C"\s*$|^\s*"C"\s*$')


def _add(findings: list[dict[str, object]], rule_id: str, path: str, index: int, source: str, original: str) -> None:
    line, column = line_col(source, index)
    findings.append(
        make_finding(
            rule_id,
            path=path,
            line=line,
            column=column,
            text=original,
            language="go",
        )
    )


def run(path: str, original: str, stripped: str, language: str) -> list[dict[str, object]]:
    del language
    findings: list[dict[str, object]] = []
    for pattern, rule_id in (
        (_POINTER, "go.unsafe_pointer"),
        (_SLICE, "go.unsafe_slice"),
        (_HEADER, "go.slice_header"),
        (_CGO, "go.cgo"),
    ):
        for match in pattern.finditer(stripped):
            _add(findings, rule_id, path, match.start(), stripped, original)
    for match in _LINKNAME.finditer(original):
        _add(findings, "go.linkname", path, match.start(), original, original)
    return findings
