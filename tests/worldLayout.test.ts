import assert from "node:assert/strict";
import test from "node:test";
import { CANONICAL_PLAZA_LAYOUT } from "../src/game/plazaLayout.ts";
import { getWorldAsset } from "../src/game/worldAssets.ts";
import { getWorldGroundHeight, isWorldAreaPlayable, resolveWorldAreaMovement } from "../src/game/worldLevel.ts";
import {
  CANONICAL_WORLD_LAYOUT,
  CENTRAL_PLAZA_AREA_ID,
  FOUNTAIN_INSTANCE_ID,
  addWorldArea,
  cloneWorldLayout,
  clampWorldInstance,
  createInstance,
  deleteWorldArea,
  getWorldArea,
  migratePlazaLayout,
  serializeWorldLayout,
  validateWorldLayout,
  toggleWorldChunkPlayable,
  worldChunkCoordinates,
} from "../src/game/worldLayout.ts";

test("canonical world serializes a multi-instance central plaza using catalog IDs", () => {
  const roundTrip = validateWorldLayout(JSON.parse(serializeWorldLayout(CANONICAL_WORLD_LAYOUT)) as unknown);
  const plaza = getWorldArea(roundTrip);
  assert.equal(plaza.id, CENTRAL_PLAZA_AREA_ID);
  assert.ok(plaza.instances.length >= 12);
  assert.ok(plaza.instances.every((instance) => getWorldAsset(instance.assetId)));
  assert.equal(plaza.instances.find((instance) => instance.id === FOUNTAIN_INSTANCE_ID)?.assetId, "plaza.goose-fountain");
  assert.equal(plaza.instances.find((instance) => instance.id === "plaza.paving")?.assetId, "plaza.paving-base");
});

test("the canonical planters are separate movable world instances", () => {
  const plaza = getWorldArea(CANONICAL_WORLD_LAYOUT);
  const planters = plaza.instances.filter((instance) => instance.assetId.startsWith("plaza.planter-"));
  assert.deepEqual(planters.map((instance) => instance.id), [
    "plaza.planter-east-north",
    "plaza.planter-east-south",
    "plaza.planter-south",
  ]);
  assert.equal(plaza.instances.some((instance) => instance.assetId === "plaza.planter-cluster"), false);
  assert.ok(planters.every((instance) => getWorldAsset(instance.assetId)?.colliders.length === 1));
});

test("saved layouts migrate the legacy planter cluster into separate instances", () => {
  const legacy = cloneWorldLayout(CANONICAL_WORLD_LAYOUT);
  const plaza = getWorldArea(legacy);
  plaza.instances = plaza.instances.filter((instance) => !instance.assetId.startsWith("plaza.planter-"));
  plaza.instances.push({ id: "plaza.planters", assetId: "plaza.planter-cluster", label: "Planter cluster", transform: { x: 2, y: 0, z: 3, rotationY: Math.PI / 2 } });

  const migrated = getWorldArea(validateWorldLayout(legacy));
  const eastNorth = migrated.instances.find((instance) => instance.id === "plaza.planter-east-north");
  assert.ok(eastNorth);
  assert.ok(Math.abs(eastNorth.transform.x - (-5.2)) < 1e-9);
  assert.ok(Math.abs(eastNorth.transform.z - (-16.35)) < 1e-9);
  assert.equal(migrated.instances.some((instance) => instance.assetId === "plaza.planter-cluster"), false);
});

test("legacy plaza layouts migrate their landmark transforms into world instances", () => {
  const old = JSON.parse(JSON.stringify(CANONICAL_PLAZA_LAYOUT));
  old.groups["plaza.goose-fountain"].position.x = 5;
  const migrated = migratePlazaLayout(old);
  assert.equal(getWorldArea(migrated).instances.find((instance) => instance.id === FOUNTAIN_INSTANCE_ID)?.transform.x, 5);
});

test("early world drafts migrate the original plaza paving entry to its fixed base asset", () => {
  const early = cloneWorldLayout(CANONICAL_WORLD_LAYOUT);
  early.schemaVersion = 1;
  early.areas[0].instances.find((instance) => instance.id === "plaza.paving")!.assetId = "plaza.paving-patch";
  assert.equal(validateWorldLayout(early).areas[0].instances.find((instance) => instance.id === "plaza.paving")?.assetId, "plaza.paving-base");
});

test("world validation rejects unknown assets, duplicate instance IDs, and missing central plaza", () => {
  const unknown = cloneWorldLayout(CANONICAL_WORLD_LAYOUT);
  unknown.areas[0].instances[0].assetId = "missing.asset";
  assert.throws(() => validateWorldLayout(unknown), /Unknown world asset/);
  const duplicate = cloneWorldLayout(CANONICAL_WORLD_LAYOUT);
  duplicate.areas[0].instances[1].id = duplicate.areas[0].instances[0].id;
  assert.throws(() => validateWorldLayout(duplicate), /Duplicate instance ID/);
  const absent = cloneWorldLayout(CANONICAL_WORLD_LAYOUT);
  absent.areas[0].id = "another-area";
  assert.throws(() => validateWorldLayout(absent), /central plaza/);
});

test("areas and variable-length asset instances can be authored without changing the catalog", () => {
  const world = cloneWorldLayout(CANONICAL_WORLD_LAYOUT);
  const garden = addWorldArea(world, "garden", "Garden");
  const table = createInstance(garden, "plaza.cafe-table-set", "garden.table-1", 2, 3);
  assert.equal(table.transform.x, 2);
  assert.equal(validateWorldLayout(world).areas.find((area) => area.id === "garden")?.instances.length, 1);
  deleteWorldArea(world, "garden");
  assert.equal(world.areas.some((area) => area.id === "garden"), false);
  assert.throws(() => deleteWorldArea(world, CENTRAL_PLAZA_AREA_ID), /cannot be deleted/);
});

test("authors can place assets at unbounded finite coordinates and create only sparse chunks", () => {
  const world = cloneWorldLayout(CANONICAL_WORLD_LAYOUT);
  const garden = addWorldArea(world, "far-garden", "Far garden");
  const table = createInstance(garden, "plaza.cafe-table-set", "far-garden.table", 25_000, -40_000);
  clampWorldInstance(table);
  assert.equal(table.transform.x, 25_000);
  assert.deepEqual(garden.chunks, [{ ...worldChunkCoordinates(25_000, -40_000), playable: false }]);
});

test("playable chunks and authored surface heights control traversal across a curb", () => {
  const world = cloneWorldLayout(CANONICAL_WORLD_LAYOUT);
  const street = addWorldArea(world, "street-test", "Street test");
  const sidewalk = createInstance(street, "street.sidewalk-tile", "street-test.sidewalk", 0, 0);
  const road = createInstance(street, "street.road-tile", "street-test.road", 8, 0);
  const sidewalkChunk = worldChunkCoordinates(sidewalk.transform.x, sidewalk.transform.z);
  const roadChunk = worldChunkCoordinates(road.transform.x, road.transform.z);
  toggleWorldChunkPlayable(street, sidewalkChunk.x, sidewalkChunk.z);
  assert.equal(getWorldGroundHeight(street, 0, 0), 0);
  assert.equal(getWorldGroundHeight(street, 8, 0), -0.15);
  const output = { x: 0, y: 0, z: 0 };
  resolveWorldAreaMovement(street, { x: 0, y: 0, z: 0 }, { x: 8, y: 0, z: 0 }, output);
  assert.deepEqual(output, { x: 8, y: -0.15, z: 0 });
  street.chunks.find((chunk) => chunk.x === roadChunk.x && chunk.z === roadChunk.z)!.playable = false;
  assert.equal(isWorldAreaPlayable(street, 8, 0), false);
});

test("placed catalog colliders drive the same central-area traversal data as their views", () => {
  const plaza = getWorldArea(CANONICAL_WORLD_LAYOUT);
  const fountain = plaza.instances.find((instance) => instance.id === FOUNTAIN_INSTANCE_ID)!;
  assert.equal(isWorldAreaPlayable(plaza, fountain.transform.x, fountain.transform.z), false);
  assert.equal(isWorldAreaPlayable(plaza, 19.35, -7.2), false, "planter cluster blocks at its authored visual location");
  assert.equal(isWorldAreaPlayable(plaza, 3.5, -3.25), true, "splash pad has no authored blocker");
});
