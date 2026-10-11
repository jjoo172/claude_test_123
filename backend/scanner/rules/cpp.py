"""C and C++ memory-safety heuristics."""

from __future__ import annotations

import re

from ..model import line_col, make_finding
from ..textutil import extract_args, is_constant_length, split_args

_GETS = re.compile(r"\bgets\s*\(")
_STRCPY = re.compile(r"\b(?:strcpy|strcat|sprintf|vsprintf)\s*\(")
_SCANF = re.compile(r"\b(scanf|fscanf|sscanf|vscanf|vfscanf|vsscanf)\s*\(")
_SCANF_FORMAT_INDEX = {
    "scanf": 0,
    "vscanf": 0,
    "fscanf": 1,
    "sscanf": 1,
    "vfscanf": 1,
    "vsscanf": 1,
}
_UNBOUNDED_S = re.compile(r"%(?!\*)(?!\d+)(?:hh|ll|[hljztL])?s")
_STRNCPY = re.compile(r"\bstrncpy\s*\(")
_NULL_HINT = re.compile(r"""\[[^\]]*\]\s*=\s*(?:'\\0'|0)\s*;""")
_ALLOCA = re.compile(r"\b(?:__builtin_alloca|_alloca|alloca)\s*\(")
_MEMCPY = re.compile(r"\b(memcpy|memmove)\s*\(")
_ALLOC = re.compile(r"\b(malloc|realloc|calloc)\s*\(")
_PROTO_ARG = re.compile(r"^\s*(?:void|size_t|int|unsigned|char|const|struct)\b")
_STACK_BUF = re.compile(r"\bchar\s+(\w+)\s*\[\s*(?:\d+|[A-Z_][A-Z0-9_]*)\s*\]")
_INPUT_CALL = re.compile(
    r"\b(?:gets|scanf|fscanf|sscanf|vscanf|vfscanf|vsscanf|read|recv|strcpy|strcat|sprintf|vsprintf)\s*\("
)
_COMMAND = re.compile(r"\b(?:_wsystem|system|_popen|popen)\s*\(")
_CHAR_PTR = re.compile(
    r"\b(?:const\s+|unsigned\s+|signed\s+)?char\s*\*+\s*(?:const\s+)?(\w+)"
)
_FREE = re.compile(r"\bfree\s*\(\s*(\w+)\s*\)")
_PRAGMA_PACK = re.compile(r"#\s*pragma\s+pack\b")
_UNALIGNED = re.compile(
    r"\(\s*(?:uint(?:16|32|64)_t|int(?:16|32|64)_t|int|short|long|float|double|size_t)\s*\*\s*\)\s*"
    r"\([^)]*\+[^)]*\)"
)
_REINTERPRET = re.compile(r"\breinterpret_cast\s*<")
_NEW_ARRAY = re.compile(r"\b(\w+)\s*=\s*new\s+(?>[\w:<>]+)\s*\[")
_NEW_SCALAR = re.compile(r"\b(\w+)\s*=\s*new\s+(?>[\w:<>]+)(?!\s*\[)")
_DELETE = re.compile(r"\bdelete\s*(\[\])?\s*(\w+)")


def _add(findings: list[dict[str, object]], rule_id: str, path: str, index: int, stripped: str, original: str, language: str) -> None:
    line, column = line_col(stripped, index)
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


def _null_checked(line: str, var: str) -> bool:
    name = re.escape(var)
    patterns = (
        rf"\bif\s*\(\s*!\s*{name}\b",
        rf"\b{name}\s*==\s*(?:NULL|nullptr|0)\b",
        rf"\b(?:NULL|nullptr)\s*==\s*{name}\b",
        rf"\b{name}\s*!=\s*(?:NULL|nullptr)\b",
        rf"\bif\s*\(\s*{name}\s*\)",
    )
    return any(re.search(pattern, line) for pattern in patterns)


def _char_pointer_names(stripped: str) -> set[str]:
    names = set(_CHAR_PTR.findall(stripped))
    for line in stripped.splitlines():
        if not re.search(r"\bchar\s*\*", line):
            continue
        names.update(re.findall(r",\s*\*+\s*(\w+)", line))
    return names


def run(path: str, original: str, stripped: str, language: str) -> list[dict[str, object]]:
    findings: list[dict[str, object]] = []
    lines = stripped.splitlines()

    for match in _GETS.finditer(stripped):
        _add(findings, "cpp.gets", path, match.start(), stripped, original, language)

    for match in _STRCPY.finditer(stripped):
        _add(findings, "cpp.strcpy_family", path, match.start(), stripped, original, language)

    for match in _SCANF.finditer(stripped):
        open_paren = match.end() - 1
        args = extract_args(stripped, open_paren)
        if args is None:
            continue
        parts = split_args(args)
        index = _SCANF_FORMAT_INDEX[match.group(1)]
        if index >= len(parts):
            continue
        literals = re.findall(r'"((?:\\.|[^"\\])*)"', parts[index])
        if not literals:
            continue
        if any(_UNBOUNDED_S.search(literal.replace("%%", "")) for literal in literals):
            _add(findings, "cpp.scanf_unbounded", path, match.start(), stripped, original, language)

    for match in _STRNCPY.finditer(stripped):
        line, _column = line_col(stripped, match.start())
        window = "\n".join(lines[line - 1 : line - 1 + 5])
        if _NULL_HINT.search(window):
            continue
        _add(findings, "cpp.strncpy_unterminated", path, match.start(), stripped, original, language)

    for match in _ALLOCA.finditer(stripped):
        _add(findings, "cpp.alloca", path, match.start(), stripped, original, language)

    for match in _MEMCPY.finditer(stripped):
        args = extract_args(stripped, match.end() - 1)
        if args is None:
            continue
        parts = split_args(args)
        if len(parts) < 3:
            continue
        if is_constant_length(parts[-1]):
            continue
        _add(findings, "cpp.memcpy_nonconst", path, match.start(), stripped, original, language)

    for match in _ALLOC.finditer(stripped):
        args = extract_args(stripped, match.end() - 1)
        if args is None or _PROTO_ARG.match(args):
            continue
        line, _column = line_col(stripped, match.start())
        line_text = lines[line - 1] if line - 1 < len(lines) else ""
        assigned = re.search(
            r"\b(\w+)\s*=(?!=)[^=;\n]*\b(?:malloc|realloc|calloc)\s*\(",
            line_text,
        )
        if assigned and any(
            _null_checked(text, assigned.group(1)) for text in lines[line - 1 : line - 1 + 8]
        ):
            continue
        _add(findings, "cpp.malloc_unchecked", path, match.start(), stripped, original, language)

    for match in _STACK_BUF.finditer(stripped):
        buf = match.group(1)
        decl_line, _column = line_col(stripped, match.start())
        for call in _INPUT_CALL.finditer(stripped):
            call_line, _column = line_col(stripped, call.start())
            if call_line < decl_line:
                continue
            args = extract_args(stripped, call.end() - 1)
            if args is None or not re.search(rf"\b{re.escape(buf)}\b", args):
                continue
            _add(findings, "cpp.stack_buffer_input", path, call.start(), stripped, original, language)
            break

    for match in _COMMAND.finditer(stripped):
        _add(findings, "cpp.command_injection", path, match.start(), stripped, original, language)

    for name in _char_pointer_names(stripped):
        arith = re.compile(
            rf"\b{re.escape(name)}\s*(?:\+\+|--|\+=|-=|\+(?!=)|-(?!=|>))"
        )
        for match in arith.finditer(stripped):
            _add(findings, "cpp.char_ptr_arith", path, match.start(), stripped, original, language)

    for match in _FREE.finditer(stripped):
        var = match.group(1)
        line, _column = line_col(stripped, match.start())
        name = re.escape(var)
        for rel, text_line in enumerate(lines[line : line + 10], start=1):
            if re.search(rf"(?<![\w*]){name}\s*=(?!=)", text_line):
                break
            reused = (
                re.search(rf"(?<![\w])\*\s*{name}\b", text_line)
                or re.search(rf"\b{name}\s*->", text_line)
                or re.search(rf"\b{name}\s*\[", text_line)
            )
            if reused:
                use_at = sum(len(lines[i]) + 1 for i in range(line + rel - 1))
                _add(findings, "cpp.use_after_free", path, use_at, stripped, original, language)
                break

    for match in _PRAGMA_PACK.finditer(stripped):
        _add(findings, "cpp.pragma_pack", path, match.start(), stripped, original, language)

    for match in _UNALIGNED.finditer(stripped):
        _add(findings, "cpp.unaligned_cast", path, match.start(), stripped, original, language)

    for match in _REINTERPRET.finditer(stripped):
        _add(findings, "cpp.reinterpret_cast", path, match.start(), stripped, original, language)

    alloc_kind: dict[str, str] = {}
    for line_number, text_line in enumerate(lines, start=1):
        for match in _NEW_ARRAY.finditer(text_line):
            alloc_kind[match.group(1)] = "array"
        for match in _NEW_SCALAR.finditer(text_line):
            alloc_kind[match.group(1)] = "scalar"
        for match in _DELETE.finditer(text_line):
            is_array_delete = match.group(1) is not None
            var = match.group(2)
            kind = alloc_kind.get(var)
            if kind == "array" and not is_array_delete or kind == "scalar" and is_array_delete:
                use_at = sum(len(lines[i]) + 1 for i in range(line_number - 1)) + match.start()
                _add(findings, "cpp.new_delete_mismatch", path, use_at, stripped, original, language)

    return findings
