import * as THREE from "three";

export type InputDevice = "keyboard" | "gamepad" | "touch";
export type GamepadLayout = "standard" | "single-right-joycon";

export interface InputFrame {
  move: THREE.Vector2;
  hurry: boolean;
  honkPressed: boolean;
  interactPressed: boolean;
  wingsSpread: boolean;
  sneaking: boolean;
  threatening: boolean;
  device: InputDevice;
  gamepadLayout?: GamepadLayout;
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
  "KeyQ",
  "KeyE",
  "KeyF",
  "ControlLeft",
  "ControlRight",
]);

function applyDeadzone(value: number, deadzone = 0.18): number {
  const magnitude = Math.abs(value);
  if (magnitude <= deadzone) return 0;
  return Math.sign(value) * ((magnitude - deadzone) / (1 - deadzone));
}

function gamepadLayout(gamepad: Gamepad): GamepadLayout {
  if (gamepad.mapping !== "standard" && /Joy-Con\s*\(R\)/i.test(gamepad.id)) return "single-right-joycon";
  return "standard";
}

function gamepadButtonDown(gamepad: Gamepad, index: number): boolean {
  return Boolean(gamepad.buttons[index]?.pressed);
}

export class InputController {
  readonly movement = new THREE.Vector2();
  private readonly keys = new Set<string>();
  private lastDevice: InputDevice = "keyboard";
  private honkQueued = false;
  private gamepadHonkWasDown = false;
  private interactionQueued = false;
  private gamepadInteractWasDown = false;
  private wingsSpread = false;
  private sneaking = false;
  private gamepadWingsWasDown = false;
  private gamepadSneakWasDown = false;
  private touchMove = new THREE.Vector2();
  private touchHurry = false;
  private touchThreatening = false;
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
    let interactPressed = this.interactionQueued;
    let threatening = this.keys.has("ControlLeft") || this.keys.has("ControlRight") || this.touchThreatening;
    this.honkQueued = false;
    this.interactionQueued = false;

    const gamepads = navigator.getGamepads?.() ?? [];
    const gamepad = Array.from(gamepads).find((candidate) => candidate?.connected);
    let activeGamepadLayout: GamepadLayout | undefined;

    if (gamepad) {
      this.connectedGamepad = true;
      activeGamepadLayout = gamepadLayout(gamepad);
      const singleRightJoyCon = activeGamepadLayout === "single-right-joycon";
      const stickX = singleRightJoyCon
        ? Number(gamepadButtonDown(gamepad, 15)) - Number(gamepadButtonDown(gamepad, 14))
        : applyDeadzone(gamepad.axes[0] ?? 0);
      const stickY = singleRightJoyCon
        ? Number(gamepadButtonDown(gamepad, 12)) - Number(gamepadButtonDown(gamepad, 13))
        : -applyDeadzone(gamepad.axes[1] ?? 0);
      const gamepadHurry = singleRightJoyCon
        ? gamepadButtonDown(gamepad, 5)
        : (gamepad.buttons[7]?.value ?? 0) > 0.25 || gamepadButtonDown(gamepad, 5);
      const gamepadHonkDown = gamepadButtonDown(gamepad, 0);
      const gamepadInteractDown = gamepadButtonDown(gamepad, singleRightJoyCon ? 2 : 1);
      const gamepadWingsSpread = gamepadButtonDown(gamepad, singleRightJoyCon ? 1 : 2);
      const gamepadSneaking = gamepadButtonDown(gamepad, 3);
      const gamepadThreatening = gamepadButtonDown(gamepad, 4);
      const gamepadActive = Math.hypot(stickX, stickY) > 0.03
        || gamepadHurry
        || gamepadHonkDown
        || gamepadInteractDown
        || gamepadWingsSpread
        || gamepadSneaking
        || gamepadThreatening;

      if (gamepadWingsSpread && !this.gamepadWingsWasDown) this.wingsSpread = !this.wingsSpread;
      if (gamepadSneaking && !this.gamepadSneakWasDown) this.sneaking = !this.sneaking;
      threatening ||= gamepadThreatening;
      this.gamepadWingsWasDown = gamepadWingsSpread;
      this.gamepadSneakWasDown = gamepadSneaking;

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
      if (gamepadInteractDown && !this.gamepadInteractWasDown) interactPressed = true;
      this.gamepadHonkWasDown = gamepadHonkDown;
      this.gamepadInteractWasDown = gamepadInteractDown;
    } else {
      this.connectedGamepad = false;
      this.gamepadHonkWasDown = false;
      this.gamepadInteractWasDown = false;
      this.gamepadWingsWasDown = false;
      this.gamepadSneakWasDown = false;
    }

    if (this.touchMove.lengthSq() > 0 || this.touchHurry) {
      horizontal = this.touchMove.x;
      vertical = this.touchMove.y;
      hurry = this.touchHurry;
    }
    this.movement.set(horizontal, vertical);
    if (this.movement.lengthSq() > 1) this.movement.normalize();

    return {
      move: this.movement,
      hurry,
      honkPressed,
      interactPressed,
      wingsSpread: this.wingsSpread,
      sneaking: this.sneaking,
      threatening,
      device: this.lastDevice,
      gamepadLayout: activeGamepadLayout,
    };
  }

  clear(): void {
    this.honkQueued = false;
    this.interactionQueued = false;
    this.keys.clear();
    this.movement.set(0, 0);
    this.touchMove.set(0, 0);
    this.touchHurry = false;
    this.wingsSpread = false;
    this.sneaking = false;
    this.touchThreatening = false;
  }

  setTouchMovement(moveX: number, moveY: number, hurry: boolean): void {
    this.touchMove.set(moveX, moveY);
    if (this.touchMove.lengthSq() > 1) this.touchMove.normalize();
    this.touchHurry = hurry;
    if (this.lastDevice !== "touch") {
      this.lastDevice = "touch";
      this.onDeviceChanged("touch", this.connectedGamepad);
    }
  }

  queueTouchHonk(): void {
    this.honkQueued = true;
    if (this.lastDevice !== "touch") {
      this.lastDevice = "touch";
      this.onDeviceChanged("touch", this.connectedGamepad);
    }
  }

  queueTouchInteraction(): void {
    this.interactionQueued = true;
    if (this.lastDevice !== "touch") {
      this.lastDevice = "touch";
      this.onDeviceChanged("touch", this.connectedGamepad);
    }
  }

  toggleTouchPose(pose: "wings" | "sneak"): void {
    if (pose === "wings") this.wingsSpread = !this.wingsSpread;
    else this.sneaking = !this.sneaking;
    if (this.lastDevice !== "touch") {
      this.lastDevice = "touch";
      this.onDeviceChanged("touch", this.connectedGamepad);
    }
  }

  setTouchThreatening(held: boolean): void {
    this.touchThreatening = held;
    if (held && this.lastDevice !== "touch") {
      this.lastDevice = "touch";
      this.onDeviceChanged("touch", this.connectedGamepad);
    }
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (!MOVEMENT_KEYS.has(event.code)) return;
    if (event.target instanceof HTMLElement && event.target.closest("button, input, textarea, select, [contenteditable]")) return;
    event.preventDefault();
    const wasDown = this.keys.has(event.code);
    this.keys.add(event.code);

    if (event.code === "Space" && !event.repeat) this.honkQueued = true;
    if (event.code === "KeyF" && !event.repeat) this.interactionQueued = true;
    if (event.code === "KeyQ" && !event.repeat && !wasDown) this.wingsSpread = !this.wingsSpread;
    if (event.code === "KeyE" && !event.repeat && !wasDown) this.sneaking = !this.sneaking;
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
