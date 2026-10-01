import assert from "node:assert/strict";
import test from "node:test";
import { NetworkMotionSmoother } from "../src/game/multiplayer/networkMotion.ts";

const sample = (sequence: number, x: number, velocityX = 0) => ({
  sequence,
  position: { x, y: 0, z: 0 },
  velocity: { x: velocityX, y: 0, z: 0 },
  heading: -Math.PI / 2,
});

test("sparse authoritative samples produce continuous presentation movement", () => {
  const motion = new NetworkMotionSmoother();
  motion.push(sample(1, 0, 3));
  const frames = Array.from({ length: 4 }, () => motion.update(1 / 60)!);
  assert.ok(frames.every((frame, index) => index === 0 || frame.position.x > frames[index - 1].position.x));
});

test("guest input predicts movement before another host snapshot arrives", () => {
  const motion = new NetworkMotionSmoother();
  motion.push(sample(1, 0));
  const predicted = motion.update(1 / 60, { moveX: 1, moveZ: 0, speed: 3.45 })!;
  assert.ok(predicted.position.x > 0);
  assert.ok(predicted.velocity.x > 0);
});

test("small authority corrections are smoothed while area-sized jumps snap", () => {
  const motion = new NetworkMotionSmoother();
  motion.push(sample(1, 0));
  motion.push(sample(2, 0.5));
  const corrected = motion.update(1 / 60)!;
  assert.ok(corrected.position.x > 0 && corrected.position.x < 0.5);
  motion.push(sample(3, 10));
  assert.equal(motion.update(0)!.position.x, 10);
});
