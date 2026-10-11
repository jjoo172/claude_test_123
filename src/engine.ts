import type { ScanReport } from './types';

const INDEX_URL = 'https://cdn.jsdelivr.net/pyodide/v314.0.7/full/';

interface PyodideFs {
  mkdirTree?(path: string): void;
  writeFile(path: string, data: string): void;
}

interface PyodideInstance {
  runPythonAsync(code: string): Promise<unknown>;
  FS: PyodideFs;
  globals: { set(name: string, value: unknown): void };
}

declare global {
  function loadPyodide(options?: { indexURL?: string }): Promise<PyodideInstance>;
}

export interface Scanner {
  scan(files: { path: string; text: string }[]): Promise<ScanReport>;
}

const scannerAssets = import.meta.glob('../backend/scanner/**/*.{py,json}', {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<string, string>;

function packagePath(assetKey: string): string {
  const marker = 'backend/scanner/';
  const index = assetKey.indexOf(marker);
  if (index < 0) throw new Error(`Unexpected scanner asset: ${assetKey}`);
  return `/pkg/${assetKey.slice(index + 'backend/'.length)}`;
}

function asReport(value: unknown): ScanReport {
  if (!value || typeof value !== 'object') {
    throw new Error('The Python scanner returned an empty report.');
  }
  const report = value as Partial<ScanReport>;
  if (!Array.isArray(report.findings) || !Array.isArray(report.notes) || !report.counts) {
    throw new Error('The Python scanner returned a report in an unexpected shape.');
  }
  return report as ScanReport;
}

async function writeAssets(pyodide: PyodideInstance): Promise<void> {
  const entries = Object.entries(scannerAssets);
  if (entries.length === 0) throw new Error('The scanner Python package was not included in the build.');

  const dirs = new Set<string>();
  for (const [key] of entries) {
    const full = packagePath(key);
    dirs.add(full.slice(0, full.lastIndexOf('/')));
  }
  for (const dir of [...dirs].sort()) {
    try {
      pyodide.FS.mkdirTree?.(dir);
    } catch {
      // Created via Python below if mkdirTree is missing or the path exists.
    }
  }

  await Promise.all(
    entries.map(async ([key, url]) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Failed to load scanner file ${key} (${response.status}).`);
      const full = packagePath(key);
      const source = await response.text();
      try {
        pyodide.FS.writeFile(full, source);
      } catch {
        pyodide.globals.set('_write_path', full);
        pyodide.globals.set('_write_body', source);
        await pyodide.runPythonAsync(`
import os
os.makedirs(_write_path.rsplit("/", 1)[0], exist_ok=True)
with open(_write_path, "w", encoding="utf-8") as handle:
    handle.write(_write_body)
`);
      }
    }),
  );
}

export async function bootScanner(onStatus: (message: string) => void): Promise<Scanner> {
  onStatus('Loading Python…');
  if (typeof loadPyodide !== 'function') {
    throw new Error('The Python runtime failed to load. Check that jsDelivr is reachable, then reload.');
  }
  const pyodide = await loadPyodide({ indexURL: INDEX_URL });
  onStatus('Loading scanner…');
  await writeAssets(pyodide);
  await pyodide.runPythonAsync(`
import sys
sys.path.insert(0, "/pkg")
from scanner.scan import scan_repo
`);
  onStatus('Python ready');

  return {
    async scan(files) {
      pyodide.globals.set('scan_files_json', JSON.stringify(files));
      let raw: unknown;
      try {
        raw = await pyodide.runPythonAsync(`
import json
from scanner.scan import scan_repo
json.dumps(scan_repo(json.loads(scan_files_json)))
`);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Python scan failed.';
        throw new Error(message);
      }
      if (typeof raw !== 'string') throw new Error('The Python scanner did not return JSON.');
      return asReport(JSON.parse(raw));
    },
  };
}
