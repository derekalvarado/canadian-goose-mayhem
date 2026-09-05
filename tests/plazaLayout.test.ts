import assert from "node:assert/strict";
import test from "node:test";
import {
  CANONICAL_PLAZA_LAYOUT,
  PLAZA_GROUP_IDS,
  PLAZA_LAYOUT_STORAGE_KEY,
  clonePlazaLayout,
  loadPlazaLayout,
  resetPlazaLayout,
  savePlazaLayout,
  serializePlazaLayout,
  validatePlazaLayout,
  type PlazaLayoutStorage,
} from "../src/game/plazaLayout.ts";

class MemoryStorage implements PlazaLayoutStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

test("canonical plaza layout serializes as a complete, reusable document", () => {
  const serialized = serializePlazaLayout(CANONICAL_PLAZA_LAYOUT);
  const roundTrip = validatePlazaLayout(JSON.parse(serialized) as unknown);

  assert.deepEqual(Object.keys(roundTrip.groups), [...PLAZA_GROUP_IDS]);
  assert.deepEqual(roundTrip, CANONICAL_PLAZA_LAYOUT);
});

test("browser draft save, load, and reset preserve the full arrangement", () => {
  const storage = new MemoryStorage();
  const edited = clonePlazaLayout(CANONICAL_PLAZA_LAYOUT);
  edited.groups["plaza.splash-pad"].position.x = 9.25;
  edited.groups["plaza.splash-pad"].rotationY = Math.PI / 4;

  assert.equal(savePlazaLayout(edited, storage), true);
  assert.equal(loadPlazaLayout(storage).groups["plaza.splash-pad"].position.x, 9.25);
  assert.ok(Math.abs(loadPlazaLayout(storage).groups["plaza.splash-pad"].rotationY - Math.PI / 4) < 1e-12);
  assert.deepEqual(resetPlazaLayout(storage), CANONICAL_PLAZA_LAYOUT);
  assert.equal(storage.getItem(PLAZA_LAYOUT_STORAGE_KEY), null);
});

test("invalid or incomplete imported layouts are rejected", () => {
  const missingGroup = JSON.parse(serializePlazaLayout(CANONICAL_PLAZA_LAYOUT)) as {
    groups: Record<string, unknown>;
  };
  delete missingGroup.groups["plaza.pavilion-stage"];
  assert.throws(() => validatePlazaLayout(missingGroup), /Missing layout group/);

  const unknownGroup = JSON.parse(serializePlazaLayout(CANONICAL_PLAZA_LAYOUT)) as {
    groups: Record<string, unknown>;
  };
  unknownGroup.groups["plaza.unrecognized"] = {};
  assert.throws(() => validatePlazaLayout(unknownGroup), /Unknown layout group/);
});

test("an invalid browser draft safely falls back to canonical defaults", () => {
  const storage = new MemoryStorage();
  storage.setItem(PLAZA_LAYOUT_STORAGE_KEY, "{not-json");
  const originalWarn = console.warn;
  console.warn = () => undefined;
  try {
    assert.deepEqual(loadPlazaLayout(storage), CANONICAL_PLAZA_LAYOUT);
  } finally {
    console.warn = originalWarn;
  }
});
