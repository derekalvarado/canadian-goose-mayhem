import assert from "node:assert/strict";
import test from "node:test";
import { CANONICAL_WORLD_LAYOUT, CENTRAL_PLAZA_AREA_ID, cloneWorldLayout } from "../src/game/worldLayout.ts";
import { resolveEditorShortcut, WorldEditorHistory, type WorldEditorSnapshot } from "../src/game/worldEditorHistory.ts";

function snapshot(x: number, selectedId = "plaza.goose-fountain"): WorldEditorSnapshot {
  const layout = cloneWorldLayout(CANONICAL_WORLD_LAYOUT);
  layout.areas[0].instances[0].transform.x = x;
  return { layout, areaId: CENTRAL_PLAZA_AREA_ID, selectedId };
}

const key = (code: string, overrides: Partial<Parameters<typeof resolveEditorShortcut>[0]> = {}) => resolveEditorShortcut({ code, key: code.startsWith("Key") ? code.slice(3).toLowerCase() : code, metaKey: false, ctrlKey: false, shiftKey: false, targetIsTextEntry: false, ...overrides }, false, true);

test("editor shortcuts prioritize placement cancellation and selected deletion", () => {
  assert.deepEqual(resolveEditorShortcut({ code: "Escape", key: "Escape", metaKey: false, ctrlKey: false, shiftKey: false, targetIsTextEntry: false }, true, true), { type: "stop-placing" });
  assert.deepEqual(resolveEditorShortcut({ code: "Delete", key: "Delete", metaKey: false, ctrlKey: false, shiftKey: false, targetIsTextEntry: false }, true, true), { type: "stop-placing" });
  assert.deepEqual(key("Backspace"), { type: "delete-selected" });
  assert.equal(resolveEditorShortcut({ code: "Delete", key: "Delete", metaKey: false, ctrlKey: false, shiftKey: false, targetIsTextEntry: false }, false, false), undefined);
  assert.equal(resolveEditorShortcut({ code: "ArrowLeft", key: "ArrowLeft", metaKey: false, ctrlKey: false, shiftKey: false, targetIsTextEntry: true }, false, true), undefined);
});

test("editor shortcuts map undo, redo, and logical arrow movement", () => {
  assert.deepEqual(key("KeyZ", { metaKey: true }), { type: "undo" });
  assert.deepEqual(key("KeyZ", { ctrlKey: true, shiftKey: true }), { type: "redo" });
  assert.deepEqual(key("ArrowLeft"), { type: "move-selected", dx: -1, dz: 0 });
  assert.deepEqual(key("ArrowUp"), { type: "move-selected", dx: 0, dz: -1 });
});

test("editor history coalesces a transform and clears redo after a new edit", () => {
  const initial = snapshot(0);
  const moved = snapshot(0.25);
  const movedAgain = snapshot(0.5);
  const history = new WorldEditorHistory(initial);

  history.begin(initial);
  history.begin(initial);
  assert.equal(history.commit(moved), true);
  assert.equal(history.canUndo, true);
  assert.deepEqual(history.undo(moved)?.layout.areas[0].instances[0].transform.x, 0);
  assert.equal(history.canRedo, true);
  assert.deepEqual(history.redo(initial)?.layout.areas[0].instances[0].transform.x, 0.25);

  history.begin(moved);
  assert.equal(history.commit(movedAgain), true);
  assert.equal(history.canRedo, false);
  assert.deepEqual(history.undo(movedAgain)?.layout.areas[0].instances[0].transform.x, 0.25);
});
