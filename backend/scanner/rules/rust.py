"""Rust unsafe-code heuristics."""

from __future__ import annotations

import re

from ..model import line_col, make_finding

_UNSAFE = re.compile(r"\bunsafe\b")
_TRANSMUTE = re.compile(r"\btransmute(?:_copy)?\b")
_RAW_PARTS = re.compile(r"\bfrom_raw_parts(?:_mut)?\b")
_GET_UNCHECKED = re.compile(r"\bget_unchecked(?:_mut)?\b")
_SET_LEN = re.compile(r"\bset_len\s*\(")
_ALLOW = re.compile(r"#\s*!\s*\[\s*allow\s*\(\s*unsafe_code\s*\)|#\[\s*allow\s*\(\s*unsafe_code\s*\)")
_FORBID = re.compile(r"#\s*!\s*\[\s*forbid\s*\(\s*unsafe_code\s*\)")
_PTR_NAME = re.compile(r"\b(\w+)\s*:\s*\*(?:const|mut)\b")
_DEREF = re.compile(r"(?<![\w])\*(?![\s*=/])(\w+)\b")


def _add(
    findings: list[dict[str, object]],
    rule_id: str,
    path: str,
    index: int,
    stripped: str,
    original: str,
    *,
    kind: str = "finding",
) -> None:
    line, column = line_col(stripped, index)
    findings.append(
        make_finding(
            rule_id,
            path=path,
            line=line,
            column=column,
            text=original,
            language="rust",
            kind=kind,
        )
    )


def _unsafe_spans(text: str) -> list[tuple[int, int]]:
    spans: list[tuple[int, int]] = []
    for match in _UNSAFE.finditer(text):
        brace = text.find("{", match.end())
        if brace < 0 or ";" in text[match.end() : brace]:
            continue
        depth = 0
        for index in range(brace, len(text)):
            char = text[index]
            if char == "{":
                depth += 1
            elif char == "}":
                depth -= 1
                if depth == 0:
                    spans.append((brace, index))
                    break
    return spans


def run(path: str, original: str, stripped: str, language: str) -> list[dict[str, object]]:
    del language
    findings: list[dict[str, object]] = []

    for match in _UNSAFE.finditer(stripped):
        _add(findings, "rust.unsafe", path, match.start(), stripped, original)
    for match in _TRANSMUTE.finditer(stripped):
        _add(findings, "rust.transmute", path, match.start(), stripped, original)
    for match in _RAW_PARTS.finditer(stripped):
        _add(findings, "rust.from_raw_parts", path, match.start(), stripped, original)
    for match in _GET_UNCHECKED.finditer(stripped):
        _add(findings, "rust.get_unchecked", path, match.start(), stripped, original)
    for match in _SET_LEN.finditer(stripped):
        _add(findings, "rust.set_len", path, match.start(), stripped, original)
    for match in _ALLOW.finditer(stripped):
        _add(findings, "rust.allow_unsafe_code", path, match.start(), stripped, original)
    for match in _FORBID.finditer(stripped):
        _add(findings, "rust.forbid_unsafe_code", path, match.start(), stripped, original, kind="note")

    names = set(_PTR_NAME.findall(stripped))
    spans = _unsafe_spans(stripped)
    if names and spans:
        for match in _DEREF.finditer(stripped):
            if match.group(1) not in names:
                continue
            start = match.start()
            if any(begin <= start <= end for begin, end in spans):
                _add(findings, "rust.raw_ptr_deref", path, start, stripped, original)

    return findings
