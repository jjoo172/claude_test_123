import type { Finding, ScanTarget, Severity } from './types';

const SEVERITY_LABEL: Record<Severity, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

function download(filename: string, contents: string, mime: string): void {
  const blob = new Blob([contents], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function fence(code: string): string {
  let ticks = '```';
  while (code.includes(ticks)) ticks += '`';
  return `${ticks}\n${code}\n${ticks}`;
}

export function githubLineUrl(owner: string, repo: string, sha: string, path: string, line: number): string {
  const encodedPath = path.split('/').map((segment) => encodeURIComponent(segment)).join('/');
  return `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/blob/${encodeURIComponent(sha)}/${encodedPath}#L${line}`;
}

function slug(owner: string, repo: string): string {
  return `${owner}-${repo}`.replace(/[^\w.-]+/g, '-');
}

export function exportJson(target: ScanTarget): void {
  const payload = {
    scanner: 'memory-safety-scanner',
    disclaimer:
      'Heuristic pattern scan, not a vulnerability assessment. False positives and false negatives are expected.',
    scanned_at: new Date().toISOString(),
    owner: target.meta.owner,
    repo: target.meta.repo,
    ref: target.meta.ref,
    sha: target.meta.sha,
    files_scanned: target.report.files_scanned,
    counts: target.report.counts,
    languages: target.report.languages,
    truncation_note: target.meta.truncationNote,
    warning: target.meta.warning,
    findings: target.report.findings.map((finding) => ({
      ...finding,
      github_url: githubLineUrl(target.meta.owner, target.meta.repo, target.meta.sha, finding.path, finding.line),
    })),
    notes: target.report.notes,
  };
  download(
    `memory-safety-${slug(target.meta.owner, target.meta.repo)}.json`,
    JSON.stringify(payload, null, 2),
    'application/json',
  );
}

function findingMarkdown(finding: Finding, target: ScanTarget): string {
  const severity = finding.severity === 'info' ? 'Info' : SEVERITY_LABEL[finding.severity];
  const url = githubLineUrl(target.meta.owner, target.meta.repo, target.meta.sha, finding.path, finding.line);
  return [
    `### ${severity} \`${finding.rule_id}\` — ${finding.title}`,
    '',
    `\`${finding.path}\` line ${finding.line}`,
    '',
    ...(finding.snippet ? [fence(finding.snippet), ''] : []),
    finding.explanation,
    '',
    `Safer alternative: ${finding.safer_alternative}`,
    '',
    `[Open on GitHub](${url})`,
    '',
  ].join('\n');
}

export function exportMarkdown(target: ScanTarget): void {
  const { meta, report } = target;
  const byFile = new Map<string, Finding[]>();
  for (const finding of report.findings) {
    const list = byFile.get(finding.path) ?? [];
    list.push(finding);
    byFile.set(finding.path, list);
  }
  const sections = [...byFile.entries()]
    .map(([path, findings]) => [`## ${path}`, '', ...findings.map((finding) => findingMarkdown(finding, target))].join('\n'))
    .join('\n');
  const notes = report.notes
    .map((note) => `- **${note.rule_id}** in \`${note.path}\` line ${note.line}: ${note.explanation}`)
    .join('\n');

  const body = [
    `# Memory safety scan: ${meta.owner}/${meta.repo}`,
    '',
    `Ref: \`${meta.ref}\` (\`${meta.sha}\`)`,
    `Files scanned: ${report.files_scanned}`,
    `High: ${report.counts.high} · Medium: ${report.counts.medium} · Low: ${report.counts.low}`,
    '',
    'This is a heuristic, pattern-based scan, not a full vulnerability scanner. False positives and false negatives are expected. Complement it with CodeQL, clang-tidy, cargo-audit, and language sanitizers.',
    '',
    ...(meta.truncationNote ? [`Note: ${meta.truncationNote}`, ''] : []),
    ...(meta.warning ? [`Warning: ${meta.warning}`, ''] : []),
    ...(notes ? ['## Positive signals', '', notes, ''] : []),
    sections || '_No findings._',
    '',
  ].join('\n');

  download(`memory-safety-${slug(meta.owner, meta.repo)}.md`, body, 'text/markdown');
}
