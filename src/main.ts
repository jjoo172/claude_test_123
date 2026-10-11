import './style.css';
import { bootScanner, type Scanner } from './engine';
import { fetchRepository } from './github';
import { renderResults } from './render';

const TOKEN_KEY = 'memory-safety-scanner.github-token';

function required<T extends Element>(element: T | null, name: string): T {
  if (!element) throw new Error(`Scanner page is missing ${name}.`);
  return element;
}

const form = required(document.querySelector<HTMLFormElement>('#scan-form'), 'the scan form');
const repoInput = required(document.querySelector<HTMLInputElement>('#repo'), 'the repository field');
const refInput = required(document.querySelector<HTMLInputElement>('#ref'), 'the ref field');
const tokenInput = required(document.querySelector<HTMLInputElement>('#token'), 'the token field');
const skipInput = required(document.querySelector<HTMLInputElement>('#skip-vendored'), 'the vendored toggle');
const scanButton = required(document.querySelector<HTMLButtonElement>('#scan'), 'the scan button');
const toggleToken = required(document.querySelector<HTMLButtonElement>('#toggle-token'), 'the token toggle');
const forgetToken = required(document.querySelector<HTMLButtonElement>('#forget-token'), 'the forget button');
const runtime = required(document.querySelector<HTMLParagraphElement>('#runtime'), 'the runtime status');
const statusEl = required(document.querySelector<HTMLParagraphElement>('#status'), 'the progress status');
const errorEl = required(document.querySelector<HTMLParagraphElement>('#error'), 'the error banner');
const results = required(document.querySelector<HTMLElement>('#results'), 'the results section');

function readStoredToken(): string {
  try {
    return sessionStorage.getItem(TOKEN_KEY) ?? '';
  } catch {
    return '';
  }
}

function writeStoredToken(value: string): void {
  try {
    if (value) sessionStorage.setItem(TOKEN_KEY, value);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // sessionStorage can throw in locked-down browsers; the field still works for this scan.
  }
}

tokenInput.value = readStoredToken();
tokenInput.addEventListener('change', () => writeStoredToken(tokenInput.value.trim()));

toggleToken.addEventListener('click', () => {
  const showing = tokenInput.type === 'text';
  tokenInput.type = showing ? 'password' : 'text';
  toggleToken.textContent = showing ? 'Show' : 'Hide';
});

forgetToken.addEventListener('click', () => {
  tokenInput.value = '';
  writeStoredToken('');
});

let bootPromise: Promise<Scanner> | null = null;

function ensureScanner(): Promise<Scanner> {
  if (!bootPromise) {
    bootPromise = bootScanner((message) => {
      runtime.textContent = message;
    }).catch((error: unknown) => {
      bootPromise = null;
      runtime.textContent = 'Python runtime failed to load';
      runtime.classList.add('bad');
      throw error;
    });
  }
  return bootPromise;
}

function showError(message: string): void {
  errorEl.hidden = false;
  errorEl.textContent = message;
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  void runScan();
});

async function runScan(): Promise<void> {
  errorEl.hidden = true;
  errorEl.textContent = '';
  results.hidden = true;
  scanButton.disabled = true;
  form.setAttribute('aria-busy', 'true');
  const token = tokenInput.value.trim();
  writeStoredToken(token);

  try {
    const scannerPromise = ensureScanner();
    const fetched = await fetchRepository({
      input: repoInput.value,
      refInput: refInput.value,
      token: token || null,
      skipVendored: skipInput.checked,
      onProgress: (message) => {
        statusEl.textContent = message;
      },
    });
    statusEl.textContent =
      fetched.files.length === 0
        ? 'No scannable source files. Waiting for the Python runtime…'
        : `Scanning ${fetched.files.length} files…`;
    await new Promise((resolve) => setTimeout(resolve, 0));
    const scanner = await scannerPromise;
    runtime.textContent = 'Python ready';
    runtime.classList.remove('bad');
    const report = await scanner.scan(fetched.files);
    statusEl.textContent = `Scanned ${report.files_scanned} file${report.files_scanned === 1 ? '' : 's'}.`;
    renderResults(results, {
      meta: {
        owner: fetched.owner,
        repo: fetched.repo,
        ref: fetched.ref,
        sha: fetched.sha,
        filesFetched: fetched.files.length,
        skippedBinary: fetched.skippedBinary,
        skippedLarge: fetched.skippedLarge,
        skippedVendored: fetched.skippedVendored,
        truncationNote: fetched.truncationNote,
        warning: fetched.warning,
      },
      report,
    });
    results.hidden = false;
    results.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'The scan failed.';
    showError(message);
    statusEl.textContent = '';
  } finally {
    scanButton.disabled = false;
    form.removeAttribute('aria-busy');
  }
}

void ensureScanner().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'The Python runtime failed to load.';
  showError(message);
});
