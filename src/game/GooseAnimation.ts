/** Presentation-only state. Never advances gameplay or resolves an interaction. */
export const GOOSE_ANIMATION = {
  locomotionBlendSeconds: 0.12,
  turnBlendSeconds: 0.16,
  lookBlendSeconds: 0.18,
  poseBlendSeconds: 0.2,
  maxLookYaw: 0.85,
  maxLookPitch: 0.38,
} as const;

export type GooseLocomotion = "idle" | "walk" | "hurry" | "sneak";
const clamp = (value: number, low = 0, high = 1): number => Math.max(low, Math.min(high, value));
const smooth = (value: number, low: number, high: number): number => {
  const t = clamp((value - low) / (high - low));
  return t * t * (3 - 2 * t);
};
const damp = (value: number, target: number, seconds: number, delta: number): number =>
  target + (value - target) * Math.exp(-delta / seconds);

export class GooseAnimationState {
  readonly weights: Record<GooseLocomotion, number> = { idle: 1, walk: 0, hurry: 0, sneak: 0 };
  phase = 0;
  turn = 0;
  lookYaw = 0;
  lookPitch = 0;
  wings = 0;
  threat = 0;
  elapsed = 0;
  speed = 0;
  acceleration = 0;

  update(delta: number, speedRatio: number, turn: number, wings: boolean, threat: boolean,
    lookYaw = 0, lookPitch = 0): void {
    if (!Number.isFinite(delta) || delta <= 0) return;
    const dt = Math.min(delta, 0.1);
    const speed = clamp(Number.isFinite(speedRatio) ? speedRatio : 0);
    const moving = smooth(speed, 0.015, 0.12);
    const hurry = smooth(speed, 0.65, 0.94);
    const oldSpeed = this.speed;
    this.speed = damp(this.speed, speed, 0.09, dt);
    this.acceleration = damp(this.acceleration, (this.speed - oldSpeed) / dt, 0.12, dt);
    const target = {
      idle: 1 - moving,
      walk: moving * (1 - hurry) * (threat ? 0 : 1),
      hurry: moving * hurry,
      sneak: moving * (1 - hurry) * (threat ? 1 : 0),
    };
    for (const name of Object.keys(this.weights) as GooseLocomotion[]) {
      this.weights[name] = damp(this.weights[name], target[name], GOOSE_ANIMATION.locomotionBlendSeconds, dt);
    }
    // All gaits share one normalized contact phase, even while crossfading.
    // The plaza's stylized movement speed is retained; cadence is intentionally
    // bounded so high speed cannot turn the legs into an unreadable blur.
    const cadence = 0.8 + 1.8 * this.speed;
    this.phase = (this.phase + dt * cadence * smooth(this.speed, 0.01, 0.1)) % 1;
    this.turn = damp(this.turn, clamp(turn, -1, 1), GOOSE_ANIMATION.turnBlendSeconds, dt);
    this.wings = damp(this.wings, wings ? 1 : 0, GOOSE_ANIMATION.poseBlendSeconds, dt);
    this.threat = damp(this.threat, threat ? 1 : 0, GOOSE_ANIMATION.poseBlendSeconds, dt);
    this.lookYaw = damp(this.lookYaw, clamp(lookYaw, -GOOSE_ANIMATION.maxLookYaw, GOOSE_ANIMATION.maxLookYaw), GOOSE_ANIMATION.lookBlendSeconds, dt);
    this.lookPitch = damp(this.lookPitch, clamp(lookPitch, -GOOSE_ANIMATION.maxLookPitch, GOOSE_ANIMATION.maxLookPitch), GOOSE_ANIMATION.lookBlendSeconds, dt);
    this.elapsed += dt;
  }
}
