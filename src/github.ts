import manifest from '../backend/scanner/manifest.json';

const EXTENSIONS = new Set(
  Object.keys(manifest.extension_languages).map((ext) => ext.toLowerCase()),
);
const FILENAMES = new Set(
  Object.keys(manifest.filename_languages).map((name) => name.toLowerCase()),
);
const VENDORED = new Set<string>(manifest.vendored_directories);

export const LIMITS = {
  maxFiles: 400,
  maxBytes: 8 * 1024 * 1024,
  maxFileBytes: 256 * 1024,
} as const;

export class GithubError extends Error {
  readonly status: number | null;

  constructor(message: string, status: number | null) {
    super(message);
    this.name = 'GithubError';
    this.status = status;
  }
}

export interface ParsedRepo {
  owner: string;
  repo: string;
  refFromUrl?: string;
}

export interface RemoteFile {
  path: string;
  sha: string;
  size: number;
}

export interface FetchedRepo {
  owner: string;
  repo: string;
  ref: string;
  sha: string;
  files: { path: string; text: string }[];
  filesConsidered: number;
  skippedBinary: number;
  skippedLarge: number;
  skippedVendored: number;
  truncationNote: string | null;
  warning: string | null;
}

interface RepoResponse {
  default_branch?: string;
  private?: boolean;
}

interface CommitResponse {
  sha?: string;
  commit?: { tree?: { sha?: string } };
}

interface TreeResponse {
  truncated?: boolean;
  tree?: Array<{ path?: string; type?: string; sha?: string; size?: number }>;
}

export function parseRepoInput(input: string): ParsedRepo {
  let text = input.trim();
  if (!text) {
    throw new GithubError('Enter a GitHub repository as owner/repo or a github.com URL.', null);
  }
  text = text.replace(/\.git$/i, '').replace(/\/+$/, '');

  const url = text.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/\s]+)\/([^/\s]+)(.*)$/i);
  if (url) {
    const owner = url[1];
    const repo = url[2];
    const rest = url[3] ?? '';
    if (!owner || !repo) {
      throw new GithubError('Could not parse that GitHub URL.', null);
    }
    let refFromUrl: string | undefined;
    if (rest.startsWith('/tree/')) {
      const ref = decodeURIComponent(rest.slice('/tree/'.length).replace(/\/+$/, ''));
      if (ref) refFromUrl = ref;
    } else if (rest.startsWith('/blob/') || rest.startsWith('/commit/')) {
      const parts = rest.split('/').filter(Boolean);
      const ref = parts[1] ? decodeURIComponent(parts[1]) : '';
      if (ref) refFromUrl = ref;
    }
    return { owner, repo, ...(refFromUrl ? { refFromUrl } : {}) };
  }

  const short = text.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/);
  const owner = short?.[1];
  const repo = short?.[2];
  if (owner && repo) return { owner, repo };

  throw new GithubError(
    'Could not parse that repository. Use owner/repo or https://github.com/owner/repo.',
    null,
  );
}

export function isScannablePath(path: string): boolean {
  const name = path.split('/').pop() ?? '';
  if (!name || name.toLowerCase().endsWith('.min.js')) return false;
  if (FILENAMES.has(name.toLowerCase())) return true;
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return false;
  return EXTENSIONS.has(name.slice(dot).toLowerCase());
}

function isVendoredPath(path: string): boolean {
  return path.split('/').some((segment) => VENDORED.has(segment));
}

function authHeaders(token: string | null, accept: string): Headers {
  const headers = new Headers({
    Accept: accept,
    'X-GitHub-Api-Version': '2022-11-28',
  });
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return headers;
}

async function errorDetail(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string };
    return body.message ?? response.statusText;
  } catch {
    return response.statusText || 'Unknown error';
  }
}

function rateLimitMessage(response: Response, detail: string, token: string | null): string {
  const resetRaw = response.headers.get('x-ratelimit-reset');
  const resetSeconds = resetRaw ? Number(resetRaw) : NaN;
  const when = Number.isFinite(resetSeconds)
    ? ` The limit resets at ${new Date(resetSeconds * 1000).toLocaleString()}.`
    : '';
  const hint = token
    ? 'This token is limited to 5,000 GitHub API requests per hour.'
    : 'Without a token, GitHub allows about 60 API requests per hour. Add a personal access token to raise that to 5,000 per hour.';
  return `GitHub rate limit reached (HTTP ${response.status}). ${detail} ${hint}${when}`;
}

async function apiSend(url: string, token: string | null, accept: string): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, { headers: authHeaders(token, accept), signal: AbortSignal.timeout(30000) });
  } catch {
    throw new GithubError(
      'Could not reach the GitHub API, or it took too long to respond. Check your network connection and try again.',
      null,
    );
  }
  if (response.status === 403 || response.status === 429) {
    const detail = await errorDetail(response);
    const remaining = response.headers.get('x-ratelimit-remaining');
    if (response.status === 429 || remaining === '0' || /rate limit/i.test(detail)) {
      throw new GithubError(rateLimitMessage(response, detail, token), response.status);
    }
    throw new GithubError(`GitHub refused the request (HTTP ${response.status}). ${detail}`, response.status);
  }
  return response;
}

async function apiJson<T>(url: string, token: string | null, notFound: string): Promise<T> {
  const response = await apiSend(url, token, 'application/vnd.github+json');
  if (response.status === 404) throw new GithubError(notFound, 404);
  if (!response.ok) {
    const detail = await errorDetail(response);
    throw new GithubError(`GitHub API error (HTTP ${response.status}). ${detail}`, response.status);
  }
  return (await response.json()) as T;
}

function encodePath(path: string): string {
  return path.split('/').map((segment) => encodeURIComponent(segment)).join('/');
}

function selectFiles(
  entries: RemoteFile[],
  treeTruncated: boolean,
): { selected: RemoteFile[]; skippedLarge: number; note: string | null } {
  const skippedLarge = entries.filter((entry) => entry.size > LIMITS.maxFileBytes).length;
  const eligible = entries
    .filter((entry) => entry.size <= LIMITS.maxFileBytes)
    .sort((a, b) => a.path.localeCompare(b.path));

  const selected: RemoteFile[] = [];
  let bytes = 0;
  let hitCap = false;
  for (const entry of eligible) {
    if (selected.length >= LIMITS.maxFiles || bytes + entry.size > LIMITS.maxBytes) {
      hitCap = true;
      break;
    }
    selected.push(entry);
    bytes += entry.size;
  }

  const notes: string[] = [];
  if (treeTruncated) {
    notes.push('GitHub truncated the recursive tree, so some files were never listed.');
  }
  if (hitCap) {
    notes.push(
      `Fetched ${selected.length} of ${eligible.length} scannable files (cap is ${LIMITS.maxFiles} files or 8 MB).`,
    );
  }
  if (skippedLarge > 0) {
    notes.push(`Skipped ${skippedLarge} file${skippedLarge === 1 ? '' : 's'} larger than 256 KB.`);
  }
  return { selected, skippedLarge, note: notes.length ? notes.join(' ') : null };
}

async function fetchPublicRaw(owner: string, repo: string, sha: string, path: string): Promise<Uint8Array | null> {
  const url = `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeURIComponent(sha)}/${encodePath(path)}`;
  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(20000) });
  } catch {
    return null;
  }
  if (response.status === 404 || response.status === 403) return null;
  if (!response.ok) return null;
  return new Uint8Array(await response.arrayBuffer());
}

async function fetchBlob(owner: string, repo: string, fileSha: string, token: string | null): Promise<Uint8Array> {
  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/blobs/${encodeURIComponent(fileSha)}`;
  const response = await apiSend(url, token, 'application/vnd.github.raw');
  if (response.status === 404) {
    throw new GithubError(`GitHub returned 404 for blob ${fileSha}.`, 404);
  }
  if (!response.ok) {
    const detail = await errorDetail(response);
    throw new GithubError(`GitHub API error (HTTP ${response.status}) while reading a file. ${detail}`, response.status);
  }
  return new Uint8Array(await response.arrayBuffer());
}

function decodeText(bytes: Uint8Array): string | null {
  if (bytes.byteLength > LIMITS.maxFileBytes || bytes.includes(0)) return null;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

async function mapPool<T>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  if (items.length === 0) return;
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      const item = items[index];
      if (item === undefined) return;
      await worker(item);
    }
  });
  await Promise.all(runners);
}

export async function fetchRepository(options: {
  input: string;
  refInput: string;
  token: string | null;
  skipVendored: boolean;
  onProgress: (message: string) => void;
}): Promise<FetchedRepo> {
  const parsed = parseRepoInput(options.input);
  const { owner, repo } = parsed;
  const token = options.token?.trim() ? options.token.trim() : null;

  options.onProgress(`Looking up ${owner}/${repo}…`);
  const repoInfo = await apiJson<RepoResponse>(
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
    token,
    `GitHub returned 404 for ${owner}/${repo}. Check the name. Private repositories need a token that can read them.`,
  );
  const ref = options.refInput.trim() || parsed.refFromUrl || repoInfo.default_branch || 'HEAD';

  options.onProgress(`Resolving ${ref}…`);
  const commit = await apiJson<CommitResponse>(
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits/${encodeURIComponent(ref)}`,
    token,
    `GitHub returned 404 for ref “${ref}”. Check the branch, tag, or commit SHA.`,
  );
  const sha = commit.sha;
  const treeSha = commit.commit?.tree?.sha;
  if (!sha || !treeSha) {
    throw new GithubError(`GitHub did not return a commit or tree for “${ref}”.`, null);
  }

  options.onProgress('Reading the file tree…');
  const tree = await apiJson<TreeResponse>(
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(treeSha)}?recursive=1`,
    token,
    `GitHub returned 404 for the tree of ${sha}.`,
  );

  let skippedVendored = 0;
  const candidates: RemoteFile[] = [];
  for (const entry of tree.tree ?? []) {
    if (entry.type !== 'blob' || !entry.path || !entry.sha) continue;
    if (!isScannablePath(entry.path)) continue;
    if (options.skipVendored && isVendoredPath(entry.path)) {
      skippedVendored += 1;
      continue;
    }
    candidates.push({ path: entry.path, sha: entry.sha, size: entry.size ?? 0 });
  }

  const { selected, skippedLarge: skippedByTree, note: selectionNote } = selectFiles(candidates, Boolean(tree.truncated));
  let note = selectionNote;
  const files: { path: string; text: string }[] = [];
  let skippedBinary = 0;
  let skippedLarge = skippedByTree;
  let skippedFetch = 0;
  let fetched = 0;
  const failure: { error: Error | null } = { error: null };
  const privateRepo = Boolean(repoInfo.private);

  options.onProgress(
    selected.length === 0
      ? 'No scannable source files in this tree.'
      : `Fetching 0 / ${selected.length} files…`,
  );

  await mapPool(selected, 8, async (entry) => {
    if (failure.error) return;
    try {
      let bytes: Uint8Array | null = null;
      if (!privateRepo) bytes = await fetchPublicRaw(owner, repo, sha, entry.path);
      else bytes = await fetchBlob(owner, repo, entry.sha, token);
      fetched += 1;
      if (!bytes) {
        skippedFetch += 1;
        options.onProgress(`Fetching ${fetched} / ${selected.length} files…`);
        return;
      }
      if (bytes.byteLength > LIMITS.maxFileBytes) {
        skippedLarge += 1;
      } else {
        const text = decodeText(bytes);
        if (text === null) skippedBinary += 1;
        else files.push({ path: entry.path, text });
      }
      options.onProgress(`Fetching ${fetched} / ${selected.length} files…`);
    } catch (error) {
      if (!failure.error) {
        failure.error = error instanceof Error ? error : new Error('Failed while fetching files.');
      }
    }
  });

  files.sort((a, b) => a.path.localeCompare(b.path));
  let warning: string | null = null;
  if (skippedFetch > 0) {
    const missed = `Could not download ${skippedFetch} file${skippedFetch === 1 ? '' : 's'} before the per-file timeout.`;
    note = note ? `${note} ${missed}` : missed;
  }
  if (failure.error) {
    if (files.length === 0) throw failure.error;
    warning = `${failure.error.message} Showing the ${files.length} file${files.length === 1 ? '' : 's'} fetched before the error.`;
  }

  return {
    owner,
    repo,
    ref,
    sha,
    files,
    filesConsidered: candidates.length,
    skippedBinary,
    skippedLarge,
    skippedVendored,
    truncationNote: note,
    warning,
  };
}
