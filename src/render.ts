import { exportJson, exportMarkdown, githubLineUrl } from './export';
import type { Finding, ScanTarget, Severity } from './types';

const SEVERITY_ORDER: Severity[] = ['high', 'medium', 'low'];
const SEVERITY_LABEL: Record<Severity, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};
const DISPLAY_CAP = 200;

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options?: {
    className?: string;
    text?: string;
    attrs?: Record<string, string>;
  },
  ...children: Array<Node | string | null | undefined | false>
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (options?.className) node.className = options.className;
  if (options?.text !== undefined) node.textContent = options.text;
  if (options?.attrs) {
    for (const [key, value] of Object.entries(options.attrs)) node.setAttribute(key, value);
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false || child === '') continue;
    node.append(child);
  }
  return node;
}

function shortSha(sha: string): string {
  return sha.slice(0, 7);
}

function languageNames(languages: Record<string, number>): string[] {
  return Object.keys(languages).sort((a, b) => a.localeCompare(b));
}

function matchesSeverity(finding: Finding, selected: Set<Severity>): boolean {
  return finding.severity !== 'info' && selected.has(finding.severity);
}

export function renderResults(root: HTMLElement, target: ScanTarget): void {
  root.replaceChildren();
  const selected = new Set<Severity>(SEVERITY_ORDER);
  let language = 'all';

  const summary = h('div', { className: 'summary' });
  const signals = h('div', { className: 'signals' });
  const notes = h('div', { className: 'notes' });
  const toolbar = h('div', { className: 'toolbar' });
  const list = h('div', { className: 'findings' });
  root.append(summary, signals, notes, toolbar, list);

  const { meta, report } = target;
  const repoUrl = `https://github.com/${encodeURIComponent(meta.owner)}/${encodeURIComponent(meta.repo)}`;
  const repoLink = h('a', {
    text: `${meta.owner}/${meta.repo}`,
    attrs: { href: repoUrl, target: '_blank', rel: 'noopener noreferrer' },
  });

  summary.append(
    h('div', { className: 'summary-head' }, h('h2', { text: 'Scan results' }), h('p', { className: 'repo-line' }, repoLink)),
    h(
      'dl',
      { className: 'meta-grid' },
      h('div', {}, h('dt', { text: 'Ref' }), h('dd', { text: meta.ref })),
      h('div', {}, h('dt', { text: 'Commit' }), h('dd', { className: 'mono', text: shortSha(meta.sha) })),
      h('div', {}, h('dt', { text: 'Files scanned' }), h('dd', { text: String(report.files_scanned) })),
      h(
        'div',
        {},
        h('dt', { text: 'Languages' }),
        h(
          'dd',
          { text: languageNames(report.languages).map((name) => `${name} ${report.languages[name] ?? 0}`).join(' · ') || '—' },
        ),
      ),
    ),
  );

  if (meta.skippedVendored > 0) {
    summary.append(
      h('p', {
        className: 'fine',
        text: `Skipped ${meta.skippedVendored} file${meta.skippedVendored === 1 ? '' : 's'} under node_modules, vendor, third_party, dist, or build.`,
      }),
    );
  }
  if (meta.skippedBinary > 0) {
    summary.append(
      h('p', {
        className: 'fine',
        text: `Skipped ${meta.skippedBinary} binary or non-UTF-8 file${meta.skippedBinary === 1 ? '' : 's'}.`,
      }),
    );
  }
  if (meta.truncationNote) summary.append(h('p', { className: 'banner warn', text: meta.truncationNote }));
  if (meta.warning) summary.append(h('p', { className: 'banner warn', text: meta.warning }));

  const countRow = h('div', { className: 'counts', attrs: { role: 'group', 'aria-label': 'Filter by severity' } });
  for (const severity of SEVERITY_ORDER) {
    const button = h(
      'button',
      {
        className: `count count-${severity}`,
        attrs: { type: 'button', 'aria-pressed': 'true' },
      },
      h('span', { className: 'count-label', text: SEVERITY_LABEL[severity] }),
      h('span', { className: 'count-num', text: String(report.counts[severity] ?? 0) }),
    );
    button.addEventListener('click', () => {
      if (selected.has(severity)) selected.delete(severity);
      else selected.add(severity);
      button.setAttribute('aria-pressed', selected.has(severity) ? 'true' : 'false');
      drawList();
    });
    countRow.append(button);
  }
  summary.append(
    countRow,
    h('p', { className: 'fine', text: 'Counts cover the whole scan. Click a severity to hide those findings.' }),
  );

  const repoSignals = report.findings.filter((finding) => finding.repo_level);
  if (repoSignals.length) {
    signals.append(h('h3', { text: 'Repository signals' }));
    for (const finding of repoSignals) signals.append(renderFinding(finding, target));
  }

  if (report.notes.length) {
    notes.append(h('h3', { text: 'Positive signals' }));
    for (const note of report.notes) {
      notes.append(
        h(
          'article',
          { className: 'note-card' },
          h('p', { className: 'note-title' }, h('code', { text: note.rule_id }), h('span', { text: note.title })),
          h('p', { text: note.explanation }),
          h('p', { className: 'fine mono', text: `${note.path}:${note.line}` }),
        ),
      );
    }
  }

  const languageSelect = h('select', { attrs: { 'aria-label': 'Filter by language' } });
  languageSelect.append(h('option', { text: 'All languages', attrs: { value: 'all' } }));
  for (const name of languageNames(report.languages)) {
    languageSelect.append(h('option', { text: name, attrs: { value: name } }));
  }
  languageSelect.addEventListener('change', () => {
    language = languageSelect.value;
    drawList();
  });

  const jsonButton = h('button', { className: 'ghost', text: 'Export JSON', attrs: { type: 'button' } });
  const markdownButton = h('button', { className: 'ghost', text: 'Export Markdown', attrs: { type: 'button' } });
  jsonButton.addEventListener('click', () => exportJson(target));
  markdownButton.addEventListener('click', () => exportMarkdown(target));

  toolbar.append(
    h('div', { className: 'filters' }, languageSelect, h('span', { className: 'fine', text: 'Sorted by severity' })),
    h('div', { className: 'exports' }, jsonButton, markdownButton),
  );

  function drawList(): void {
    list.replaceChildren();
    const visible = report.findings.filter((finding) => {
      if (finding.repo_level) return false;
      if (!matchesSeverity(finding, selected)) return false;
      if (language !== 'all' && finding.language !== language) return false;
      return true;
    });

    if (selected.size === 0) {
      list.append(h('p', { className: 'empty', text: 'Select at least one severity to list findings.' }));
      return;
    }
    if (visible.length === 0) {
      list.append(
        h('p', {
          className: 'empty',
          text: 'No findings match these filters. An empty result is not a clean bill of health — this scan only sees patterns it knows.',
        }),
      );
      return;
    }

    const groups = new Map<string, Finding[]>();
    for (const finding of visible) {
      const bucket = groups.get(finding.path) ?? [];
      bucket.push(finding);
      groups.set(finding.path, bucket);
    }
    const rank: Record<string, number> = { high: 0, medium: 1, low: 2 };
    const ordered = [...groups.entries()].sort((a, b) => {
      const aRank = Math.min(...a[1].map((finding) => rank[finding.severity] ?? 9));
      const bRank = Math.min(...b[1].map((finding) => rank[finding.severity] ?? 9));
      return aRank - bRank || a[0].localeCompare(b[0]);
    });

    let shown = 0;
    let fileIndex = 0;
    for (const [path, findings] of ordered) {
      if (shown >= DISPLAY_CAP) break;
      findings.sort((a, b) => (rank[a.severity] ?? 9) - (rank[b.severity] ?? 9) || a.line - b.line);
      const slice = findings.slice(0, DISPLAY_CAP - shown);
      shown += slice.length;
      const details = h('details', { className: 'file', attrs: fileIndex < 2 ? { open: '' } : {} });
      const summaryText = `${path}  ·  ${findings.length} finding${findings.length === 1 ? '' : 's'}`;
      details.append(h('summary', { text: summaryText }));
      for (const finding of slice) details.append(renderFinding(finding, target));
      if (slice.length < findings.length) {
        details.append(
          h('p', {
            className: 'fine',
            text: `Showing ${slice.length} of ${findings.length} in this file. Export for the full list.`,
          }),
        );
      }
      list.append(details);
      fileIndex += 1;
    }

    if (shown < visible.length) {
      list.append(
        h('p', {
          className: 'banner warn',
          text: `Showing ${shown} of ${visible.length} matching findings so the page stays responsive. Export JSON or Markdown for the full set, or narrow the filters.`,
        }),
      );
    }
  }

  drawList();
}

function renderFinding(finding: Finding, target: ScanTarget): HTMLElement {
  const severity = finding.severity === 'info' ? 'low' : finding.severity;
  const label = finding.severity === 'info' ? 'Info' : SEVERITY_LABEL[severity];
  const href = githubLineUrl(target.meta.owner, target.meta.repo, target.meta.sha, finding.path, finding.line);
  const link = h('a', {
    text: `Line ${finding.line} on GitHub`,
    attrs: { href, target: '_blank', rel: 'noopener noreferrer' },
  });
  return h(
    'article',
    { className: `finding sev-${severity}` },
    h(
      'header',
      { className: 'finding-head' },
      h('span', { className: `badge badge-${severity}`, text: label }),
      h('code', { className: 'rule', text: finding.rule_id }),
      h('span', { className: 'lang', text: finding.language }),
    ),
    h('h3', { text: finding.title }),
    finding.snippet ? h('pre', {}, h('code', { text: finding.snippet })) : null,
    h('p', { text: finding.explanation }),
    h('p', { className: 'alt' }, h('strong', { text: 'Safer alternative. ' }), finding.safer_alternative),
    h('p', { className: 'finding-link' }, link),
  );
}
