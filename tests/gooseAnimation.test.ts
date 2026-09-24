import assert from "node:assert/strict";
import test from "node:test";
import { GooseAnimationState, GOOSE_ANIMATION } from "../src/game/GooseAnimation.ts";

test("locomotion crossfades smoothly, selects sneak, and remains normalized", () => {
  const state = new GooseAnimationState();
  state.update(1/60, 1, 0, false, false);
  assert.ok(state.weights.idle > 0.8, "hurry must not snap on in one frame");
  for (let i = 0; i < 180; i++) state.update(1/60, 1, 0, false, false);
  assert.ok(state.weights.hurry > 0.999);
  for (let i = 0; i < 180; i++) {
    state.update(1/60, 0.5, 0, false, true);
    assert.ok(Math.abs(Object.values(state.weights).reduce((a,b) => a+b) - 1) < 1e-9);
  }
  assert.ok(state.weights.sneak > 0.999);
  for (let i = 0; i < 180; i++) state.update(1/60, 0, 0, false, false);
  assert.ok(state.weights.idle > 0.999);
  const phase = state.phase;
  state.update(1/60, 0, 0, false, false);
  assert.equal(state.phase, phase, "stationary goose must stop stepping");
});

test("gait never restarts at the walk/hurry threshold; head turns are bounded", () => {
  const state = new GooseAnimationState();
  for (let i=0; i<240; i++) {
    const phase = state.phase;
    state.update(1/60, i%2 ? 0.94 : 0.6, 100, true, false, 10, -10);
    assert.ok((state.phase - phase + 1) % 1 < 0.05);
    assert.ok(state.lookYaw <= GOOSE_ANIMATION.maxLookYaw);
    assert.ok(state.lookPitch >= -GOOSE_ANIMATION.maxLookPitch);
  }
  const snapshot = JSON.stringify(state);
  state.update(0, 0, 0, false, false);
  state.update(NaN, 0, 0, false, false);
  assert.equal(JSON.stringify(state), snapshot, "paused or invalid frames must not animate");
});

test("footstep is reported twice per gait cycle only while moving", () => {
  const state = new GooseAnimationState();
  let steps = 0;
  for (let i = 0; i < 600; i++) {
    state.update(1/60, 0.5, 0, false, false);
    if (state.stepped) steps += 1;
  }
  assert.ok(steps >= 8, "a walking goose must land audible footsteps");

  const idle = new GooseAnimationState();
  let idleSteps = 0;
  for (let i = 0; i < 120; i++) {
    idle.update(1/60, 0, 0, false, false);
    if (idle.stepped) idleSteps += 1;
  }
  assert.equal(idleSteps, 0, "a stationary goose must not trigger footsteps");
});

test("blend weights and head tracking agree at 30, 60, and 144 FPS", () => {
  const states = [30,60,144].map((fps) => {
    const state = new GooseAnimationState();
    for (let frame=0; frame<fps; frame++) state.update(1/fps, 0.8, 0.6, true, false, -0.5, 0.2);
    return state;
  });
  for (const state of states.slice(1)) {
    for (const name of ["idle","walk","hurry","sneak"] as const) {
      assert.ok(Math.abs(state.weights[name] - states[0].weights[name]) < 1e-9);
    }
    assert.ok(Math.abs(state.lookYaw - states[0].lookYaw) < 1e-9);
    assert.ok(Math.abs(state.phase - states[0].phase) < 0.04);
  }
});
