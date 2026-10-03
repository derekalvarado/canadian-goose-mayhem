/** Presentation-only state. Never advances gameplay or resolves an interaction. */
export const GOOSE_ANIMATION = {
  locomotionBlendSeconds: 0.12,
  turnBlendSeconds: 0.16,
  lookBlendSeconds: 0.18,
  poseBlendSeconds: 0.2,
  maxLookYaw: 0.85,
  maxLookPitch: 0.38,
  // Trims the walk clip's 0.8-2.6 cycles/sec cadence range for a less hurried gait.
  gaitCadenceScale: 0.875,
  // Shifts where in the gait cycle the footstep sound fires, as a fraction of
  // one cycle. 0 fires at the walk clip's leg-swing extremes (phase 0/0.5);
  // positive delays the sound, negative fires it earlier. Effective range is
  // only ±0.25: the two contacts are exactly half a cycle apart, so offsets a
  // half-cycle apart (e.g. 0.25 and -0.25) are identical.
  footstepPhaseOffset: -0.25,
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
  headDown = 0;
  elapsed = 0;
  speed = 0;
  acceleration = 0;
  /** True only for the update() call in which a foot contacts the ground. */
  stepped = false;
  // undefined until the first update() establishes a baseline, so that
  // baseline (which depends on GOOSE_ANIMATION.footstepPhaseOffset) never
  // itself reads as a step.
  private stepIndex: number | undefined;

  update(delta: number, speedRatio: number, turn: number, wings: boolean, sneakPose: boolean,
    lookYaw = 0, lookPitch = 0, backward = false): void {
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
      walk: moving * (1 - hurry) * (sneakPose ? 0 : 1),
      hurry: moving * hurry,
      sneak: moving * (1 - hurry) * (sneakPose ? 1 : 0),
    };
    for (const name of Object.keys(this.weights) as GooseLocomotion[]) {
      this.weights[name] = damp(this.weights[name], target[name], GOOSE_ANIMATION.locomotionBlendSeconds, dt);
    }
    // All gaits share one normalized contact phase, even while crossfading.
    // The plaza's stylized movement speed is retained; cadence is intentionally
    // bounded so high speed cannot turn the legs into an unreadable blur.
    const cadence = (0.8 + 1.8 * this.speed) * GOOSE_ANIMATION.gaitCadenceScale;
    // Backing up (dragging something) runs the same gait in reverse.
    this.phase = (this.phase + (backward ? -1 : 1) * dt * cadence * smooth(this.speed, 0.01, 0.1) + 1) % 1;
    // Each gait cycle has two foot contacts (phase 0 and 0.5); report a step
    // whenever the contact half crossed, including the wrap back to 0.
    const contactPhase = (this.phase + GOOSE_ANIMATION.footstepPhaseOffset + 1) % 1;
    const stepIndex = Math.floor(contactPhase * 2);
    this.stepped = this.stepIndex !== undefined && stepIndex !== this.stepIndex;
    this.stepIndex = stepIndex;
    this.turn = damp(this.turn, clamp(turn, -1, 1), GOOSE_ANIMATION.turnBlendSeconds, dt);
    this.wings = damp(this.wings, wings ? 1 : 0, GOOSE_ANIMATION.poseBlendSeconds, dt);
    this.headDown = damp(this.headDown, sneakPose ? 1 : 0, GOOSE_ANIMATION.poseBlendSeconds, dt);
    this.lookYaw = damp(this.lookYaw, clamp(lookYaw, -GOOSE_ANIMATION.maxLookYaw, GOOSE_ANIMATION.maxLookYaw), GOOSE_ANIMATION.lookBlendSeconds, dt);
    this.lookPitch = damp(this.lookPitch, clamp(lookPitch, -GOOSE_ANIMATION.maxLookPitch, GOOSE_ANIMATION.maxLookPitch), GOOSE_ANIMATION.lookBlendSeconds, dt);
    this.elapsed += dt;
  }
}
