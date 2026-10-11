import './style.css';
// `?url` makes Vite emit the Python file as a static asset and hand us its URL,
// so the same file runs both in the browser and via `python3 backend/hello.py`.
import helloPyUrl from '../backend/hello.py?url';

interface Pyodide {
  runPythonAsync(code: string): Promise<unknown>;
}

declare global {
  // Provided by the Pyodide <script> tag in index.html.
  function loadPyodide(): Promise<Pyodide>;
}

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('Missing #app root');

app.innerHTML = `
  <main class="card">
    <p id="greeting" class="greeting" role="status" aria-live="polite">Loading Python…</p>
    <p class="note">Greeting produced by <code>backend/hello.py</code>, run in your browser with Pyodide.</p>
  </main>
`;

const greeting = app.querySelector<HTMLParagraphElement>('#greeting')!;

async function main(): Promise<void> {
  const [pyodide, response] = await Promise.all([loadPyodide(), fetch(helloPyUrl)]);
  if (!response.ok) throw new Error(`Failed to fetch hello.py: ${response.status}`);
  const source = await response.text();

  // Run the module, then call its `hello()` and bring the string back to JS.
  await pyodide.runPythonAsync(source);
  const message = await pyodide.runPythonAsync('hello()');

  greeting.textContent = String(message);
  greeting.classList.add('ready');
}

main().catch((error: unknown) => {
  console.error(error);
  greeting.textContent = 'Failed to run Python.';
  greeting.classList.add('error');
});
