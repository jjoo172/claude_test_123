"""Comment stripping and small C-like call parsers. Line breaks are preserved."""

from __future__ import annotations

import re


def normalize(text: str) -> str:
    if text.startswith("\ufeff"):
        text = text[1:]
    return text.replace("\r\n", "\n").replace("\r", "\n")


def strip_c_comments(text: str) -> str:
    """Blank // and /* */ comments. Strings are copied through. //go: lines stay."""
    out: list[str] = []
    i = 0
    n = len(text)
    while i < n:
        ch = text[i]
        if ch in ("'", '"'):
            quote = ch
            out.append(quote)
            i += 1
            while i < n:
                if text[i] == "\\" and i + 1 < n:
                    out.append(text[i])
                    out.append(text[i + 1])
                    i += 2
                    continue
                out.append(text[i])
                if text[i] == quote or text[i] == "\n":
                    i += 1
                    break
                i += 1
            continue
        if text.startswith("//", i):
            line_end = text.find("\n", i)
            if line_end < 0:
                line_end = n
            directive = text[i:line_end]
            if directive.startswith("//go:"):
                out.append(directive)
            else:
                out.append(" " * (line_end - i))
            i = line_end
            continue
        if text.startswith("/*", i):
            out.append("  ")
            i += 2
            while i < n and not text.startswith("*/", i):
                out.append("\n" if text[i] == "\n" else " ")
                i += 1
            if i < n:
                out.append("  ")
                i += 2
            continue
        out.append(ch)
        i += 1
    return "".join(out)


def strip_hash_comments(text: str) -> str:
    """Blank # comments, including triple-quoted strings in Python."""
    out: list[str] = []
    i = 0
    n = len(text)
    while i < n:
        ch = text[i]
        if ch in ("'", '"'):
            if text.startswith(ch * 3, i):
                quote = ch * 3
                out.append(quote)
                i += 3
                while i < n and not text.startswith(quote, i):
                    out.append(text[i])
                    i += 1
                if i < n:
                    out.append(quote)
                    i += 3
                continue
            out.append(ch)
            i += 1
            while i < n:
                if text[i] == "\\" and i + 1 < n:
                    out.append(text[i])
                    out.append(text[i + 1])
                    i += 2
                    continue
                out.append(text[i])
                if text[i] == ch or text[i] == "\n":
                    i += 1
                    break
                i += 1
            continue
        if ch == "#":
            line_end = text.find("\n", i)
            if line_end < 0:
                line_end = n
            out.append(" " * (line_end - i))
            i = line_end
            continue
        out.append(ch)
        i += 1
    return "".join(out)


def strip_for_language(language: str, text: str) -> str:
    if language in ("python", "build"):
        return strip_hash_comments(text)
    return strip_c_comments(text)


def extract_args(text: str, open_paren: int) -> str | None:
    """Return the inside of the call whose '(' is at open_paren."""
    if open_paren < 0 or open_paren >= len(text) or text[open_paren] != "(":
        return None
    depth = 0
    in_string: str | None = None
    start = open_paren + 1
    i = open_paren
    while i < len(text):
        ch = text[i]
        if in_string:
            if ch == "\\" and i + 1 < len(text):
                i += 2
                continue
            if ch == in_string:
                in_string = None
            i += 1
            continue
        if ch in ("'", '"'):
            in_string = ch
        elif ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
            if depth == 0:
                return text[start:i]
        i += 1
    return None


def split_args(arglist: str) -> list[str]:
    args: list[str] = []
    depth = 0
    in_string: str | None = None
    buf: list[str] = []
    i = 0
    while i < len(arglist):
        ch = arglist[i]
        if in_string:
            buf.append(ch)
            if ch == "\\" and i + 1 < len(arglist):
                buf.append(arglist[i + 1])
                i += 2
                continue
            if ch == in_string:
                in_string = None
            i += 1
            continue
        if ch in ("'", '"'):
            in_string = ch
            buf.append(ch)
        elif ch in "([{":
            depth += 1
            buf.append(ch)
        elif ch in ")]}":
            depth -= 1
            buf.append(ch)
        elif ch == "," and depth == 0:
            args.append("".join(buf).strip())
            buf = []
        else:
            buf.append(ch)
        i += 1
    tail = "".join(buf).strip()
    if tail:
        args.append(tail)
    return args


_CONST_CAST = re.compile(
    r"\(\s*(?:size_t|unsigned(?:\s+long|\s+int)?|int|long|uint\d+_t|int\d+_t|ssize_t)\s*\)"
)
_SIZEOF = re.compile(r"\bsizeof\s*(?:\([^)]*\)|\w+)")
_CONST_EXPR = re.compile(r"^[\d\s+\-*/()xXa-fA-FuUlL]+$")
_MACRO = re.compile(r"^[A-Z_][A-Z0-9_]*$")


def is_constant_length(expr: str) -> bool:
    cleaned = _CONST_CAST.sub("", expr.strip())
    cleaned = _SIZEOF.sub("0", cleaned).strip()
    if not cleaned:
        return False
    if _MACRO.fullmatch(cleaned):
        return True
    return _CONST_EXPR.fullmatch(cleaned) is not None
