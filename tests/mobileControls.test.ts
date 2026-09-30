import assert from "node:assert/strict";
import test from "node:test";
import {
  FloatingJoystick, HURRY_ENTER_DISTANCE, HURRY_EXIT_DISTANCE, PauseReasons,
  parseTouchControlsPreference, shouldPauseForPortrait, shouldShowTouchControls,
} from "../src/game/mobileControls.ts";

test("floating joystick has a dead zone and hurry hysteresis", () => {
  const joystick = new FloatingJoystick();
  joystick.begin(100, 100);
  assert.deepEqual(joystick.update(110, 100), { moveX: 0, moveY: 0, hurry: false });
  const hurried = joystick.update(100 + HURRY_ENTER_DISTANCE, 100);
  assert.equal(hurried.hurry, true);
  assert.ok(hurried.moveX > 0);
  assert.equal(joystick.update(100 + HURRY_EXIT_DISTANCE + 1, 100).hurry, true);
  assert.equal(joystick.update(100 + HURRY_EXIT_DISTANCE - 1, 100).hurry, false);
  joystick.end();
  assert.deepEqual(joystick.update(200, 100), { moveX: 0, moveY: 0, hurry: false });
});

test("touch preferences validate safely and respect device capability", () => {
  assert.equal(parseTouchControlsPreference("show"), "show");
  assert.equal(parseTouchControlsPreference("broken"), "auto");
  assert.equal(shouldShowTouchControls("auto", true), true);
  assert.equal(shouldShowTouchControls("auto", false), false);
  assert.equal(shouldShowTouchControls("show", false), true);
  assert.equal(shouldShowTouchControls("hide", true), false);
});

test("pause reasons compose and portrait policy excludes desktop-sized windows", () => {
  const pauses = new PauseReasons();
  assert.equal(pauses.set("settings", true), true);
  assert.equal(pauses.set("hidden", true), false);
  assert.equal(pauses.set("settings", false), false);
  assert.equal(pauses.paused, true);
  assert.equal(pauses.set("hidden", false), true);
  assert.equal(pauses.paused, false);
  assert.equal(shouldPauseForPortrait(true, 390, 844), true);
  assert.equal(shouldPauseForPortrait(false, 390, 844), false);
  assert.equal(shouldPauseForPortrait(true, 844, 390), false);
});

test("page activity pause recovers when visibility returns before focus", () => {
  const pauses = new PauseReasons();
  assert.equal(pauses.syncPageActivity(true, false), true);
  assert.equal(pauses.paused, true);

  // Browsers may report a visible document just before the window focus event.
  assert.equal(pauses.syncPageActivity(false, false), false);
  assert.equal(pauses.paused, true);
  assert.equal(pauses.syncPageActivity(false, true), true);
  assert.equal(pauses.paused, false);
});
