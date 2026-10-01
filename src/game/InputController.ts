import * as THREE from "three";
import { GamepadJoinLobby, gamepadHasActivity, sampleGamepad, type GamepadActions, type GamepadLike, type LocalPlayerNumber } from "./gamepads.ts";

export type InputDevice = "keyboard" | "gamepad" | "touch";

export interface InputFrame {
  move: THREE.Vector2;
  hurry: boolean;
  honkPressed: boolean;
  interactPressed: boolean;
  wingsSpread: boolean;
  sneaking: boolean;
  threatening: boolean;
  device: InputDevice;
}

export interface LocalGamepadSample {
  readonly player1?: InputFrame;
  readonly player2?: InputFrame;
  readonly assignments: Readonly<{ player1?: number; player2?: number }>;
}

interface LocalPadMemory {
  honk: boolean;
  interact: boolean;
  wings: boolean;
  sneak: boolean;
  wingsToggled: boolean;
  sneakToggled: boolean;
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
  private readonly localLobby = new GamepadJoinLobby();
  private readonly localPadMemory = new Map<number, LocalPadMemory>();

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

    if (gamepad) {
      this.connectedGamepad = true;
      const mapped = sampleGamepad(gamepad as GamepadLike);
      const stickX = mapped.moveX;
      const stickY = mapped.moveY;
      const gamepadHurry = mapped.hurry;
      const gamepadHonkDown = mapped.honk;
      const gamepadInteractDown = mapped.interact;
      const gamepadWingsSpread = mapped.wings;
      const gamepadSneaking = mapped.sneak;
      const gamepadThreatening = mapped.threaten;
      const gamepadActive = gamepadHasActivity(gamepad as GamepadLike);

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
    };
  }

  sampleLocalGamepads(): LocalGamepadSample {
    const pads = Array.from(navigator.getGamepads?.() ?? []) as readonly (GamepadLike | null)[];
    for (const joined of this.localLobby.update(pads)) {
      const pad = pads.find((candidate) => candidate?.index === joined.padIndex);
      if (pad) this.localPadMemory.set(joined.padIndex, this.memoryFrom(sampleGamepad(pad)));
    }
    const player1 = this.sampleAssignedPad(1, pads);
    const player2 = this.sampleAssignedPad(2, pads);
    return { player1, player2, assignments: { player1: this.localLobby.assignment(1), player2: this.localLobby.assignment(2) } };
  }

  resetLocalGamepads(): void {
    this.localLobby.clear();
    this.localPadMemory.clear();
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
    for (const memory of this.localPadMemory.values()) {
      memory.honk = false; memory.interact = false; memory.wings = false; memory.sneak = false;
      memory.wingsToggled = false; memory.sneakToggled = false;
    }
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

  private sampleAssignedPad(player: LocalPlayerNumber, pads: readonly (GamepadLike | null)[]): InputFrame | undefined {
    const index = this.localLobby.assignment(player);
    if (index === undefined) return undefined;
    const pad = pads.find((candidate) => candidate?.index === index && candidate.connected);
    if (!pad) return this.emptyGamepadFrame();
    const mapped = sampleGamepad(pad);
    const memory = this.localPadMemory.get(index) ?? this.memoryFrom(mapped);
    if (mapped.wings && !memory.wings) memory.wingsToggled = !memory.wingsToggled;
    if (mapped.sneak && !memory.sneak) memory.sneakToggled = !memory.sneakToggled;
    const frame: InputFrame = {
      move: new THREE.Vector2(mapped.moveX, mapped.moveY),
      hurry: mapped.hurry,
      honkPressed: mapped.honk && !memory.honk,
      interactPressed: mapped.interact && !memory.interact,
      wingsSpread: memory.wingsToggled,
      sneaking: memory.sneakToggled,
      threatening: mapped.threaten,
      device: "gamepad",
    };
    memory.honk = mapped.honk; memory.interact = mapped.interact; memory.wings = mapped.wings; memory.sneak = mapped.sneak;
    this.localPadMemory.set(index, memory);
    return frame;
  }

  private memoryFrom(mapped: GamepadActions): LocalPadMemory {
    return { honk: mapped.honk, interact: mapped.interact, wings: mapped.wings, sneak: mapped.sneak,
      wingsToggled: false, sneakToggled: false };
  }

  private emptyGamepadFrame(): InputFrame {
    return { move: new THREE.Vector2(), hurry: false, honkPressed: false, interactPressed: false,
      wingsSpread: false, sneaking: false, threatening: false, device: "gamepad" };
  }
}
