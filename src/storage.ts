import type { IndentStyle } from './json-tools.ts';

export interface PersistedState {
  input: string;
  indent: IndentStyle;
  sortKeys: boolean;
}

const STORAGE_KEY = 'genesis:json-formatter:v1';
const MAX_PERSISTED_INPUT = 200_000; // chars; keep localStorage well under quota

export const defaultState: PersistedState = {
  input: '',
  indent: 2,
  sortKeys: false,
};

export function loadState(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...defaultState };
    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    return {
      input: typeof parsed.input === 'string' ? parsed.input : defaultState.input,
      indent: isIndent(parsed.indent) ? parsed.indent : defaultState.indent,
      sortKeys: typeof parsed.sortKeys === 'boolean' ? parsed.sortKeys : defaultState.sortKeys,
    };
  } catch {
    return { ...defaultState };
  }
}

export function saveState(state: PersistedState): void {
  try {
    const input = state.input.length > MAX_PERSISTED_INPUT ? '' : state.input;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, input }));
  } catch {
    // Storage may be unavailable (private mode, quota). The app works without it.
  }
}

export function clearState(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

function isIndent(value: unknown): value is IndentStyle {
  return value === 2 || value === 4 || value === 'tab';
}
