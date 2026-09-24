import { createSplashKidModel, SPLASH_KID_VARIANTS, type SplashKidVariant } from "../../game/SplashKidModel.ts";
import { gallopPose, kidWalkStyle, scoopTossPose, wailPose } from "../../game/splashKidMoves.ts";
import { SPLASH_KID_FLEE_SPEED, SPLASH_KID_PLAY_SPEEDS } from "../../game/splashKidTuning.ts";
import { cycleClip, legsOf, walkClip, type Variant } from "./keys.ts";

/**
 * Edit freely: the lab page hot-reloads on save. Pose builders live in
 * src/game/splashKidMoves.ts. "In game" cards show the clips SplashKidModel.ts
 * exports for each kid (picked here: skip; jet jump / puddle stomp / twirl;
 * pump / flail / hands-to-cheeks; rub eyes; kid walk). "Alt" cards are the
 * options that were not picked, kept for comparison.
 */

const NAMES: Record<SplashKidVariant, string> = { runner: "Milo", boots: "June", floaties: "Ari" };
const inGame = (kid: SplashKidVariant, name: string) => {
  const clip = createSplashKidModel(kid).animations.find((candidate) => candidate.name === name);
  if (!clip) throw new Error(`No in-game clip named ${name}`);
  return clip;
};
const shipped = (group: Variant["group"], clip: string, notes: Record<SplashKidVariant, string>, speed?: (kid: SplashKidVariant) => number) =>
  SPLASH_KID_VARIANTS.map((kid): Variant => ({
    name: `In game: ${NAMES[kid]}`, group, model: kid, clip: inGame(kid, clip), travelSpeed: speed?.(kid), notes: notes[kid],
  }));
const playSpeed = (kid: SplashKidVariant) => SPLASH_KID_PLAY_SPEEDS[kid];

export const VARIANTS: Variant[] = [
  ...SPLASH_KID_VARIANTS.map((kid): Variant => ({
    name: NAMES[kid], group: "model", model: kid,
    clip: cycleClip(kid, "rest", 1, () => ({})),
    notes: {
      runner: "Runner: tallest, tousled hair, blue rash guard, board shorts, orange water shoes.",
      boots: "Yellow boots: bunches with pink ties, headband, coral tank top, navy shorts, wellies.",
      floaties: "Water wings: the littlest, round tummy, bucket hat, one-piece swimsuit, bare feet.",
    }[kid],
  })),
  {
    name: "Arm stress test", group: "model", model: "floaties",
    clip: cycleClip("floaties", "arm-test", 2, (p) => ({ rot: {
      left_shoulder: [0.9 * Math.sin(p * Math.PI * 2), 0, -1.2 * Math.max(0, Math.sin(p * Math.PI * 2))],
      right_shoulder: [-0.9 * Math.sin(p * Math.PI * 2), 0, 2.4 * Math.max(0, -Math.sin(p * Math.PI * 2))],
      left_elbow: [1.2 * Math.max(0, Math.sin(p * Math.PI * 2)), 0, 0], right_elbow: [0, 0, 0],
    } })),
    notes: "Full swing and an overhead raise to check shoulders, elbows, and the water wings.",
  },

  // Travelling between splash spots.
  ...shipped("play", "skip", {
    runner: "Step-hop skip at Milo's 1.45 m/s.", boots: "Step-hop skip at June's 1.4 m/s.", floaties: "Quicker little skips at Ari's 1.3 m/s.",
  }, playSpeed),
  {
    name: "Alt · Horsey gallop", group: "play", model: "runner", travelSpeed: playSpeed("runner"),
    clip: cycleClip("runner", "gallop", 0.42, gallopPose({ duration: 0.42, speed: playSpeed("runner"), legs: legsOf("runner"), hop: 0.06, reins: 0.75 })),
    notes: "Same leg always leads, then a bouncy float; hands hold imaginary reins.",
  },
  {
    name: "Alt · Floppy jog", group: "play", model: "runner", travelSpeed: playSpeed("runner"),
    clip: walkClip("runner", "jog", kidWalkStyle(legsOf("runner"), {
      duration: 0.52, speed: playSpeed("runner"), stance: 0.42, stepHeight: 0.1, liftShape: 0.8, crouch: 0.045, bob: 0.045, bounce: 0.75,
      sway: 0.02, roll: 0.07, twist: 0.16, lean: 0.06, headSteady: 0.25, nod: 0.12,
      armSwing: 0.7, armOut: 0.45, elbowBend: 0.6, elbowPump: 0.5, armLag: 0.07, heelStrike: 0.05,
    })),
    notes: "Loose little jog with arms flung wide and a wobbly head.",
  },

  // Splashing in place at a jet.
  ...shipped("splash", "splash", {
    runner: "Jet jumper: arms back, jump into the jet with arms flung overhead, squashy landing.",
    boots: "Puddle stomper: high-knee stomps in her wellies, arms out for balance.",
    floaties: "Twirl: spinning in place with arms out and face up to the spray.",
  }),
  {
    name: "Alt · Scoop and toss", group: "splash", model: "runner",
    clip: cycleClip("runner", "splash-scoop", 1.7, scoopTossPose({ legs: legsOf("runner"), bend: 1 })),
    notes: "Crouch, scoop water in both hands, toss it overhead with a hop, then giggle.",
  },

  // Running from the goose.
  ...shipped("flee", "flee", {
    runner: "Leaning sprint with pumping arms and a glance back over the shoulder.",
    boots: "Arms up and waving overhead, head thrown back: pure panic.",
    floaties: "Home Alone scream: hands on cheeks, elbows out, tiny legs going fast.",
  }, () => SPLASH_KID_FLEE_SPEED),

  // Crying after a fright.
  ...shipped("cry", "cry", { runner: "Rubbing eyes.", boots: "Rubbing eyes.", floaties: "Rubbing eyes." }),
  { name: "Alt · Wail", group: "cry", model: "runner", clip: cycleClip("runner", "cry-wail", 2, wailPose({ legs: legsOf("runner"), sob: 1 })),
    notes: "Head back, arms limp, bawling with sobbing bounces and a foot stamp." },

  // Walking away when the water stops, and back when it starts.
  ...shipped("walk", "walk", {
    runner: "Quick kid walk; cadence set so planted feet stay in reach.", boots: "Quick kid walk.", floaties: "Quick little steps for short legs.",
  }, playSpeed),
  ...(["hands_up", "stomp", "idle"] as const).map((name): Variant => ({
    name: `In game: ${name}`, group: "react", model: "boots", clip: inGame("boots", name), notes: "Sulking when the water is turned off, and idling.",
  })),
];
