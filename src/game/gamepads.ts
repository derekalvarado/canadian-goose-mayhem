export type GamepadProfileId = "standard" | "switch-pro" | "joycon-left-sideways" | "joycon-right-sideways";

export interface GamepadButtonLike {
  readonly pressed: boolean;
  readonly value: number;
}

export interface GamepadLike {
  readonly id: string;
  readonly index: number;
  readonly connected: boolean;
  readonly mapping?: string;
  readonly axes: readonly number[];
  readonly buttons: readonly GamepadButtonLike[];
  readonly timestamp?: number;
}

export interface GamepadActions {
  readonly moveX: number;
  readonly moveY: number;
  readonly hurry: boolean;
  readonly honk: boolean;
  readonly interact: boolean;
  readonly wings: boolean;
  readonly sneak: boolean;
  readonly threaten: boolean;
}

export interface GamepadProfile {
  readonly id: GamepadProfileId;
  readonly label: string;
  readonly buttonLabels: Readonly<{
    honk: string;
    interact: string;
    wings: string;
    sneak: string;
    threaten: string;
    hurry: string;
  }>;
}

const STANDARD_PROFILE: GamepadProfile = {
  id: "standard",
  label: "Standard controller",
  buttonLabels: { honk: "A", interact: "B", wings: "X", sneak: "Y", threaten: "LB", hurry: "RT" },
};

const SWITCH_PRO_PROFILE: GamepadProfile = {
  id: "switch-pro",
  label: "Nintendo Switch Pro Controller",
  // Browser button indices follow physical positions. Nintendo prints different
  // letters in those positions than an Xbox-style standard controller.
  buttonLabels: { honk: "B", interact: "A", wings: "Y", sneak: "X", threaten: "L", hurry: "ZR" },
};

const JOYCON_LEFT_PROFILE: GamepadProfile = {
  id: "joycon-left-sideways",
  label: "Left Joy-Con (sideways)",
  buttonLabels: { honk: "◀", interact: "▼", wings: "▲", sneak: "▶", threaten: "SL", hurry: "SR" },
};

const JOYCON_RIGHT_PROFILE: GamepadProfile = {
  id: "joycon-right-sideways",
  label: "Right Joy-Con (sideways)",
  buttonLabels: { honk: "B", interact: "A", wings: "Y", sneak: "X", threaten: "SL", hurry: "SR" },
};

const isDown = (pad: GamepadLike, ...indices: number[]): boolean => indices.some((index) => {
  const button = pad.buttons[index];
  return Boolean(button?.pressed) || (button?.value ?? 0) > 0.25;
});

export function applyGamepadDeadzone(value: number, deadzone = 0.15): number {
  if (!Number.isFinite(value)) return 0;
  const magnitude = Math.abs(value);
  if (magnitude <= deadzone) return 0;
  return Math.sign(value) * Math.min(1, (magnitude - deadzone) / (1 - deadzone));
}

export function gamepadProfile(id: string | null | undefined): GamepadProfile {
  const normalized = (id ?? "").toLowerCase();
  if (/joy[- ]?con.*\(l\)|left.*joy[- ]?con|joy[- ]?con.*left/.test(normalized)) return JOYCON_LEFT_PROFILE;
  if (/joy[- ]?con.*\(r\)|right.*joy[- ]?con|joy[- ]?con.*right/.test(normalized)) return JOYCON_RIGHT_PROFILE;
  if (/nintendo|switch.*pro|pro controller/.test(normalized)) return SWITCH_PRO_PROFILE;
  return STANDARD_PROFILE;
}

function rawStick(pad: GamepadLike): readonly [number, number] {
  const leftX = pad.axes[0] ?? 0;
  const leftY = pad.axes[1] ?? 0;
  const rightX = pad.axes[2] ?? 0;
  const rightY = pad.axes[3] ?? 0;
  // Some Safari/controller combinations only report the stick in axes 2/3.
  return Math.hypot(leftX, leftY) > 0.08 || pad.axes.length < 4
    ? [leftX, leftY]
    : [rightX, rightY];
}

export function sampleGamepad(pad: GamepadLike): GamepadActions {
  const profile = gamepadProfile(pad.id);
  const [rawX, rawY] = rawStick(pad);
  let moveX = applyGamepadDeadzone(rawX);
  let moveY = -applyGamepadDeadzone(rawY);

  if (profile.id === "joycon-left-sideways") {
    // Left Joy-Con with SL/SR on top: rotate its vertical stick frame clockwise.
    [moveX, moveY] = [-applyGamepadDeadzone(rawY), -applyGamepadDeadzone(rawX)];
  } else if (profile.id === "joycon-right-sideways") {
    // Right Joy-Con with SL/SR on top: the matching physical orientation is opposite.
    [moveX, moveY] = [applyGamepadDeadzone(rawY), applyGamepadDeadzone(rawX)];
  }

  if (profile.id === "joycon-left-sideways") {
    return {
      moveX, moveY,
      // D-pad buttons are exposed at 12–15 by standard-mapped browsers. SL/SR
      // are not exposed by every Safari version, so shoulder fallbacks remain.
      honk: isDown(pad, 14),
      interact: isDown(pad, 13),
      wings: isDown(pad, 12),
      sneak: isDown(pad, 15),
      threaten: isDown(pad, 4),
      hurry: isDown(pad, 5, 7),
    };
  }

  return {
    moveX, moveY,
    hurry: isDown(pad, 7, 5),
    honk: isDown(pad, 0),
    interact: isDown(pad, 1),
    wings: isDown(pad, 2),
    sneak: isDown(pad, 3),
    threaten: isDown(pad, 4),
  };
}

export function gamepadHasActivity(pad: GamepadLike): boolean {
  const state = sampleGamepad(pad);
  return Math.hypot(state.moveX, state.moveY) > 0.03
    || state.hurry || state.honk || state.interact || state.wings || state.sneak || state.threaten;
}

export type LocalPlayerNumber = 1 | 2;

/** Stable press-to-join assignments. A disconnected pad keeps its slot so it can reconnect. */
export class GamepadJoinLobby {
  private readonly padByPlayer = new Map<LocalPlayerNumber, number>();

  update(pads: readonly (GamepadLike | null)[]): readonly Readonly<{ player: LocalPlayerNumber; padIndex: number }>[] {
    const joined: { player: LocalPlayerNumber; padIndex: number }[] = [];
    const claimed = new Set(this.padByPlayer.values());
    for (const pad of pads) {
      if (!pad?.connected || claimed.has(pad.index) || !pad.buttons.some((button) => button.pressed || button.value > 0.25)) continue;
      const player = ([1, 2] as const).find((slot) => !this.padByPlayer.has(slot));
      if (!player) break;
      this.padByPlayer.set(player, pad.index);
      claimed.add(pad.index);
      joined.push({ player, padIndex: pad.index });
    }
    return joined;
  }

  assignment(player: LocalPlayerNumber): number | undefined { return this.padByPlayer.get(player); }
  playerForPad(padIndex: number): LocalPlayerNumber | undefined {
    for (const [player, index] of this.padByPlayer) if (index === padIndex) return player;
    return undefined;
  }
  clear(): void { this.padByPlayer.clear(); }
}

export function formatGamepadDiagnostics(pads: readonly (GamepadLike | null)[]): string {
  const connected = pads.filter((pad): pad is GamepadLike => Boolean(pad?.connected));
  if (connected.length === 0) return "No controller visible yet. Press a button on each Joy-Con.";
  return connected.map((pad) => {
    const profile = gamepadProfile(pad.id);
    const axes = pad.axes.map((value, index) => `${index}:${value.toFixed(2)}`).join("  ") || "none";
    const buttons = pad.buttons.map((button, index) => ({ index, value: button.value, pressed: button.pressed }))
      .filter((button) => button.pressed || button.value > 0.02)
      .map((button) => `${button.index}:${button.value.toFixed(2)}${button.pressed ? "*" : ""}`).join("  ") || "none";
    return `Pad ${pad.index} · ${profile.label}\n${pad.id}\naxes ${axes}\npressed ${buttons}`;
  }).join("\n\n");
}
