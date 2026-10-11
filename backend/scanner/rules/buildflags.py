"""Dangerous linker and compiler flags in build files."""

from __future__ import annotations

import re

from ..model import line_col, make_finding

_RULES = (
    (re.compile(r"-fno-stack-protector\b"), "repo.no_stack_protector"),
    (
        re.compile(r"-Wl,-z,execstack\b|(?<![\w-])-z[\s,]execstack\b"),
        "repo.execstack",
    ),
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
                    language="build",
                )
            )
    return findings
