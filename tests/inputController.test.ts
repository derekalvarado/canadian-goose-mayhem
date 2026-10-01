import assert from "node:assert/strict";
import test from "node:test";
import { InputController } from "../src/game/InputController.ts";

test("spread and sneak toggle while threaten stays active only while held", () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const originalHTMLElement = Object.getOwnPropertyDescriptor(globalThis, "HTMLElement");
  const listeners = new Map<string, (event: any) => void>();
  const buttons = Array.from({ length: 8 }, () => ({ pressed: false, value: 0 }));
  const gamepad = { connected: true, id: "Standard controller", mapping: "standard", axes: [0, 0], buttons };

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { addEventListener: (name: string, listener: (event: any) => void) => listeners.set(name, listener) },
  });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { getGamepads: () => [gamepad] },
  });
  Object.defineProperty(globalThis, "HTMLElement", { configurable: true, value: class {} });

  try {
    const input = new InputController(() => {});
    const key = (type: "keydown" | "keyup", code: string, repeat = false): void => {
      listeners.get(type)?.({ code, repeat, target: null, preventDefault() {} });
    };

    key("keydown", "KeyQ");
    assert.equal(input.sample().wingsSpread, true);
    key("keydown", "KeyQ");
    assert.equal(input.sample().wingsSpread, true, "a duplicate keydown should not toggle it again");
    key("keydown", "KeyQ", true);
    assert.equal(input.sample().wingsSpread, true, "holding the key should not toggle it again");
    key("keyup", "KeyQ");
    key("keydown", "KeyQ");
    assert.equal(input.sample().wingsSpread, false);
    key("keyup", "KeyQ");

    key("keydown", "KeyE");
    assert.equal(input.sample().sneaking, true);
    assert.equal(input.sample().threatening, false, "sneaking should not threaten anyone");
    key("keyup", "KeyE");
    key("keydown", "KeyE");
    assert.equal(input.sample().sneaking, false);
    key("keyup", "KeyE");

    key("keydown", "ControlLeft");
    assert.equal(input.sample().threatening, true);
    key("keyup", "ControlLeft");
    assert.equal(input.sample().threatening, false, "threatening should end when Ctrl is released");

    buttons[2]!.pressed = true;
    assert.equal(input.sample().wingsSpread, true);
    assert.equal(input.sample().wingsSpread, true, "holding the controller button should not toggle it again");
    buttons[2]!.pressed = false;
    input.sample();
    buttons[2]!.pressed = true;
    assert.equal(input.sample().wingsSpread, false);
    buttons[2]!.pressed = false;
    input.sample();

    buttons[3]!.pressed = true;
    assert.equal(input.sample().sneaking, true);
    buttons[3]!.pressed = false;
    input.sample();
    buttons[3]!.pressed = true;
    assert.equal(input.sample().sneaking, false);
    buttons[3]!.pressed = false;
    input.sample();

    buttons[4]!.pressed = true;
    assert.equal(input.sample().threatening, true);
    assert.equal(input.sample().threatening, true, "holding the controller button should keep threatening active");
    buttons[4]!.pressed = false;
    assert.equal(input.sample().threatening, false);

    buttons[1]!.pressed = true;
    assert.equal(input.sample().interactPressed, true, "standard controllers keep the east face button for use");
    buttons[1]!.pressed = false;
    input.sample();

    input.toggleTouchPose("wings");
    assert.equal(input.sample().wingsSpread, true);
    input.toggleTouchPose("wings");
    assert.equal(input.sample().wingsSpread, false);
    input.toggleTouchPose("sneak");
    assert.equal(input.sample().sneaking, true);
    input.toggleTouchPose("sneak");
    assert.equal(input.sample().sneaking, false);
    input.setTouchThreatening(true);
    assert.equal(input.sample().threatening, true);
    input.setTouchThreatening(false);
    assert.equal(input.sample().threatening, false);

    input.toggleTouchPose("wings");
    input.toggleTouchPose("sneak");
    input.clear();
    assert.equal(input.sample().wingsSpread, false);
    assert.equal(input.sample().sneaking, false);
    assert.equal(input.sample().threatening, false);
  } finally {
    for (const [name, descriptor] of [
      ["window", originalWindow],
      ["navigator", originalNavigator],
      ["HTMLElement", originalHTMLElement],
    ] as const) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  }
});

test("a single right Joy-Con held sideways maps its digital stick and rotated face buttons", () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const originalHTMLElement = Object.getOwnPropertyDescriptor(globalThis, "HTMLElement");
  const buttons = Array.from({ length: 17 }, () => ({ pressed: false, value: 0 }));
  const gamepad = {
    connected: true,
    id: "Joy-Con (R) Gamepad",
    mapping: "",
    axes: [0, 0, 0, 0],
    buttons,
  };

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { addEventListener() {} },
  });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { getGamepads: () => [gamepad] },
  });
  Object.defineProperty(globalThis, "HTMLElement", { configurable: true, value: class {} });

  try {
    const input = new InputController(() => {});

    buttons[12]!.pressed = true;
    let frame = input.sample();
    assert.equal(frame.gamepadLayout, "single-right-joycon");
    assert.deepEqual(frame.move.toArray(), [0, 1]);
    buttons[15]!.pressed = true;
    frame = input.sample();
    assert.ok(Math.abs(frame.move.x - Math.SQRT1_2) < 1e-9);
    assert.ok(Math.abs(frame.move.y - Math.SQRT1_2) < 1e-9);
    buttons[12]!.pressed = false;
    buttons[15]!.pressed = false;
    input.sample();

    buttons[0]!.pressed = true;
    assert.equal(input.sample().honkPressed, true, "A honks");
    buttons[0]!.pressed = false;
    input.sample();

    buttons[2]!.pressed = true;
    frame = input.sample();
    assert.equal(frame.interactPressed, true, "X uses while the Joy-Con is sideways");
    assert.equal(frame.wingsSpread, false);
    buttons[2]!.pressed = false;
    input.sample();

    buttons[1]!.pressed = true;
    assert.equal(input.sample().wingsSpread, true, "B toggles wings while the Joy-Con is sideways");
    buttons[1]!.pressed = false;
    input.sample();

    buttons[3]!.pressed = true;
    assert.equal(input.sample().sneaking, true, "Y toggles sneak");
    buttons[3]!.pressed = false;
    input.sample();

    buttons[4]!.pressed = true;
    assert.equal(input.sample().threatening, true, "SL threatens while held");
    buttons[4]!.pressed = false;
    input.sample();

    buttons[5]!.pressed = true;
    assert.equal(input.sample().hurry, true, "SR hurries while held");
  } finally {
    for (const [name, descriptor] of [
      ["window", originalWindow],
      ["navigator", originalNavigator],
      ["HTMLElement", originalHTMLElement],
    ] as const) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  }
});
