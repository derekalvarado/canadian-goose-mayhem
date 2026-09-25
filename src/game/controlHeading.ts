// Movement input is relative to the camera. When the camera swings around a
// corner, re-reading its heading every frame would bend the goose's path under a
// steady stick. Instead, hold the camera heading from when the current push
// began, and only adopt the new view once the player releases the stick or
// clearly picks a new direction.

const DEADZONE = 0.2;
const RELEASE_SECONDS = 0.12;
const REDIRECT_RADIANS = (40 * Math.PI) / 180;

function angleBetween(a: number, b: number): number { return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))); }

export class ControlHeadingLock {
  private lockedYaw?: number;
  private lockedStickAngle = 0;
  private releasedFor = 0;

  /** Returns the camera yaw that movement input should be read against this frame. */
  update(stickX: number, stickY: number, cameraYaw: number, delta: number): number {
    if (Math.hypot(stickX, stickY) < DEADZONE) {
      this.releasedFor += delta;
      if (this.releasedFor >= RELEASE_SECONDS) this.lockedYaw = undefined;
      return this.lockedYaw ?? cameraYaw;
    }
    this.releasedFor = 0;
    const stickAngle = Math.atan2(stickX, stickY);
    if (this.lockedYaw === undefined || angleBetween(stickAngle, this.lockedStickAngle) > REDIRECT_RADIANS) {
      this.lockedYaw = cameraYaw;
      this.lockedStickAngle = stickAngle;
    }
    return this.lockedYaw;
  }

  reset(): void { this.lockedYaw = undefined; this.releasedFor = 0; }
}
