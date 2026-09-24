import { cloneWorldLayout, serializeWorldLayout, validateWorldLayout, type WorldLayout } from "./worldLayout.ts";

export interface WorldEditorSnapshot {
  layout: WorldLayout;
  areaId: string;
  selectedId?: string;
}

export interface EditorKeyInput {
  code: string;
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  targetIsTextEntry: boolean;
}

export type EditorShortcutAction =
  | { type: "undo" }
  | { type: "redo" }
  | { type: "stop-placing" }
  | { type: "delete-selected" }
  | { type: "move-selected"; dx: number; dz: number; step?: number }
  | { type: "rotate-selected"; direction: number }
  | { type: "select-next"; direction: number }
  | { type: "orbit-camera"; horizontal: number; vertical: number }
  | { type: "zoom-camera"; direction: number }
  | { type: "focus-selected" }
  | { type: "reset-view" }
  | { type: "place-at-focus"; keepPlacing: boolean }
  | { type: "toggle-shortcuts" };

export function resolveEditorShortcut(input: EditorKeyInput, placing: boolean, hasSelection: boolean): EditorShortcutAction | undefined {
  const modifier = input.metaKey || input.ctrlKey;
  const isUndoRedo = input.key.toLowerCase() === "z" && modifier;
  if (isUndoRedo) return input.shiftKey ? { type: "redo" } : { type: "undo" };

  const isEscape = input.code === "Escape";
  const isDelete = input.code === "Delete" || input.code === "Backspace";
  if (placing && (isEscape || isDelete)) return { type: "stop-placing" };
  if (input.targetIsTextEntry) return undefined;

  if (input.code === "F1" || (input.code === "Slash" && input.shiftKey) || input.key === "?") return { type: "toggle-shortcuts" };
  if (input.code === "Home") return { type: "reset-view" };

  if (!placing) {
    if (input.code === "KeyJ") return { type: "orbit-camera", horizontal: -1, vertical: 0 };
    if (input.code === "KeyL") return { type: "orbit-camera", horizontal: 1, vertical: 0 };
    if (input.code === "KeyI") return { type: "orbit-camera", horizontal: 0, vertical: 1 };
    if (input.code === "KeyK") return { type: "orbit-camera", horizontal: 0, vertical: -1 };
    if (input.code === "KeyU") return { type: "zoom-camera", direction: -1 };
    if (input.code === "KeyO") return { type: "zoom-camera", direction: 1 };
    if (input.code === "KeyH") return hasSelection ? { type: "focus-selected" } : undefined;
    if (input.code === "Tab") return { type: "select-next", direction: input.shiftKey ? -1 : 1 };
    if (input.code === "KeyQ") return hasSelection ? { type: "rotate-selected", direction: -1 } : undefined;
    if (input.code === "KeyE") return hasSelection ? { type: "rotate-selected", direction: 1 } : undefined;
    if (isDelete) return hasSelection ? { type: "delete-selected" } : undefined;
    if (input.code === "ArrowLeft") return hasSelection ? { type: "move-selected", dx: -1, dz: 0, ...(input.shiftKey ? { step: 4 } : {}) } : undefined;
    if (input.code === "ArrowRight") return hasSelection ? { type: "move-selected", dx: 1, dz: 0, ...(input.shiftKey ? { step: 4 } : {}) } : undefined;
    if (input.code === "ArrowUp") return hasSelection ? { type: "move-selected", dx: 0, dz: -1, ...(input.shiftKey ? { step: 4 } : {}) } : undefined;
    if (input.code === "ArrowDown") return hasSelection ? { type: "move-selected", dx: 0, dz: 1, ...(input.shiftKey ? { step: 4 } : {}) } : undefined;
  } else if (input.code === "Enter") {
    return { type: "place-at-focus", keepPlacing: input.shiftKey };
  }

  return undefined;
}

function encode(snapshot: WorldEditorSnapshot): string {
  return JSON.stringify({
    layout: JSON.parse(serializeWorldLayout(snapshot.layout)),
    areaId: snapshot.areaId,
    selectedId: snapshot.selectedId,
  });
}

function decode(value: string): WorldEditorSnapshot {
  const parsed = JSON.parse(value) as { layout: unknown; areaId: string; selectedId?: string };
  return {
    layout: validateWorldLayout(parsed.layout),
    areaId: parsed.areaId,
    selectedId: parsed.selectedId,
  };
}

export class WorldEditorHistory {
  private readonly past: string[] = [];
  private readonly future: string[] = [];
  private current?: string;
  private pending?: string;

  constructor(initial?: WorldEditorSnapshot) {
    if (initial) this.reset(initial);
  }

  get canUndo(): boolean { return this.past.length > 0; }
  get canRedo(): boolean { return this.future.length > 0; }

  reset(snapshot: WorldEditorSnapshot): void {
    this.past.length = 0;
    this.future.length = 0;
    this.pending = undefined;
    this.current = encode(snapshot);
  }

  begin(snapshot: WorldEditorSnapshot): void {
    if (this.pending === undefined) this.pending = encode(snapshot);
  }

  cancel(): void { this.pending = undefined; }

  commit(snapshot: WorldEditorSnapshot): boolean {
    const next = encode(snapshot);
    const previous = this.pending ?? this.current;
    this.pending = undefined;
    if (previous === undefined || previous === next) {
      this.current = next;
      return false;
    }
    this.past.push(previous);
    this.future.length = 0;
    this.current = next;
    return true;
  }

  undo(current: WorldEditorSnapshot): WorldEditorSnapshot | undefined {
    if (!this.canUndo) return undefined;
    this.pending = undefined;
    this.future.push(encode(current));
    const previous = this.past.pop();
    if (!previous) return undefined;
    this.current = previous;
    return decode(previous);
  }

  redo(current: WorldEditorSnapshot): WorldEditorSnapshot | undefined {
    if (!this.canRedo) return undefined;
    this.pending = undefined;
    this.past.push(encode(current));
    const next = this.future.pop();
    if (!next) return undefined;
    this.current = next;
    return decode(next);
  }
}

export function cloneEditorSnapshot(snapshot: WorldEditorSnapshot): WorldEditorSnapshot {
  return { layout: cloneWorldLayout(snapshot.layout), areaId: snapshot.areaId, selectedId: snapshot.selectedId };
}
