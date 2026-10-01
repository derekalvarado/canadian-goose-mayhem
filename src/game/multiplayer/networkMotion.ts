export interface NetworkMotionVector { readonly x: number; readonly y: number; readonly z: number }

export interface NetworkMotionSample {
  readonly sequence: number;
  readonly position: NetworkMotionVector;
  readonly velocity: NetworkMotionVector;
  readonly heading: number;
}

export interface NetworkPredictionInput {
  readonly moveX: number;
  readonly moveZ: number;
  readonly speed: number;
}

export interface SmoothedNetworkMotion {
  readonly position: NetworkMotionVector;
  readonly velocity: NetworkMotionVector;
  readonly heading: number;
}

const MAX_FRAME_SECONDS = 0.1;
const MAX_EXTRAPOLATION_SECONDS = 0.12;
const HARD_SNAP_DISTANCE = 2.5;
const CORRECTION_DEAD_ZONE = 0.025;

const finite = (value: number): number => Number.isFinite(value) ? value : 0;
const response = (rate: number, delta: number): number => 1 - Math.exp(-rate * delta);

/**
 * Presentation-only dead reckoning with local input prediction. The host remains
 * authoritative; this state is never fed into collision, interactions, or tasks.
 */
export class NetworkMotionSmoother {
  private initialized = false;
  private sequence = -1;
  private sampleAge = 0;
  private readonly position = { x: 0, y: 0, z: 0 };
  private readonly velocity = { x: 0, y: 0, z: 0 };
  private readonly samplePosition = { x: 0, y: 0, z: 0 };
  private readonly sampleVelocity = { x: 0, y: 0, z: 0 };
  private heading = 0;
  private sampleHeading = 0;

  clear(): void {
    this.initialized = false;
    this.sequence = -1;
    this.sampleAge = 0;
  }

  push(sample: NetworkMotionSample, force = false): void {
    if (!Number.isSafeInteger(sample.sequence) || sample.sequence <= this.sequence) return;
    this.sequence = sample.sequence;
    this.sampleAge = 0;
    Object.assign(this.samplePosition, {
      x: finite(sample.position.x), y: finite(sample.position.y), z: finite(sample.position.z),
    });
    Object.assign(this.sampleVelocity, {
      x: finite(sample.velocity.x), y: finite(sample.velocity.y), z: finite(sample.velocity.z),
    });
    this.sampleHeading = finite(sample.heading);
    const error = Math.hypot(
      this.samplePosition.x - this.position.x,
      this.samplePosition.y - this.position.y,
      this.samplePosition.z - this.position.z,
    );
    if (!this.initialized || force || error > HARD_SNAP_DISTANCE) this.snapToSample();
  }

  update(deltaSeconds: number, input?: NetworkPredictionInput): SmoothedNetworkMotion | undefined {
    if (!this.initialized) return undefined;
    const delta = Math.max(0, Math.min(MAX_FRAME_SECONDS, finite(deltaSeconds)));
    this.sampleAge = Math.min(MAX_EXTRAPOLATION_SECONDS, this.sampleAge + delta);

    let headingTarget = this.sampleHeading;
    if (input) {
      const moveX = finite(input.moveX); const moveZ = finite(input.moveZ);
      const length = Math.hypot(moveX, moveZ); const hasInput = length * length > 0.001;
      const scale = hasInput ? 1 / Math.max(1, length) : 0;
      const speed = Math.max(0, finite(input.speed));
      const desiredX = moveX * scale * speed; const desiredZ = moveZ * scale * speed;
      const velocityResponse = response(hasInput ? 11 : 16, delta);
      this.velocity.x += (desiredX - this.velocity.x) * velocityResponse;
      this.velocity.z += (desiredZ - this.velocity.z) * velocityResponse;
      if (hasInput) headingTarget = Math.atan2(-desiredX, -desiredZ);
    } else {
      const velocityResponse = response(12, delta);
      this.velocity.x += (this.sampleVelocity.x - this.velocity.x) * velocityResponse;
      this.velocity.z += (this.sampleVelocity.z - this.velocity.z) * velocityResponse;
    }
    this.velocity.y += (this.sampleVelocity.y - this.velocity.y) * response(12, delta);

    this.position.x += this.velocity.x * delta;
    this.position.y += this.velocity.y * delta;
    this.position.z += this.velocity.z * delta;

    const targetX = this.samplePosition.x + this.sampleVelocity.x * this.sampleAge;
    const targetY = this.samplePosition.y + this.sampleVelocity.y * this.sampleAge;
    const targetZ = this.samplePosition.z + this.sampleVelocity.z * this.sampleAge;
    const errorX = targetX - this.position.x; const errorY = targetY - this.position.y; const errorZ = targetZ - this.position.z;
    const error = Math.hypot(errorX, errorY, errorZ);
    if (error > CORRECTION_DEAD_ZONE) {
      const correction = response(error > 0.5 ? 12 : 5, delta);
      this.position.x += errorX * correction;
      this.position.y += errorY * correction;
      this.position.z += errorZ * correction;
    }

    const headingError = Math.atan2(Math.sin(headingTarget - this.heading), Math.cos(headingTarget - this.heading));
    this.heading += headingError * response(10.5, delta);
    return {
      position: { ...this.position }, velocity: { ...this.velocity }, heading: this.heading,
    };
  }

  private snapToSample(): void {
    this.initialized = true;
    Object.assign(this.position, this.samplePosition);
    Object.assign(this.velocity, this.sampleVelocity);
    this.heading = this.sampleHeading;
  }
}
