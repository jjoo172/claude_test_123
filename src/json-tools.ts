export type IndentStyle = 2 | 4 | 'tab';

export interface FormatOptions {
  indent: IndentStyle;
  sortKeys: boolean;
}

export interface JsonStats {
  bytes: number;
  lines: number;
  depth: number;
  keys: number;
  rootType: string;
}

export interface JsonError {
  message: string;
  line: number | null;
  column: number | null;
  /** 0-based character offset into the source, when the engine reported one. */
  position: number | null;
}

export type ParseResult =
  | { ok: true; value: unknown }
  | { ok: false; error: JsonError };

export function parseJson(source: string): ParseResult {
  try {
    return { ok: true, value: JSON.parse(source) };
  } catch (err) {
    return { ok: false, error: describeError(err, source) };
  }
}

export function formatJson(value: unknown, options: FormatOptions): string {
  const indent = options.indent === 'tab' ? '\t' : options.indent;
  const prepared = options.sortKeys ? sortKeysDeep(value) : value;
  return JSON.stringify(prepared, null, indent);
}

export function minifyJson(value: unknown, sortKeys: boolean): string {
  return JSON.stringify(sortKeys ? sortKeysDeep(value) : value);
}

export function computeStats(value: unknown, text: string): JsonStats {
  let depth = 0;
  let keys = 0;

  const walk = (node: unknown, level: number): void => {
    if (level > depth) depth = level;
    if (Array.isArray(node)) {
      for (const item of node) walk(item, level + 1);
    } else if (node !== null && typeof node === 'object') {
      const entries = Object.values(node as Record<string, unknown>);
      keys += entries.length;
      for (const item of entries) walk(item, level + 1);
    }
  };
  walk(value, 0);

  return {
    bytes: new TextEncoder().encode(text).length,
    lines: text.length === 0 ? 0 : text.split('\n').length,
    depth,
    keys,
    rootType: describeType(value),
  };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort((a, b) => a.localeCompare(b))) {
      sorted[key] = sortKeysDeep(record[key]);
    }
    return sorted;
  }
  return value;
}

function describeType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return `array[${value.length}]`;
  return typeof value;
}

function describeError(err: unknown, source: string): JsonError {
  const raw = err instanceof Error ? err.message : String(err);
  // V8 / SpiderMonkey / JavaScriptCore all phrase this differently; the most
  // portable signal is the "at position N" fragment, from which we derive
  // line and column ourselves.
  const positionMatch = /position\s+(\d+)/i.exec(raw);
  let position: number | null = positionMatch ? Number(positionMatch[1]) : null;

  if (position === null) position = positionFromV8Context(raw, source);

  // Firefox reports "line N column M" but no position.
  const lineColMatch = /line\s+(\d+)\s+column\s+(\d+)/i.exec(raw);

  let line: number | null = null;
  let column: number | null = null;

  if (position !== null) {
    position = Math.min(position, source.length);
    const before = source.slice(0, position);
    const lastNewline = before.lastIndexOf('\n');
    line = (before.match(/\n/g)?.length ?? 0) + 1;
    column = position - lastNewline;
  } else if (lineColMatch) {
    line = Number(lineColMatch[1]);
    column = Number(lineColMatch[2]);
  }

  const message = raw
    .replace(/^JSON\.parse:\s*/i, '')
    .replace(/\s+(?:in|after) JSON at position \d+.*$/i, '')
    .replace(/\s+at line \d+ column \d+.*$/i, '')
    .replace(/,\s*(\.\.\.)?".*"(\.\.\.)? is not valid JSON$/is, '')
    .trim();

  return {
    message: message.charAt(0).toUpperCase() + message.slice(1),
    line,
    column,
    position,
  };
}

// V8 (Chrome, Edge, Node) phrases "unexpected token" errors as
//   Unexpected token 'X', ..."<10 chars>X<10 chars>"... is not valid JSON
// with no numeric position. The context window is always 10 characters on
// each side of the offending token (truncated at the ends of the input), so
// the token's offset can be recovered by locating the snippet in the source.
const V8_CONTEXT_CHARS = 10;

function positionFromV8Context(raw: string, source: string): number | null {
  const match = /Unexpected token '(.)', (\.\.\.)?"(.*)"(\.\.\.)? is not valid JSON$/s.exec(raw);
  if (!match) return null;
  const [, token = '', leading, snippet = '', trailing] = match;

  const start = source.indexOf(snippet);
  if (start === -1) return null;

  let offsetInSnippet: number;
  if (leading) {
    offsetInSnippet = V8_CONTEXT_CHARS;
  } else if (trailing) {
    offsetInSnippet = snippet.length - 1 - V8_CONTEXT_CHARS;
  } else {
    // Whole input fits in the message; best effort is the first occurrence.
    offsetInSnippet = snippet.indexOf(token);
  }

  if (offsetInSnippet < 0 || snippet[offsetInSnippet] !== token) {
    const idx = snippet.indexOf(token);
    if (idx === -1) return null;
    offsetInSnippet = idx;
  }
  return start + offsetInSnippet;
}
