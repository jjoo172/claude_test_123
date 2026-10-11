"""Heuristic memory-safety scanner. Pure stdlib, runs under Pyodide and CPython."""

from .scan import scan_file, scan_repo

__all__ = ["scan_file", "scan_repo"]
