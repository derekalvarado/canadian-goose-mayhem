import type { WorldSnapshot } from "./simulation/Simulation.ts";
import type { ObjectiveDefinition } from "./simulation/Objectives.ts";
import { SPILLED_DRINK_FACT_ID } from "./simulation/cafeCrew.ts";
import { GUITAR_DISTRACTION_FACT_ID, GUITAR_HIDDEN_FACT_ID, GUITAR_TWANG_FACT_ID } from "./simulation/musician.ts";
import { CENTRAL_PLAZA_AREA_ID, COFFEE_SHOP_AREA_ID } from "./worldLayout.ts";

/**
 * The village to-do lists. Each task belongs to one level, and the HUD shows
 * only the current level's list. Every task is still checked in every area, so
 * a coffee-shop task finished out in the square (the tip jar) counts. Each task
 * observes an outcome in the world snapshot, never a sequence of button presses.
 */
export const LEVEL_NAMES: Readonly<Record<string, string>> = {
  [CENTRAL_PLAZA_AREA_ID]: "Old Town Square",
  [COFFEE_SHOP_AREA_ID]: "The coffee shop",
};
export const ENTER_SHOP_OBJECTIVE_ID = "plaza.enter-north-shop";
export const ENTER_SHOP_FACT_ID = "plaza.entered-north-shop";
export const CAFE_TASK_IDS = {
  musicOff: "cafe.music-off",
  spillCoffee: "cafe.spill-coffee",
  stealCroissant: "cafe.steal-croissant",
  stealOrder: "cafe.steal-order",
  coffeeBreak: "cafe.coffee-break",
  tipJarOutside: "cafe.tip-jar-outside",
} as const;
export const GUITAR_TASK_IDS = {
  steal: "oldtown.steal-guitar",
  hide: "oldtown.hide-guitar",
  elsewhere: "oldtown.guitar-elsewhere",
  twang: "oldtown.guitar-twang",
  distraction: "oldtown.guitar-distraction",
} as const;

const held = (world: WorldSnapshot) => world.entities.find((entity) => entity.id === world.player.heldEntityId);
const guitarHeldByGoose = (world: WorldSnapshot) => world.entities.some((entity) => entity.tags.includes("guitar")
  && (entity.holderId === "goose" || entity.holderId === "goose-2"));

/** A table nobody sits at with a drink and a pastry both set down on it. */
function hasCoffeeBreak(world: WorldSnapshot): boolean {
  const occupied = new Set(world.cafePeople.flatMap((person) => person.tableSurfaceId ? [person.tableSurfaceId] : []));
  const resting = world.entities.filter((entity) => !entity.holderId && entity.restingKind === "table" && entity.restingOn && !occupied.has(entity.restingOn));
  return resting.some((drink) => drink.tags.includes("drink")
    && resting.some((pastry) => pastry.tags.includes("pastry") && pastry.restingOn === drink.restingOn));
}

export const VILLAGE_TASKS: readonly ObjectiveDefinition<WorldSnapshot>[] = [
  { id: ENTER_SHOP_OBJECTIVE_ID, areaId: CENTRAL_PLAZA_AREA_ID, description: "Sneak into the coffee shop", isSatisfied: (world) => world.durableFacts.includes(ENTER_SHOP_FACT_ID) },
  { id: CAFE_TASK_IDS.musicOff, areaId: COFFEE_SHOP_AREA_ID, description: "Turn off the café music",
    isSatisfied: (world) => world.entities.some((entity) => entity.tags.includes("music") && entity.active === false) },
  { id: CAFE_TASK_IDS.spillCoffee, areaId: COFFEE_SHOP_AREA_ID, description: "Make someone spill their coffee", isSatisfied: (world) => world.durableFacts.includes(SPILLED_DRINK_FACT_ID) },
  { id: CAFE_TASK_IDS.stealCroissant, areaId: COFFEE_SHOP_AREA_ID, description: "Steal a croissant", isSatisfied: (world) => held(world)?.tags.includes("pastry") === true },
  { id: CAFE_TASK_IDS.stealOrder, areaId: COFFEE_SHOP_AREA_ID, description: "Steal someone's order",
    isSatisfied: (world) => { const item = held(world); return item?.tags.includes("order-cup") === true && item.condition === "full" && item.orderFor !== undefined; } },
  { id: CAFE_TASK_IDS.coffeeBreak, areaId: COFFEE_SHOP_AREA_ID, description: "Have a coffee break at the empty table", isSatisfied: hasCoffeeBreak },
  { id: CAFE_TASK_IDS.tipJarOutside, areaId: COFFEE_SHOP_AREA_ID, description: "Take the tip jar outside",
    isSatisfied: (world) => world.areaId !== "" && world.entities.some((entity) => entity.tags.includes("tip-jar")
      && entity.homeAreaId !== undefined && entity.homeAreaId !== world.areaId) },
  { id: GUITAR_TASK_IDS.steal, areaId: CENTRAL_PLAZA_AREA_ID, description: "Steal the musician's guitar", isSatisfied: guitarHeldByGoose },
  { id: GUITAR_TASK_IDS.twang, areaId: CENTRAL_PLAZA_AREA_ID, description: "Honk with the guitar to make it twang",
    isSatisfied: (world) => world.durableFacts.includes(GUITAR_TWANG_FACT_ID) },
  { id: GUITAR_TASK_IDS.hide, areaId: CENTRAL_PLAZA_AREA_ID, description: "Hide the guitar where the musician can't find it",
    isSatisfied: (world) => world.durableFacts.includes(GUITAR_HIDDEN_FACT_ID) },
  { id: GUITAR_TASK_IDS.elsewhere, areaId: CENTRAL_PLAZA_AREA_ID, description: "Drag the guitar into another area",
    isSatisfied: (world) => world.areaId !== "" && world.entities.some((entity) => entity.tags.includes("guitar")
      && entity.homeAreaId !== undefined && entity.homeAreaId !== world.areaId) },
  { id: GUITAR_TASK_IDS.distraction, areaId: CENTRAL_PLAZA_AREA_ID, needsTwoGeese: true, description: "Two geese: steal the guitar while the other distracts the musician",
    isSatisfied: (world) => world.durableFacts.includes(GUITAR_DISTRACTION_FACT_ID) },
];
