import assert from "node:assert/strict";
import test from "node:test";
import { CANONICAL_WORLD_LAYOUT, COFFEE_SHOP_AREA_ID, getWorldArea } from "../src/game/worldLayout.ts";
import { createWorldRules } from "../src/game/worldLevel.ts";
import { CAFE_TASK_IDS } from "../src/game/challenges.ts";
import { clearProgress, loadProgress, mergeProgress, parseProgress, PROGRESS_STORAGE_KEY, saveProgress, sessionStateFromProgress, type ProgressStorage } from "../src/game/progress.ts";
import { FIXED_STEP, Simulation } from "../src/game/simulation/Simulation.ts";

function memoryStore(): ProgressStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (key) => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); }, removeItem: (key) => { data.delete(key); } };
}
const cafeRules = () => createWorldRules(getWorldArea(CANONICAL_WORLD_LAYOUT, COFFEE_SHOP_AREA_ID), CANONICAL_WORLD_LAYOUT.transitions);

/** Turns the café radio off, which crosses off one task. */
function finishMusicTask(simulation: Simulation): void {
  const radio = simulation.world.entities.find((entity) => entity.tags.includes("music"))!;
  simulation.setPlayerTransform({ x: radio.position.x - 0.3, y: 0, z: radio.position.z + 0.75 }, 0);
  simulation.advance(FIXED_STEP, { moveX: 0, moveZ: 0, hurry: false, honkPressed: false, interactPressed: true });
  assert.equal(simulation.isObjectiveComplete(CAFE_TASK_IDS.musicOff), true);
}

test("crossed-off tasks survive a reload and are not announced again", () => {
  const store = memoryStore();
  const first = new Simulation(cafeRules());
  finishMusicTask(first);
  assert.equal(saveProgress(first.sessionState, store), true);

  const reloaded = new Simulation(cafeRules(), sessionStateFromProgress(loadProgress(store)));
  assert.equal(reloaded.isObjectiveComplete(CAFE_TASK_IDS.musicOff), true);
  assert.equal(reloaded.objectiveList.filter((objective) => objective.completed).length, 1);
  const events = reloaded.advance(FIXED_STEP * 30, { moveX: 0, moveZ: 0, hurry: false, honkPressed: false });
  assert.deepEqual(events.filter((event) => event.type === "objective-completed"), []);
  // The world itself starts fresh: the radio is playing again.
  assert.equal(reloaded.world.entities.find((entity) => entity.tags.includes("music"))?.active, true);
});

test("saving never takes back a task, even from an older session", () => {
  const store = memoryStore();
  const done = new Simulation(cafeRules());
  finishMusicTask(done);
  saveProgress(done.sessionState, store);
  saveProgress(new Simulation(cafeRules()).sessionState, store);
  assert.deepEqual(loadProgress(store).completedObjectiveIds, [CAFE_TASK_IDS.musicOff]);
  assert.deepEqual(mergeProgress(parseProgress(JSON.stringify({ version: 1, completedObjectiveIds: ["a"], durableFacts: ["x"] })),
    parseProgress(JSON.stringify({ version: 1, completedObjectiveIds: ["b", "a"], durableFacts: [] }))).completedObjectiveIds, ["a", "b"]);
});

test("damaged, foreign, or missing saves load as an empty list without errors", () => {
  for (const raw of [null, "", "{", "[]", "42", JSON.stringify({ version: 99, completedObjectiveIds: ["a"] }),
    JSON.stringify({ version: 1, completedObjectiveIds: "a", durableFacts: [1, null] })]) {
    const progress = parseProgress(raw);
    assert.deepEqual(progress.completedObjectiveIds, []);
    assert.deepEqual(progress.durableFacts, []);
  }
  const unknown = new Simulation(cafeRules(), sessionStateFromProgress(parseProgress(JSON.stringify({ version: 1, completedObjectiveIds: ["retired.task"], durableFacts: [] }))));
  assert.equal(unknown.objectiveList.some((objective) => objective.completed), false, "tasks that no longer exist are ignored");
  const broken: ProgressStorage = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("full"); }, removeItem: () => { throw new Error("blocked"); } };
  assert.deepEqual(loadProgress(broken).completedObjectiveIds, []);
  assert.equal(saveProgress(new Simulation(cafeRules()).sessionState, broken), false);
  assert.doesNotThrow(() => clearProgress(broken));
});

test("starting over clears the saved list", () => {
  const store = memoryStore();
  const simulation = new Simulation(cafeRules());
  finishMusicTask(simulation);
  saveProgress(simulation.sessionState, store);
  clearProgress(store);
  assert.equal(store.data.has(PROGRESS_STORAGE_KEY), false);
  const fresh = new Simulation(cafeRules(), sessionStateFromProgress(loadProgress(store)));
  assert.equal(fresh.objectiveList.some((objective) => objective.completed), false);
});
