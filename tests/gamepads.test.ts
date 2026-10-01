import assert from "node:assert/strict";
import test from "node:test";
import {
  applyGamepadDeadzone,
  formatGamepadDiagnostics,
  gamepadProfile,
  GamepadJoinLobby,
  sampleGamepad,
  type GamepadLike,
} from "../src/game/gamepads.ts";

function pad(overrides: Partial<GamepadLike> = {}): GamepadLike {
  return {
    id: "Generic Controller",
    index: 0,
    connected: true,
    mapping: "standard",
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 16 }, () => ({ pressed: false, value: 0 })),
    ...overrides,
  };
}

function press(source: GamepadLike, index: number, value = 1): GamepadLike {
  const buttons = source.buttons.map((button) => ({ ...button }));
  buttons[index] = { pressed: true, value };
  return { ...source, buttons };
}

test("controller profiles identify Pro Controllers and individual Joy-Cons", () => {
  assert.equal(gamepadProfile("Nintendo Switch Pro Controller").id, "switch-pro");
  assert.equal(gamepadProfile("Joy-Con (L)").id, "joycon-left-sideways");
  assert.equal(gamepadProfile("Joy-Con (R)").id, "joycon-right-sideways");
  assert.equal(gamepadProfile("8BitDo Wireless Controller").id, "standard");
});

test("deadzone removes drift and rescales usable stick travel", () => {
  assert.equal(applyGamepadDeadzone(0.14), 0);
  assert.equal(applyGamepadDeadzone(-0.15), 0);
  assert.equal(applyGamepadDeadzone(1), 1);
  assert.equal(applyGamepadDeadzone(-1), -1);
  assert.ok(applyGamepadDeadzone(0.5) > 0.4);
});

test("standard pads prefer the left stick and fall back to axes 2 and 3", () => {
  const left = sampleGamepad(pad({ axes: [0.5, -0.25, -1, 1] }));
  assert.ok(left.moveX > 0);
  assert.ok(left.moveY > 0);

  const rightFallback = sampleGamepad(pad({ axes: [0, 0, 0.5, -0.25] }));
  assert.ok(rightFallback.moveX > 0);
  assert.ok(rightFallback.moveY > 0);
});

test("sideways Joy-Cons rotate their stick frames in opposite directions", () => {
  const left = sampleGamepad(pad({ id: "Joy-Con (L)", axes: [0.6, 0] }));
  const right = sampleGamepad(pad({ id: "Joy-Con (R)", axes: [0.6, 0] }));
  assert.ok(left.moveY < 0);
  assert.ok(right.moveY > 0);
  assert.equal(Math.abs(left.moveX), 0);
  assert.equal(Math.abs(right.moveX), 0);
});

test("Nintendo face buttons retain physical-position actions", () => {
  const pro = sampleGamepad(press(pad({ id: "Nintendo Switch Pro Controller" }), 0));
  assert.equal(pro.honk, true);
  assert.equal(pro.interact, false);

  const left = sampleGamepad(press(pad({ id: "Joy-Con (L)" }), 14));
  assert.equal(left.honk, true);
});

test("press-to-join assigns at most two different pads and keeps stable slots", () => {
  const lobby = new GamepadJoinLobby();
  const pad0 = press(pad({ index: 0 }), 0);
  const pad1 = press(pad({ index: 1 }), 1);
  const pad2 = press(pad({ index: 2 }), 2);
  assert.deepEqual(lobby.update([pad0, pad1, pad2]), [
    { player: 1, padIndex: 0 },
    { player: 2, padIndex: 1 },
  ]);
  assert.deepEqual(lobby.update([pad0, pad1]), []);
  assert.equal(lobby.assignment(1), 0);
  assert.equal(lobby.assignment(2), 1);
  assert.equal(lobby.playerForPad(2), undefined);
  assert.deepEqual(lobby.update([null, pad1]), [], "a disconnected first pad keeps its player slot");
});

test("diagnostics expose every raw axis and active button for iPad debugging", () => {
  const output = formatGamepadDiagnostics([
    press(pad({ id: "Joy-Con (R)", index: 4, axes: [0.25, -0.5] }), 3),
  ]);
  assert.match(output, /Pad 4 · Right Joy-Con/);
  assert.match(output, /axes 0:0\.25  1:-0\.50/);
  assert.match(output, /pressed 3:1\.00\*/);
  assert.match(formatGamepadDiagnostics([]), /Press a button/);
});
