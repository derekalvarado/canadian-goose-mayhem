import type { SimulationSessionState } from "./simulation/Simulation.ts";

/**
 * Saved progress: which tasks are crossed off and the durable facts behind
 * them. Objects and people are not saved; they start fresh on every visit.
 */
export const PROGRESS_STORAGE_KEY = "goose-game-2.progress.v1";
const PROGRESS_VERSION = 1;

export interface SavedProgress { readonly version: 1; readonly completedObjectiveIds: readonly string[]; readonly durableFacts: readonly string[] }
export interface ProgressStorage { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void }

export const EMPTY_PROGRESS: SavedProgress = { version: PROGRESS_VERSION, completedObjectiveIds: [], durableFacts: [] };

function storage(): ProgressStorage | undefined {
  try { return typeof window === "undefined" ? undefined : window.localStorage; } catch { return undefined; }
}
const strings = (value: unknown): string[] => Array.isArray(value)
  ? [...new Set(value.filter((item): item is string => typeof item === "string" && item.length > 0 && item.length < 200))] : [];

/** Anything unreadable, from another version, or malformed counts as no progress; this never throws. */
export function parseProgress(raw: string | null | undefined): SavedProgress {
  if (!raw) return EMPTY_PROGRESS;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null || (value as { version?: unknown }).version !== PROGRESS_VERSION) return EMPTY_PROGRESS;
    const record = value as Record<string, unknown>;
    return { version: PROGRESS_VERSION, completedObjectiveIds: strings(record.completedObjectiveIds), durableFacts: strings(record.durableFacts) };
  } catch { return EMPTY_PROGRESS; }
}

/** Progress only grows: a stale tab or an older save can never take back a crossed-off task. */
export function mergeProgress(left: SavedProgress, right: SavedProgress): SavedProgress {
  return { version: PROGRESS_VERSION,
    completedObjectiveIds: [...new Set([...left.completedObjectiveIds, ...right.completedObjectiveIds])],
    durableFacts: [...new Set([...left.durableFacts, ...right.durableFacts])] };
}

export function progressFromSession(state: SimulationSessionState): SavedProgress {
  return { version: PROGRESS_VERSION, completedObjectiveIds: [...new Set(state.completedObjectiveIds ?? [])], durableFacts: [...new Set(state.durableFacts)] };
}

export function sessionStateFromProgress(progress: SavedProgress): SimulationSessionState {
  return { durableFacts: [...progress.durableFacts], completedObjectiveIds: [...progress.completedObjectiveIds], areaStates: [] };
}

export function loadProgress(store: ProgressStorage | undefined = storage()): SavedProgress {
  try { return parseProgress(store?.getItem(PROGRESS_STORAGE_KEY)); } catch { return EMPTY_PROGRESS; }
}

export function saveProgress(state: SimulationSessionState, store: ProgressStorage | undefined = storage()): boolean {
  if (!store) return false;
  try {
    const merged = mergeProgress(loadProgress(store), progressFromSession(state));
    store.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(merged));
    return true;
  } catch { return false; }
}

export function clearProgress(store: ProgressStorage | undefined = storage()): void {
  try { store?.removeItem(PROGRESS_STORAGE_KEY); } catch { /* Storage is optional. */ }
}
