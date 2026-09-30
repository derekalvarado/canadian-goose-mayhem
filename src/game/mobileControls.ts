export type TouchControlsPreference = "auto" | "show" | "hide";

export const TOUCH_CONTROLS_STORAGE_KEY = "goose-game.touch-controls.v1";
export const JOYSTICK_DEAD_ZONE = 18;
export const HURRY_ENTER_DISTANCE = 62;
export const HURRY_EXIT_DISTANCE = 52;
export const JOYSTICK_MAX_DISTANCE = 86;

export interface TouchCommand {
  moveX: number;
  moveY: number;
  hurry: boolean;
}

/** Browser-independent joystick state. Distances are CSS pixels. */
export class FloatingJoystick {
  private active = false;
  private anchorX = 0;
  private anchorY = 0;
  private hurry = false;

  begin(x: number, y: number): void {
    this.active = true;
    this.anchorX = x;
    this.anchorY = y;
    this.hurry = false;
  }

  update(x: number, y: number): TouchCommand {
    if (!this.active) return { moveX: 0, moveY: 0, hurry: false };
    const dx = x - this.anchorX;
    const dy = y - this.anchorY;
    const distance = Math.hypot(dx, dy);
    if (this.hurry ? distance < HURRY_EXIT_DISTANCE : distance >= HURRY_ENTER_DISTANCE) {
      this.hurry = distance >= HURRY_ENTER_DISTANCE;
    }
    if (distance <= JOYSTICK_DEAD_ZONE) return { moveX: 0, moveY: 0, hurry: this.hurry };
    const strength = Math.min(1, (distance - JOYSTICK_DEAD_ZONE) / (JOYSTICK_MAX_DISTANCE - JOYSTICK_DEAD_ZONE));
    return { moveX: (dx / distance) * strength, moveY: (-dy / distance) * strength, hurry: this.hurry };
  }

  end(): void {
    this.active = false;
    this.hurry = false;
  }

  get anchor(): { x: number; y: number } | null {
    return this.active ? { x: this.anchorX, y: this.anchorY } : null;
  }
}

export function parseTouchControlsPreference(value: string | null): TouchControlsPreference {
  return value === "show" || value === "hide" || value === "auto" ? value : "auto";
}

export function shouldShowTouchControls(preference: TouchControlsPreference, coarseTouchDevice: boolean): boolean {
  return preference === "show" || (preference === "auto" && coarseTouchDevice);
}

export function shouldPauseForPortrait(coarseTouchDevice: boolean, width: number, height: number): boolean {
  return coarseTouchDevice && height > width;
}

export class PauseReasons {
  private readonly reasons = new Set<string>();

  set(reason: string, active: boolean): boolean {
    const wasPaused = this.paused;
    if (active) this.reasons.add(reason); else this.reasons.delete(reason);
    return wasPaused !== this.paused;
  }

  get paused(): boolean { return this.reasons.size > 0; }

  /** Keep the browser visibility and focus signals in sync, even when they arrive in either order. */
  syncPageActivity(hidden: boolean, focused: boolean): boolean {
    const wasPaused = this.paused;
    if (hidden) this.reasons.add("hidden"); else this.reasons.delete("hidden");
    if (focused) this.reasons.delete("focus"); else this.reasons.add("focus");
    return wasPaused !== this.paused;
  }
}
