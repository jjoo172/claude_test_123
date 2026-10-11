export type Severity = 'high' | 'medium' | 'low';

export interface Finding {
  rule_id: string;
  severity: Severity | 'info';
  title: string;
  explanation: string;
  safer_alternative: string;
  language: string;
  path: string;
  line: number;
  column: number;
  snippet: string;
  kind: 'finding' | 'note';
  repo_level: boolean;
}

export interface ScanReport {
  files_scanned: number;
  findings: Finding[];
  notes: Finding[];
  languages: Record<string, number>;
  counts: Record<Severity, number>;
}

export interface RepoMeta {
  owner: string;
  repo: string;
  ref: string;
  sha: string;
  filesFetched: number;
  skippedBinary: number;
  skippedLarge: number;
  skippedVendored: number;
  truncationNote: string | null;
  warning: string | null;
}

export interface ScanTarget {
  meta: RepoMeta;
  report: ScanReport;
}
