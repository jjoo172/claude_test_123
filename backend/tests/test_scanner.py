"""Positive and negative cases for every scanner rule.

Run from the repo root:

    python3 -m unittest discover -s backend/tests -v
"""

from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scanner.catalog import CATALOG  # noqa: E402
from scanner.languages import detect_language  # noqa: E402
from scanner.scan import scan_file, scan_repo  # noqa: E402

# (rule_id, path, positive source, negative source, note?)
CASES: list[tuple[str, str, str, str, bool]] = [
    (
        "cpp.gets",
        "a.c",
        "int x;\ngets(buf);\n",
        "int x;\nfgets(buf, 8, stdin);\n",
        False,
    ),
    (
        "cpp.strcpy_family",
        "a.c",
        "strcpy(d, s);\nstrcat(d, s);\nsprintf(d, \"%s\", s);\nvsprintf(d, \"%s\", ap);\n",
        "snprintf(d, sizeof d, \"%s\", s);\nstrncpy(d, s, n);\nd[n - 1] = '\\0';\nstrncat(d, s, n);\nvsnprintf(d, n, \"%s\", ap);\n",
        False,
    ),
    (
        "cpp.scanf_unbounded",
        "a.c",
        "scanf(\"%s\", buf);\nfscanf(fp, \"%s\", buf);\n",
        "scanf(\"%15s\", buf);\nscanf(\"%d\", &n);\nscanf(fmt, buf);\n",
        False,
    ),
    (
        "cpp.strncpy_unterminated",
        "a.c",
        "void f(char *d, const char *s, unsigned n) {\n    strncpy(d, s, n);\n}\n",
        "void f(char *d, const char *s, unsigned n) {\n    strncpy(d, s, n);\n    d[n - 1] = '\\0';\n}\n",
        False,
    ),
    (
        "cpp.alloca",
        "a.c",
        "void *p = alloca(n);\n",
        "void f(void) {\n    char *p = malloc(32);\n    if (p == NULL) return;\n}\n",
        False,
    ),
    (
        "cpp.memcpy_nonconst",
        "a.c",
        "memcpy(d, s, n);\nmemmove(a, b, len);\n",
        "memcpy(d, s, sizeof(d));\nmemmove(a, b, 16);\n",
        False,
    ),
    (
        "cpp.malloc_unchecked",
        "a.c",
        "char *p = malloc(32);\nuse(p);\n",
        "char *p = malloc(32);\nif (p == NULL) return;\n",
        False,
    ),
    (
        "cpp.stack_buffer_input",
        "a.c",
        "void f(void) {\n    char buf[32];\n    read(0, buf, 128);\n}\n",
        "void f(void) {\n    char buf[32];\n    fgets(buf, sizeof(buf), stdin);\n}\n",
        False,
    ),
    (
        "cpp.command_injection",
        "a.c",
        "system(cmd);\npopen(cmd, \"r\");\n",
        "int subsystem(int x) { return x; }\n",
        False,
    ),
    (
        "cpp.char_ptr_arith",
        "a.c",
        "void f(char *s) {\n    char *p = s;\n    p++;\n}\n",
        "void f(void) {\n    char *p = \"hello\";\n    puts(p);\n}\n",
        False,
    ),
    (
        "cpp.use_after_free",
        "a.c",
        "void f(char *p) {\n    free(p);\n    *p = 0;\n}\n",
        "void f(char *p) {\n    free(p);\n    p = NULL;\n}\n",
        False,
    ),
    (
        "cpp.pragma_pack",
        "a.h",
        "#pragma pack(1)\nstruct S { char a; int b; };\n",
        "#pragma once\nstruct S { char a; int b; };\n",
        False,
    ),
    (
        "cpp.unaligned_cast",
        "a.c",
        "int x = *(int *)(buf + 1);\n",
        "int v = (int)*p;\nint *q = (int *)p;\n",
        False,
    ),
    (
        "cpp.reinterpret_cast",
        "a.cpp",
        "auto p = reinterpret_cast<char *>(x);\n",
        "auto p = static_cast<int>(x);\n",
        False,
    ),
    (
        "cpp.new_delete_mismatch",
        "a.cpp",
        "int *p = new int[3];\ndelete p;\n",
        "int *p = new int[3];\ndelete[] p;\nint *q = new int;\ndelete q;\n",
        False,
    ),
    (
        "rust.unsafe",
        "a.rs",
        "fn f() {\n    unsafe { let x = 1; }\n}\n",
        "fn f() { let x = 1; }\n",
        False,
    ),
    (
        "rust.transmute",
        "a.rs",
        "let x = std::mem::transmute::<u32, i32>(n);\nlet y = mem::transmute_copy::<u32, i32>(&n);\n",
        "fn convert(n: i32) -> i32 { n }\n",
        False,
    ),
    (
        "rust.from_raw_parts",
        "a.rs",
        "let s = std::slice::from_raw_parts(p, n);\nlet t = from_raw_parts_mut(p, n);\n",
        "let s = slice::from_ref(&x);\n",
        False,
    ),
    (
        "rust.get_unchecked",
        "a.rs",
        "let x = v.get_unchecked(i);\nlet y = v.get_unchecked_mut(i);\n",
        "let x = v.get(i);\n",
        False,
    ),
    (
        "rust.set_len",
        "a.rs",
        "v.set_len(n);\n",
        "let n = v.len();\nv.set_length(n);\n",
        False,
    ),
    (
        "rust.allow_unsafe_code",
        "a.rs",
        "#![allow(unsafe_code)]\nfn f() {}\n",
        "#![forbid(unsafe_code)]\nfn f() {}\n",
        False,
    ),
    (
        "rust.raw_ptr_deref",
        "a.rs",
        "fn f(p: *const u8) -> u8 {\n    unsafe { *p }\n}\n",
        "fn f(a: i32, b: i32) -> i32 {\n    unsafe { a * b }\n}\n",
        False,
    ),
    (
        "rust.forbid_unsafe_code",
        "a.rs",
        "#![forbid(unsafe_code)]\nfn f() {}\n",
        "fn f() { let x = 1; }\n",
        True,
    ),
    (
        "go.unsafe_pointer",
        "a.go",
        "p := unsafe.Pointer(&x)\n",
        "import \"fmt\"\n",
        False,
    ),
    (
        "go.unsafe_slice",
        "a.go",
        "s := unsafe.Slice(ptr, n)\n",
        "s := items[1:3]\n",
        False,
    ),
    (
        "go.slice_header",
        "a.go",
        "var h reflect.SliceHeader\n",
        "var h reflect.Value\n",
        False,
    ),
    (
        "go.linkname",
        "a.go",
        "//go:linkname foo other.foo\n",
        "// not a linkname directive\nimport \"fmt\"\n",
        False,
    ),
    (
        "go.cgo",
        "a.go",
        "package p\nimport \"C\"\n",
        "package p\nimport \"fmt\"\n",
        False,
    ),
    (
        "cs.unsafe",
        "a.cs",
        "unsafe { int x = 1; }\n",
        "int x = 1;\n",
        False,
    ),
    (
        "cs.fixed",
        "a.cs",
        "fixed (byte* p = buf) { }\n",
        "int x = 1;\n",
        False,
    ),
    (
        "cs.stackalloc",
        "a.cs",
        "Span<int> p = stackalloc int[8];\n",
        "int[] p = new int[8];\n",
        False,
    ),
    (
        "cs.marshal",
        "a.cs",
        "int n = Marshal.SizeOf<Foo>();\n",
        "int n = 1;\n",
        False,
    ),
    (
        "cs.dllimport",
        "a.cs",
        "[DllImport(\"libc\")]\nstatic extern int getpid();\n",
        "[Serializable]\nclass Foo {}\n",
        False,
    ),
    (
        "py.ctypes",
        "a.py",
        "import ctypes\n",
        "import json\n",
        False,
    ),
    (
        "py.cffi",
        "a.py",
        "from cffi import FFI\n",
        "import json\n",
        False,
    ),
    (
        "py.eval",
        "a.py",
        "eval(\"1+1\")\n",
        "value = 1\n",
        False,
    ),
    (
        "py.exec",
        "a.py",
        "exec(\"x = 1\")\n",
        "execute = None\n",
        False,
    ),
    (
        "js.eval",
        "a.js",
        "eval(\"1\")\n",
        "const value = 1;\n",
        False,
    ),
    (
        "js.function_ctor",
        "a.js",
        "const f = new Function(\"return 1\");\n",
        "function f() { return 1; }\n",
        False,
    ),
    (
        "js.ffi",
        "a.js",
        "const ffi = require(\"ffi-napi\");\n",
        "const fs = require(\"fs\");\n",
        False,
    ),
    (
        "java.native",
        "A.java",
        "public native int foo(int x);\n",
        "public int foo(int x) { return x; }\n",
        False,
    ),
    (
        "java.jni",
        "A.java",
        "System.loadLibrary(\"z\");\n",
        "System.out.println(\"hi\");\n",
        False,
    ),
    (
        "swift.unsafe_pointer",
        "A.swift",
        "let p: UnsafeMutablePointer<UInt8>? = nil\n",
        "let p: Int = 1\n",
        False,
    ),
    (
        "swift.unmanaged",
        "A.swift",
        "let u = Unmanaged.passUnretained(obj)\n",
        "let u = 1\n",
        False,
    ),
    (
        "swift.unsafe_bitcast",
        "A.swift",
        "let x = unsafeBitCast(v, to: Int.self)\n",
        "let x = Int(v)\n",
        False,
    ),
    (
        "repo.no_stack_protector",
        "Makefile",
        "CFLAGS += -fno-stack-protector\n",
        "CFLAGS += -fstack-protector-strong\n",
        False,
    ),
    (
        "repo.execstack",
        "Makefile",
        "LDFLAGS += -z execstack\n",
        "LDFLAGS += -z noexecstack\n",
        False,
    ),
]


def _ids(findings: list[dict], *, notes: bool) -> set[str]:
    return {
        str(item["rule_id"])
        for item in findings
        if (item.get("kind") == "note") == notes
    }


class TestEachRule(unittest.TestCase):
    def test_catalog_cases_cover_every_rule_except_repo_signal(self) -> None:
        covered = {case[0] for case in CASES}
        expected = set(CATALOG) - {"repo.c_cpp_sources"}
        self.assertEqual(covered, expected)

    def test_catalog_text_is_complete(self) -> None:
        for rule_id, meta in CATALOG.items():
            self.assertIn(meta["severity"], {"high", "medium", "low", "info"}, rule_id)
            for key in ("title", "explanation", "safer_alternative"):
                self.assertTrue(str(meta[key]).strip(), f"{rule_id} missing {key}")
            self.assertTrue(meta["languages"], rule_id)

    def test_positive_and_negative_cases(self) -> None:
        for rule_id, path, positive, negative, is_note in CASES:
            with self.subTest(rule=rule_id, polarity="positive"):
                found = _ids(scan_file(path, positive), notes=is_note)
                self.assertIn(rule_id, found)
            with self.subTest(rule=rule_id, polarity="negative"):
                found = _ids(scan_file(path, negative), notes=is_note)
                self.assertNotIn(rule_id, found)

    def test_gets_line_number_and_snippet(self) -> None:
        hits = [item for item in scan_file("a.c", "int x;\ngets(buf);\n") if item["rule_id"] == "cpp.gets"]
        self.assertEqual(len(hits), 1)
        self.assertEqual(hits[0]["line"], 2)
        self.assertIn("gets(buf)", str(hits[0]["snippet"]))
        self.assertIn("> 2:", str(hits[0]["snippet"]))

    def test_comment_hides_gets(self) -> None:
        hits = scan_file("a.c", "int x;\n// gets(buf);\nfgets(buf, 8, stdin);\n")
        self.assertNotIn("cpp.gets", _ids(hits, notes=False))

    def test_cgo_import_block(self) -> None:
        source = 'package p\n\nimport (\n\t"C"\n)\n'
        self.assertIn("go.cgo", _ids(scan_file("a.go", source), notes=False))

    def test_linkname_not_stripped(self) -> None:
        source = "package p\n\n//go:linkname runtimeNano runtime.nanotime\n"
        self.assertIn("go.linkname", _ids(scan_file("a.go", source), notes=False))


class TestRepo(unittest.TestCase):
    def test_c_sources_signal_once(self) -> None:
        report = scan_repo(
            [
                {"path": "a.c", "text": "int x;\n"},
                {"path": "b.cpp", "text": "int y;\n"},
                {"path": "c.rs", "text": "fn f() {}\n"},
            ]
        )
        signals = [item for item in report["findings"] if item["rule_id"] == "repo.c_cpp_sources"]
        self.assertEqual(len(signals), 1)
        self.assertTrue(signals[0]["repo_level"])
        self.assertEqual(report["files_scanned"], 3)
        self.assertEqual(report["counts"]["low"], 1)
        json.dumps(report)

    def test_no_c_signal_for_rust_only(self) -> None:
        report = scan_repo([{"path": "a.rs", "text": "fn f() {}\n"}])
        self.assertFalse(any(item["rule_id"] == "repo.c_cpp_sources" for item in report["findings"]))
        self.assertEqual(report["counts"], {"high": 0, "medium": 0, "low": 0})

    def test_forbid_is_a_note_not_a_finding(self) -> None:
        report = scan_repo([{"path": "src/lib.rs", "text": "#![forbid(unsafe_code)]\n"}])
        self.assertEqual(report["findings"], [])
        self.assertEqual([note["rule_id"] for note in report["notes"]], ["rust.forbid_unsafe_code"])

    def test_unknown_extension_is_empty(self) -> None:
        self.assertEqual(scan_file("README.md", "strcpy(a, b);\n"), [])

    def test_findings_have_required_keys(self) -> None:
        report = scan_repo([{"path": "a.c", "text": "gets(b);\n"}])
        required = {
            "rule_id",
            "severity",
            "title",
            "explanation",
            "safer_alternative",
            "language",
            "path",
            "line",
            "column",
            "snippet",
            "kind",
            "repo_level",
        }
        self.assertTrue(report["findings"])
        for finding in report["findings"]:
            self.assertTrue(required <= set(finding))


class TestLanguages(unittest.TestCase):
    def test_extensions_and_build_filenames(self) -> None:
        self.assertEqual(detect_language("src/foo.c"), "c")
        self.assertEqual(detect_language("include/foo.h"), "c")
        self.assertEqual(detect_language("src/foo.HPP"), "cpp")
        self.assertEqual(detect_language("src/lib.rs"), "rust")
        self.assertEqual(detect_language("main.go"), "go")
        self.assertEqual(detect_language("Program.cs"), "csharp")
        self.assertEqual(detect_language("app.py"), "python")
        self.assertEqual(detect_language("web/App.tsx"), "typescript")
        self.assertEqual(detect_language("Main.java"), "java")
        self.assertEqual(detect_language("View.swift"), "swift")
        self.assertEqual(detect_language("Makefile"), "build")
        self.assertEqual(detect_language("cmake/CMakeLists.txt"), "build")
        self.assertEqual(detect_language("meson.build"), "build")
        self.assertIsNone(detect_language("notes.md"))


if __name__ == "__main__":
    unittest.main()
