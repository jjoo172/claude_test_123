import './style.css';
import {
  computeStats,
  formatBytes,
  formatJson,
  minifyJson,
  parseJson,
  type IndentStyle,
  type JsonError,
} from './json-tools.ts';
import { clearState, loadState, saveState, type PersistedState } from './storage.ts';

const SAMPLE = `{
  "name": "Genesis",
  "version": 1,
  "tags": ["json", "formatter", "static"],
  "deploy": {"host": "GitHub Pages", "build": "Vite", "backend": null},
  "private": true
}`;

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('Missing #app root');

app.innerHTML = `
  <header class="topbar">
    <a class="brand" href="./" aria-label="Genesis home">
      <img src="./favicon.svg" alt="" width="28" height="28" />
      <span class="brand-name">Genesis</span>
      <span class="brand-sub">JSON Formatter</span>
    </a>
    <p class="tagline">Format, validate, and minify JSON. Runs entirely in your browser — nothing leaves this page.</p>
  </header>

  <main class="workspace">
    <section class="pane" aria-labelledby="input-label">
      <div class="pane-head">
        <h2 id="input-label">Input</h2>
        <div class="pane-actions">
          <button type="button" class="btn ghost" data-action="sample">Load sample</button>
          <button type="button" class="btn ghost" data-action="clear">Clear</button>
        </div>
      </div>
      <textarea
        id="input"
        class="editor"
        spellcheck="false"
        autocapitalize="off"
        autocomplete="off"
        placeholder='Paste JSON here, e.g. {"hello": "world"}'
        aria-describedby="status"
      ></textarea>
      <div id="status" class="status" role="status" aria-live="polite">
        <span class="status-dot"></span>
        <span class="status-text">Waiting for input</span>
        <button type="button" class="link" data-action="jump" hidden>Jump to error</button>
      </div>
    </section>

    <div class="controls" role="toolbar" aria-label="Formatting controls">
      <button type="button" class="btn primary" data-action="format" title="Ctrl/⌘ + Enter">
        Format
      </button>
      <button type="button" class="btn" data-action="minify">Minify</button>

      <label class="field">
        <span>Indent</span>
        <select id="indent" aria-label="Indentation">
          <option value="2">2 spaces</option>
          <option value="4">4 spaces</option>
          <option value="tab">Tab</option>
        </select>
      </label>

      <label class="field checkbox">
        <input type="checkbox" id="sort-keys" />
        <span>Sort keys</span>
      </label>

      <p class="hint"><kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>Enter</kbd> to format</p>
    </div>

    <section class="pane" aria-labelledby="output-label">
      <div class="pane-head">
        <h2 id="output-label">Output</h2>
        <div class="pane-actions">
          <button type="button" class="btn ghost" data-action="copy" disabled>Copy</button>
          <button type="button" class="btn ghost" data-action="download" disabled>Download</button>
        </div>
      </div>
      <textarea
        id="output"
        class="editor"
        readonly
        spellcheck="false"
        placeholder="Formatted JSON will appear here"
        aria-label="Formatted output"
      ></textarea>
      <ul id="stats" class="stats" aria-label="Output statistics"></ul>
    </section>
  </main>

  <footer class="footer">
    <span>Static site · no backend · input is saved only in this browser's localStorage.</span>
    <a href="https://github.com/jonathan-joo/genesis" rel="noopener" target="_blank">Source on GitHub</a>
  </footer>
`;

const $ = <T extends Element>(selector: string): T => {
  const el = app.querySelector<T>(selector);
  if (!el) throw new Error(`Missing element: ${selector}`);
  return el;
};

const input = $<HTMLTextAreaElement>('#input');
const output = $<HTMLTextAreaElement>('#output');
const indentSelect = $<HTMLSelectElement>('#indent');
const sortKeysBox = $<HTMLInputElement>('#sort-keys');
const status = $<HTMLDivElement>('#status');
const statusText = $<HTMLSpanElement>('.status-text');
const jumpBtn = $<HTMLButtonElement>('[data-action="jump"]');
const copyBtn = $<HTMLButtonElement>('[data-action="copy"]');
const downloadBtn = $<HTMLButtonElement>('[data-action="download"]');
const statsList = $<HTMLUListElement>('#stats');

let state: PersistedState = loadState();
let lastError: JsonError | null = null;
let saveTimer: number | undefined;

input.value = state.input;
indentSelect.value = String(state.indent);
sortKeysBox.checked = state.sortKeys;

function persist(): void {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => saveState(state), 250);
}

function setStatus(kind: 'idle' | 'valid' | 'invalid', text: string): void {
  status.dataset.kind = kind;
  statusText.textContent = text;
  jumpBtn.hidden = kind !== 'invalid' || lastError?.position === null;
}

function renderStats(value: unknown, text: string): void {
  const stats = computeStats(value, text);
  const items: Array<[string, string]> = [
    ['Size', formatBytes(stats.bytes)],
    ['Lines', String(stats.lines)],
    ['Keys', String(stats.keys)],
    ['Depth', String(stats.depth)],
    ['Root', stats.rootType],
  ];
  statsList.innerHTML = items
    .map(([label, val]) => `<li><span class="stat-label">${label}</span><span class="stat-value">${val}</span></li>`)
    .join('');
}

function setOutput(text: string, value: unknown): void {
  output.value = text;
  const hasOutput = text.length > 0;
  copyBtn.disabled = !hasOutput;
  downloadBtn.disabled = !hasOutput;
  if (hasOutput) {
    renderStats(value, text);
  } else {
    statsList.innerHTML = '';
  }
}

function validate(): ReturnType<typeof parseJson> | null {
  const source = input.value;
  if (source.trim().length === 0) {
    lastError = null;
    setStatus('idle', 'Waiting for input');
    return null;
  }
  const result = parseJson(source);
  if (result.ok) {
    lastError = null;
    setStatus('valid', 'Valid JSON');
  } else {
    lastError = result.error;
    const where =
      result.error.line !== null && result.error.column !== null
        ? ` (line ${result.error.line}, column ${result.error.column})`
        : '';
    setStatus('invalid', `${result.error.message}${where}`);
  }
  return result;
}

function run(mode: 'format' | 'minify'): void {
  const result = validate();
  if (!result) {
    setOutput('', undefined);
    return;
  }
  if (!result.ok) {
    setOutput('', undefined);
    output.value = '';
    return;
  }
  const text =
    mode === 'format'
      ? formatJson(result.value, { indent: state.indent, sortKeys: state.sortKeys })
      : minifyJson(result.value, state.sortKeys);
  setOutput(text, result.value);
}

function flash(button: HTMLButtonElement, label: string): void {
  const original = button.textContent;
  button.textContent = label;
  button.disabled = true;
  window.setTimeout(() => {
    button.textContent = original;
    button.disabled = output.value.length === 0;
  }, 1200);
}

async function copyOutput(): Promise<void> {
  if (!output.value) return;
  try {
    await navigator.clipboard.writeText(output.value);
    flash(copyBtn, 'Copied');
  } catch {
    output.select();
    document.execCommand('copy');
    flash(copyBtn, 'Copied');
  }
}

function downloadOutput(): void {
  if (!output.value) return;
  const blob = new Blob([output.value], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'formatted.json';
  a.click();
  URL.revokeObjectURL(url);
}

function jumpToError(): void {
  if (lastError?.position === null || lastError?.position === undefined) return;
  input.focus();
  input.setSelectionRange(lastError.position, Math.min(lastError.position + 1, input.value.length));
}

input.addEventListener('input', () => {
  state = { ...state, input: input.value };
  validate();
  persist();
});

input.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault();
    run('format');
  }
});

indentSelect.addEventListener('change', () => {
  const raw = indentSelect.value;
  const indent: IndentStyle = raw === 'tab' ? 'tab' : raw === '4' ? 4 : 2;
  state = { ...state, indent };
  persist();
  if (output.value) run('format');
});

sortKeysBox.addEventListener('change', () => {
  state = { ...state, sortKeys: sortKeysBox.checked };
  persist();
  if (output.value) run('format');
});

app.addEventListener('click', (event) => {
  const target = (event.target as HTMLElement).closest<HTMLElement>('[data-action]');
  if (!target) return;
  switch (target.dataset.action) {
    case 'format':
      run('format');
      break;
    case 'minify':
      run('minify');
      break;
    case 'sample':
      input.value = SAMPLE;
      state = { ...state, input: SAMPLE };
      persist();
      run('format');
      break;
    case 'clear':
      input.value = '';
      state = { ...state, input: '' };
      clearState();
      saveState(state);
      setOutput('', undefined);
      validate();
      input.focus();
      break;
    case 'copy':
      void copyOutput();
      break;
    case 'download':
      downloadOutput();
      break;
    case 'jump':
      jumpToError();
      break;
  }
});

// Restore the previous session: validate what was loaded and, if it parses,
// show it formatted so returning users land on a useful screen.
if (input.value.trim()) {
  run('format');
} else {
  validate();
}
