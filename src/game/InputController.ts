import * as THREE from "three";

export type InputDevice = "keyboard" | "gamepad";

export interface InputFrame {
  move: THREE.Vector2;
  hurry: boolean;
  honkPressed: boolean;
  device: InputDevice;
}

const MOVEMENT_KEYS = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "ArrowUp",
  "ArrowLeft",
  "ArrowDown",
  "ArrowRight",
  "ShiftLeft",
  "ShiftRight",
  "Space",
]);

function applyDeadzone(value: number, deadzone = 0.18): number {
  const magnitude = Math.abs(value);
  if (magnitude <= deadzone) return 0;
  return Math.sign(value) * ((magnitude - deadzone) / (1 - deadzone));
}

export class InputController {
  readonly movement = new THREE.Vector2();
  private readonly keys = new Set<string>();
  private lastDevice: InputDevice = "keyboard";
  private honkQueued = false;
  private gamepadHonkWasDown = false;
  private connectedGamepad = false;
  private readonly onDeviceChanged: (device: InputDevice, connected: boolean) => void;

  constructor(onDeviceChanged: (device: InputDevice, connected: boolean) => void) {
    this.onDeviceChanged = onDeviceChanged;
    window.addEventListener("keydown", this.handleKeyDown, { passive: false });
    window.addEventListener("keyup", this.handleKeyUp, { passive: false });
    window.addEventListener("gamepadconnected", this.handleGamepadConnection);
    window.addEventListener("gamepaddisconnected", this.handleGamepadConnection);
  }

  sample(): InputFrame {
    let horizontal = Number(this.keys.has("KeyD") || this.keys.has("ArrowRight"))
      - Number(this.keys.has("KeyA") || this.keys.has("ArrowLeft"));
    let vertical = Number(this.keys.has("KeyW") || this.keys.has("ArrowUp"))
      - Number(this.keys.has("KeyS") || this.keys.has("ArrowDown"));
    let hurry = this.keys.has("ShiftLeft") || this.keys.has("ShiftRight");
    let honkPressed = this.honkQueued;
    this.honkQueued = false;

    const gamepads = navigator.getGamepads?.() ?? [];
    const gamepad = Array.from(gamepads).find((candidate) => candidate?.connected);

    if (gamepad) {
      this.connectedGamepad = true;
      const stickX = applyDeadzone(gamepad.axes[0] ?? 0);
      const stickY = -applyDeadzone(gamepad.axes[1] ?? 0);
      const gamepadHurry = (gamepad.buttons[7]?.value ?? 0) > 0.25
        || Boolean(gamepad.buttons[5]?.pressed);
      const gamepadHonkDown = Boolean(gamepad.buttons[0]?.pressed);
      const gamepadActive = Math.hypot(stickX, stickY) > 0.03
        || gamepadHurry
        || gamepadHonkDown;

      if (gamepadActive) {
        horizontal = stickX;
        vertical = stickY;
        hurry = gamepadHurry;
        if (this.lastDevice !== "gamepad") {
          this.lastDevice = "gamepad";
          this.onDeviceChanged("gamepad", true);
        }
      }

      if (gamepadHonkDown && !this.gamepadHonkWasDown) honkPressed = true;
      this.gamepadHonkWasDown = gamepadHonkDown;
    } else {
      this.connectedGamepad = false;
      this.gamepadHonkWasDown = false;
    }

    this.movement.set(horizontal, vertical);
    if (this.movement.lengthSq() > 1) this.movement.normalize();

    return {
      move: this.movement,
      hurry,
      honkPressed,
      device: this.lastDevice,
    };
  }

  clear(): void {
    this.honkQueued = false;
    this.keys.clear();
    this.movement.set(0, 0);
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (!MOVEMENT_KEYS.has(event.code)) return;
    if (event.target instanceof HTMLElement && event.target.closest("button, input, textarea, select, [contenteditable]")) return;
    event.preventDefault();
    this.keys.add(event.code);

    if (event.code === "Space" && !event.repeat) this.honkQueued = true;
    if (this.lastDevice !== "keyboard") {
      this.lastDevice = "keyboard";
      this.onDeviceChanged("keyboard", this.connectedGamepad);
    }
  };

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    if (!MOVEMENT_KEYS.has(event.code)) return;
    this.keys.delete(event.code);
    if (event.target instanceof HTMLElement && event.target.closest("button, input, textarea, select, [contenteditable]")) return;
    event.preventDefault();
  };

  private readonly handleGamepadConnection = (): void => {
    const connected = Array.from(navigator.getGamepads?.() ?? []).some(
      (gamepad) => gamepad?.connected,
    );
    this.connectedGamepad = connected;
    this.onDeviceChanged(this.lastDevice, connected);
  };
}
