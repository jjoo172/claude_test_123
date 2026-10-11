"""Foreign-function and adjacent code-execution hints."""

from __future__ import annotations

import re

from ..model import line_col, make_finding

_BY_LANGUAGE: dict[str, tuple[tuple[re.Pattern[str], str], ...]] = {
    "python": (
        (re.compile(r"\b(?:import\s+ctypes|from\s+ctypes\b|ctypes\s*\.)"), "py.ctypes"),
        (re.compile(r"\b(?:import\s+cffi|from\s+cffi\b|cffi\s*\.)"), "py.cffi"),
        (re.compile(r"\beval\s*\("), "py.eval"),
        (re.compile(r"\bexec\s*\("), "py.exec"),
    ),
    "javascript": (
        (re.compile(r"\beval\s*\("), "js.eval"),
        (re.compile(r"\bnew\s+Function\s*\("), "js.function_ctor"),
        (re.compile(r"""['"](?:ffi-napi|node-ffi|ffi)['"]"""), "js.ffi"),
    ),
    "java": (
        (
            re.compile(r"\bnative\s+(?:[\w.<>,\[\]]+\s+)+\w+\s*\("),
            "java.native",
        ),
        (
            re.compile(r"\bSystem\s*\.\s*loadLibrary\s*\(|\bJNIEXPORT\b|\bJNIEnv\b"),
            "java.jni",
        ),
    ),
    "swift": (
        (
            re.compile(r"\bUnsafe(?:Mutable)?(?:Raw)?(?:Buffer)?Pointer\b"),
            "swift.unsafe_pointer",
        ),
        (re.compile(r"\bUnmanaged\b"), "swift.unmanaged"),
        (re.compile(r"\bunsafeBitCast\s*\("), "swift.unsafe_bitcast"),
    ),
}
_BY_LANGUAGE["typescript"] = _BY_LANGUAGE["javascript"]


def run(path: str, original: str, stripped: str, language: str) -> list[dict[str, object]]:
    findings: list[dict[str, object]] = []
    for pattern, rule_id in _BY_LANGUAGE.get(language, ()):
        for match in pattern.finditer(stripped):
            line, column = line_col(stripped, match.start())
            findings.append(
                make_finding(
                    rule_id,
                    path=path,
                    line=line,
                    column=column,
                    text=original,
                    language=language,
                )
            )
    return findings
