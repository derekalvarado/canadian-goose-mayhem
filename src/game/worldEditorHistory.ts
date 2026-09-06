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
  | { type: "move-selected"; dx: number; dz: number };

export function resolveEditorShortcut(input: EditorKeyInput, placing: boolean, hasSelection: boolean): EditorShortcutAction | undefined {
  const modifier = input.metaKey || input.ctrlKey;
  const isUndoRedo = input.key.toLowerCase() === "z" && modifier;
  if (isUndoRedo) return input.shiftKey ? { type: "redo" } : { type: "undo" };

  const isEscape = input.code === "Escape";
  const isDelete = input.code === "Delete" || input.code === "Backspace";
  if (placing && (isEscape || isDelete)) return { type: "stop-placing" };
  if (input.targetIsTextEntry) return undefined;
  if (!placing && !hasSelection) return undefined;
  if (!placing && isDelete) return { type: "delete-selected" };

  if (!placing) {
    if (input.code === "ArrowLeft") return { type: "move-selected", dx: -1, dz: 0 };
    if (input.code === "ArrowRight") return { type: "move-selected", dx: 1, dz: 0 };
    if (input.code === "ArrowUp") return { type: "move-selected", dx: 0, dz: -1 };
    if (input.code === "ArrowDown") return { type: "move-selected", dx: 0, dz: 1 };
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
