# Memory Safety Scanner

**Live site:** https://jjoo172.github.io/claude_test_123/
**Source:** https://github.com/jjoo172/claude_test_123

Scan a GitHub repository for risky memory-unsafe code and bring the hits to your attention before you depend on it. You paste `owner/repo` (or a GitHub URL). The page fetches the tree and source with the GitHub REST API, then runs a Python rule set **in your browser** with [Pyodide](https://pyodide.org). Nothing is uploaded to this site.

The scan is a **heuristic, pattern-based pass**, not a full vulnerability scanner. False positives and false negatives are expected. Use it as a first look, then follow up with CodeQL, clang-tidy, cargo-audit, ASan/UBSan, or the equivalent for the language.

## How to use the site

1. Enter a repository as `owner/repo` or `https://github.com/owner/repo`. A `/tree/<ref>` URL can fill the ref.
2. Optionally set a branch, tag, or commit. Leave it blank to use the repository’s default branch.
3. Optionally paste a GitHub personal access token.
4. Leave **Skip vendored and build directories** on unless you want `node_modules`, `vendor`, `third_party`, `dist`, and `build` included.
5. Click **Scan repository**. The summary shows High / Medium / Low counts. Findings are grouped by file, sorted by severity, and each one links to the exact line on GitHub (`https://github.com/{owner}/{repo}/blob/{sha}/{path}#L{n}`).
6. Filter by severity or language. **Export JSON** or **Export Markdown** downloads every finding, not just the ones drawn on screen.

The page caps a scan at **400 files** or **8 MB**, and skips individual files over **256 KB**, binaries, and non-UTF-8 text. A note appears when the tree or the cap truncates the scan. On a large result, the page draws the first 200 matching findings so it stays responsive; the export still has the full set.

### Token

The token field is optional and stored only in this tab’s `sessionStorage`. It is sent only to `api.github.com`.

- Without a token, GitHub allows about **60 API requests per hour**. Public file bodies are loaded from `raw.githubusercontent.com`, so a public scan spends only a few API calls (repository, commit, tree).
- With a token, the API limit rises to **5,000 requests per hour**, and the scan can read **private repositories** that token can access. Private file bodies come from the Git blobs API.

A fine-grained token needs **Contents: Read** on the repositories you scan. Clear it with **Forget**.

## What it flags

Language comes from the file extension (or a known build filename such as `Makefile` or `CMakeLists.txt`). Each finding has a rule id, severity, line, a short snippet, why it is risky, and a safer alternative.

`rust.forbid_unsafe_code` is a **positive note**, not a finding. `repo.c_cpp_sources` is one repository-level signal when any C or C++ file is present.

| Rule | Severity | Languages | What it catches |
| --- | --- | --- | --- |
| `cpp.gets` | High | C, C++ | `gets()` |
| `cpp.scanf_unbounded` | High | C, C++ | `scanf` family `%s` / `%ls` with no field width |
| `cpp.strcpy_family` | High | C, C++ | `strcpy`, `strcat`, `sprintf`, `vsprintf` |
| `repo.execstack` | High | build files | `-z execstack` / `-Wl,-z,execstack` |
| `repo.no_stack_protector` | High | build files | `-fno-stack-protector` |
| `rust.from_raw_parts` | High | Rust | `from_raw_parts` / `from_raw_parts_mut` |
| `rust.raw_ptr_deref` | High | Rust | `*const` / `*mut` dereference inside `unsafe` |
| `rust.set_len` | High | Rust | `set_len(` |
| `rust.transmute` | High | Rust | `transmute` / `transmute_copy` |
| `cpp.alloca` | Medium | C, C++ | `alloca`, `_alloca`, `__builtin_alloca` |
| `cpp.command_injection` | Medium | C, C++ | `system` / `popen` (command injection, adjacent risk) |
| `cpp.memcpy_nonconst` | Medium | C, C++ | `memcpy` / `memmove` with a non-constant length |
| `cpp.stack_buffer_input` | Medium | C, C++ | Fixed `char` array passed to an unbounded input call |
| `cs.dllimport` | Medium | C# | `DllImport` |
| `cs.fixed` | Medium | C# | `fixed` |
| `cs.marshal` | Medium | C# | `Marshal.*` |
| `cs.stackalloc` | Medium | C# | `stackalloc` |
| `cs.unsafe` | Medium | C# | `unsafe` |
| `go.cgo` | Medium | Go | `import "C"` |
| `go.linkname` | Medium | Go | `//go:linkname` |
| `go.slice_header` | Medium | Go | `reflect.SliceHeader` / `StringHeader` |
| `go.unsafe_pointer` | Medium | Go | `unsafe.Pointer` |
| `go.unsafe_slice` | Medium | Go | `unsafe.Slice` |
| `java.jni` | Medium | Java | `System.loadLibrary`, `JNIEXPORT`, `JNIEnv` |
| `java.native` | Medium | Java | `native` methods |
| `js.ffi` | Medium | JavaScript, TypeScript | `ffi-napi`, `node-ffi`, or `'ffi'` |
| `py.cffi` | Medium | Python | `cffi` |
| `py.ctypes` | Medium | Python | `ctypes` |
| `rust.allow_unsafe_code` | Medium | Rust | `allow(unsafe_code)` |
| `rust.get_unchecked` | Medium | Rust | `get_unchecked` / `get_unchecked_mut` |
| `rust.unsafe` | Medium | Rust | `unsafe` block, fn, impl, or trait |
| `swift.unsafe_bitcast` | Medium | Swift | `unsafeBitCast` |
| `swift.unsafe_pointer` | Medium | Swift | `UnsafePointer` and mutable/raw/buffer variants |
| `cpp.char_ptr_arith` | Low | C, C++ | `++`, `+=`, `+`, `-` on a `char*` |
| `cpp.malloc_unchecked` | Low | C, C++ | `malloc` / `realloc` / `calloc` with no null check nearby |
| `cpp.new_delete_mismatch` | Low | C, C++ | `new[]` released with `delete`, or the reverse |
| `cpp.pragma_pack` | Low | C, C++ | `#pragma pack` |
| `cpp.reinterpret_cast` | Low | C, C++ | `reinterpret_cast` |
| `cpp.strncpy_unterminated` | Low | C, C++ | `strncpy` with no explicit null terminator nearby |
| `cpp.unaligned_cast` | Low | C, C++ | Cast of an offset pointer to a wider type |
| `cpp.use_after_free` | Low | C, C++ | `free` followed by a dereference of the same variable |
| `js.eval` | Low | JavaScript, TypeScript | `eval(` (adjacent risk) |
| `js.function_ctor` | Low | JavaScript, TypeScript | `new Function(` (adjacent risk) |
| `py.eval` | Low | Python | `eval(` (adjacent risk) |
| `py.exec` | Low | Python | `exec(` (adjacent risk) |
| `repo.c_cpp_sources` | Low | repo | Any C or C++ source is present |
| `swift.unmanaged` | Low | Swift | `Unmanaged` |
| `rust.forbid_unsafe_code` | Info | Rust | `#![forbid(unsafe_code)]` (positive signal) |

Comments are blanked before matching, so a `gets` that only appears in a comment is ignored. `//go:` directives are kept. Build-file `#` comments are ignored, so a flag mentioned only in a comment is not treated as a real flag.

## Limitations

- Rules are regular expressions and a few line-window heuristics. They do not parse C, track macros, or follow data across functions.
- A checked allocation, a sound `unsafe` block, and a `char*` walk inside a known length all still look like the patterns above. Expect noise, especially `cpp.char_ptr_arith`.
- Wrappers (`my_strcpy`, a local `read_line`) are invisible.
- `strncpy` is suppressed only when an indexed `= '\0'` or `= 0` appears within the next few lines.
- Malloc is treated as checked only when a null test for that variable appears within a few lines.
- The raw-pointer dereference rule only fires inside an `unsafe { ... }` region, and only for `*name` with no space after the star.
- Vendored trees are skipped by default. Generated bindings (for example in `rust-lang/libc`) will dominate the list when they are inside the file cap.
- GitHub may truncate a recursive tree. This page also stops at 400 files / 8 MB.
- Rate-limit responses (HTTP 403/429) and missing repos or refs (HTTP 404) are shown as errors. A 404 on a private repo usually means the token cannot read it.

## Local development

```bash
npm ci
npm run dev        # http://localhost:5173/claude_test_123/
npm run build      # static files in dist/
npm run preview    # serves dist/ with the Pages base path
npm run typecheck  # tsc --noEmit
```

The Pages project is served under `/claude_test_123/`. `vite.config.ts` defaults `base` to that path. Override it for a user site:

```bash
VITE_BASE=/ npm run build
```

Pyodide is loaded from jsDelivr (`v314.0.7`). The Python package under `backend/scanner/` is emitted as static assets and written into Pyodide’s virtual filesystem at scan time.

## Python tests

The rule suite is pure stdlib and runs without Pyodide:

```bash
python3 -m unittest discover -s backend/tests -v
```

`pytest` can collect the same `unittest` classes if you have it installed. Every rule has a positive and a negative case. CI runs this job before the Pages build (`.github/workflows/deploy.yml`).

Try one file locally:

```bash
python3 -c 'import sys; sys.path.insert(0, "backend"); from scanner.scan import scan_file; import json, pathlib; print(json.dumps(scan_file("kilo.c", pathlib.Path("kilo.c").read_text()), indent=2)[:500])'
```

## Project structure

```text
.
├── backend/
│   ├── scanner/          # language detection, rule catalog, scan_file / scan_repo
│   │   ├── rules/        # C/C++, Rust, Go, C#, FFI, build flags
│   │   └── manifest.json # extensions the page and the engine both use
│   └── tests/            # unittest suite
├── index.html            # page shell; loads Pyodide from jsDelivr
├── src/                  # TypeScript UI, GitHub fetch, Pyodide bridge
├── public/
├── vite.config.ts
└── .github/workflows/deploy.yml
```

## Deploy

Pushes to `main` run Python tests, then build with `actions/configure-pages` and deploy `dist/` to GitHub Pages.
