import assert from "node:assert/strict";
import test from "node:test";
import { CameraTrackRider, limitCameraReach, SampledCameraTrack, validateCameraTrack, type CameraTrack } from "../src/game/cameraTrack.ts";
import { CameraTrackDirector, chooseCameraTrack, distanceOutsideZone, pointInZone } from "../src/game/cameraDirector.ts";
import { SubjectFraming } from "../src/game/cameraFraming.ts";
import { ControlHeadingLock } from "../src/game/controlHeading.ts";
import { CANONICAL_WORLD_LAYOUT, CENTRAL_PLAZA_AREA_ID, cloneWorldLayout, getWorldArea, loadWorldLayout, serializeWorldLayout, validateWorldLayout, WORLD_LAYOUT_STORAGE_KEY, type WorldLayoutStorage } from "../src/game/worldLayout.ts";

// An L-shaped track: east along z = -10, then north along x = 20.
const cornerTrack: CameraTrack = { id: "main", label: "Main track", points: [
  { x: -20, y: 10, z: -10, zoom: 1 }, { x: 0, y: 10, z: -10, zoom: 1 },
  { x: 20, y: 10, z: -10, zoom: 1 }, { x: 20, y: 10, z: 10, zoom: 2 },
] };

test("camera tracks drop unusable data and keep values in a safe range", () => {
  assert.equal(validateCameraTrack(undefined, "area.cameraTrack"), undefined);
  assert.equal(validateCameraTrack({ points: [{ x: 0, y: 5, z: 0 }] }, "area.cameraTrack"), undefined);
  assert.throws(() => validateCameraTrack({ points: [{ x: "left", y: 5, z: 0 }, { x: 1, y: 5, z: 0 }] }, "area.cameraTrack"));
  const track = validateCameraTrack({ points: [{ x: 0, y: -4, z: 0 }, { x: 5, y: 5, z: 0, zoom: 99 }] }, "area.cameraTrack");
  assert.ok(track);
  assert.equal(track.points[0].zoom, 1, "zoom defaults to normal");
  assert.ok(track.points[0].y > 0, "a camera cannot sit underground");
  assert.ok(track.points[1].zoom < 99);
});

test("the camera rides to the part of the track nearest the goose and turns the corner", () => {
  const track = new SampledCameraTrack(cornerTrack);
  const rider = new CameraTrackRider(track);
  const alongFirstLeg = rider.snap(0, 0);
  assert.ok(Math.abs(alongFirstLeg.x) < 0.5 && Math.abs(alongFirstLeg.z + 10) < 0.5, "beside the goose on the first leg");
  const afterCorner = rider.snap(30, 6);
  assert.ok(Math.abs(afterCorner.x - 20) < 1.5 && afterCorner.z > 0, "past the corner, beside the goose on the second leg");
  assert.ok(afterCorner.zoom > 1, "zoom follows the authored points");
});

test("the camera glides along the track instead of jumping", () => {
  const rider = new CameraTrackRider(new SampledCameraTrack(cornerTrack));
  const start = rider.snap(-10, 0);
  const next = rider.update(10, 0, 1 / 60, 3);
  assert.ok(next.x > start.x, "it moves toward the goose");
  assert.ok(next.x < 0, "but only part of the way in one frame");
});

test("the camera stays on its stretch of track when a distant stretch is about as near", () => {
  const rider = new CameraTrackRider(new SampledCameraTrack(cornerTrack));
  rider.snap(-5, 0);
  // Walking east, the goose reaches a spot slightly nearer the north-running leg.
  let sample = rider.snap(-5, 0);
  for (let x = -5; x <= 6; x += 0.5) sample = rider.update(x, 5, 1 / 30, 3);
  assert.ok(Math.abs(sample.z + 10) < 1, "still on the first leg");
  // Carrying on around the corner brings the camera round with it.
  for (let step = 0; step < 240; step += 1) sample = rider.update(26, 6, 1 / 30, 3);
  assert.ok(Math.abs(sample.x - 20) < 1.5 && sample.z > 0, "followed the bend onto the second leg");
});

test("a goose far from the track pulls the camera in without changing its direction or height", () => {
  const camera = { x: 0, y: 12, z: -30 };
  const leaned = limitCameraReach(camera, { x: 0, z: 0 }, 13);
  assert.equal(leaned.y, 12);
  assert.equal(leaned.x, 0);
  assert.ok(leaned.z < 0 && Math.abs(leaned.z) < 30);
  assert.deepEqual(limitCameraReach({ x: 0, y: 12, z: -5 }, { x: 0, z: 0 }, 13), { x: 0, y: 12, z: -5 });
});

test("a steady push keeps its direction while the camera swings", () => {
  const lock = new ControlHeadingLock();
  const frame = 1 / 60;
  assert.equal(lock.update(0, 1, 0, frame), 0);
  assert.equal(lock.update(0, 1, Math.PI / 2, frame), 0, "camera turned, but holding up keeps the old heading");
  assert.equal(lock.update(0.2, 1, Math.PI / 2, frame), 0, "small steering corrections keep it too");
});

test("releasing or clearly redirecting the stick adopts the new camera view", () => {
  const frame = 1 / 60;
  const released = new ControlHeadingLock();
  released.update(0, 1, 0, frame);
  for (let i = 0; i < 20; i += 1) released.update(0, 0, Math.PI / 2, frame);
  assert.equal(released.update(0, 1, Math.PI / 2, frame), Math.PI / 2);

  const redirected = new ControlHeadingLock();
  redirected.update(0, 1, 0, frame);
  assert.equal(redirected.update(1, 0, Math.PI / 2, frame), Math.PI / 2);
});

test("a brief stick flicker does not reset the held direction", () => {
  const lock = new ControlHeadingLock();
  lock.update(0, 1, 0, 1 / 60);
  lock.update(0, 0, 1, 1 / 60);
  assert.equal(lock.update(0, 1, 1, 1 / 60), 0);
});

test("a nearby important character is framed with the goose, then released near the edge", () => {
  const framing = new SubjectFraming();
  const goose = { x: 0, z: 0 };
  assert.deepEqual(framing.focus(goose, [{ id: "janitor", x: 20, z: 0 }]), goose, "far away: centre the goose");
  const near = framing.focus(goose, [{ id: "janitor", x: 4, z: 0 }]);
  assert.ok(near.x > 0 && near.x < 4, "close: aim between them");
  assert.equal(framing.framedSubjectId, "janitor");
  const drifting = framing.focus(goose, [{ id: "janitor", x: 7, z: 0 }]);
  assert.ok(drifting.x > 0, "a little farther still stays in the shot");
  assert.deepEqual(framing.focus(goose, [{ id: "janitor", x: 12, z: 0 }]), goose, "near the edge: back to the goose");
  assert.equal(framing.framedSubjectId, undefined);
});

test("framing prefers the closest of several characters", () => {
  const framing = new SubjectFraming();
  framing.focus({ x: 0, z: 0 }, [{ id: "far", x: 5, z: 0 }, { id: "near", x: 0, z: 3 }]);
  assert.equal(framing.framedSubjectId, "near");
});

function memoryStorage(initial: Record<string, string>): WorldLayoutStorage {
  const values = new Map(Object.entries(initial));
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); }, removeItem: (key) => { values.delete(key); } };
}

test("camera tracks survive saving and loading", () => {
  const layout = cloneWorldLayout(CANONICAL_WORLD_LAYOUT);
  getWorldArea(layout).cameraTracks = [cornerTrack];
  const reloaded = validateWorldLayout(JSON.parse(serializeWorldLayout(layout)));
  assert.deepEqual(getWorldArea(reloaded).cameraTracks, [cornerTrack]);
});

test("an older saved world gains the square's camera track, but an edited track is kept", () => {
  const older = cloneWorldLayout(CANONICAL_WORLD_LAYOUT);
  delete getWorldArea(older).cameraTracks;
  older.canonicalRevision = 19;
  const upgraded = loadWorldLayout(memoryStorage({ [WORLD_LAYOUT_STORAGE_KEY]: serializeWorldLayout(older) }));
  assert.ok(getWorldArea(upgraded, CENTRAL_PLAZA_AREA_ID).cameraTracks?.length);

  const edited = cloneWorldLayout(CANONICAL_WORLD_LAYOUT);
  getWorldArea(edited).cameraTracks = [cornerTrack];
  edited.canonicalRevision = 19;
  const kept = loadWorldLayout(memoryStorage({ [WORLD_LAYOUT_STORAGE_KEY]: serializeWorldLayout(edited) }));
  assert.deepEqual(getWorldArea(kept).cameraTracks, [cornerTrack]);
});

test("an area whose track was deleted stays without one", () => {
  const cleared = cloneWorldLayout(CANONICAL_WORLD_LAYOUT);
  delete getWorldArea(cleared).cameraTracks;
  const reloaded = loadWorldLayout(memoryStorage({ [WORLD_LAYOUT_STORAGE_KEY]: serializeWorldLayout(cleared) }));
  assert.equal(getWorldArea(reloaded).cameraTracks, undefined);
});

test("a world saved with a single camera track loads it as the area's main track", () => {
  const layout = JSON.parse(serializeWorldLayout(cloneWorldLayout(CANONICAL_WORLD_LAYOUT)));
  const plaza = layout.areas.find((area: { id: string }) => area.id === CENTRAL_PLAZA_AREA_ID);
  delete plaza.cameraTracks;
  plaza.cameraTrack = { points: cornerTrack.points };
  const tracks = getWorldArea(validateWorldLayout(layout), CENTRAL_PLAZA_AREA_ID).cameraTracks;
  assert.equal(tracks?.length, 1);
  assert.deepEqual(tracks?.[0].points, cornerTrack.points);
  assert.equal(tracks?.[0].zone, undefined, "it covers the whole area");
});

test("a zone needs at least three corners", () => {
  const track = validateCameraTrack({ points: cornerTrack.points, zone: [{ x: 0, z: 0 }, { x: 5, z: 0 }] }, "track");
  assert.equal(track?.zone, undefined);
  assert.throws(() => validateCameraTrack({ points: cornerTrack.points, zone: [{ x: 0, z: "north" }, { x: 5, z: 0 }, { x: 5, z: 5 }] }, "track"));
});

const square = [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 10 }, { x: 0, z: 10 }];

test("zones know what is inside them and how far outside a spot is", () => {
  assert.ok(pointInZone(square, 5, 5));
  assert.ok(!pointInZone(square, 15, 5));
  assert.equal(distanceOutsideZone(square, 5, 5), 0);
  assert.ok(Math.abs(distanceOutsideZone(square, 13, 5) - 3) < 1e-9);
});

// The main track covers everywhere; the alley track only its square.
const mainTrack: CameraTrack = { id: "main", label: "Main", points: [{ x: -30, y: 10, z: -20, zoom: 1 }, { x: 30, y: 10, z: -20, zoom: 1 }] };
const alleyTrack: CameraTrack = { id: "alley", label: "Alley", points: [{ x: 20, y: 8, z: 0, zoom: 1 }, { x: 20, y: 8, z: 10, zoom: 1 }], zone: square };

test("inside a zone the camera uses that zone's track, elsewhere the track without a zone", () => {
  assert.equal(chooseCameraTrack([mainTrack, alleyTrack], 5, 5)?.id, "alley");
  assert.equal(chooseCameraTrack([mainTrack, alleyTrack], -20, 5)?.id, "main");
  assert.equal(chooseCameraTrack([alleyTrack], -20, 5, "alley")?.id, "alley", "with no track covering everywhere else, the camera stays put");
});

test("stepping just over a zone's edge does not flick the camera back", () => {
  assert.equal(chooseCameraTrack([mainTrack, alleyTrack], 10.5, 5, "alley")?.id, "alley");
  assert.equal(chooseCameraTrack([mainTrack, alleyTrack], 10.5, 5, "main")?.id, "main");
  assert.equal(chooseCameraTrack([mainTrack, alleyTrack], 20, 5, "alley")?.id, "main", "well outside, it lets go");
});

test("entering a zone glides the camera over to its track instead of cutting", () => {
  const director = new CameraTrackDirector([mainTrack, alleyTrack]);
  const before = director.snap(-5, 5);
  assert.equal(director.activeTrackId, "main");
  const first = director.update(5, 5, 1 / 60, 3);
  assert.equal(director.activeTrackId, "alley");
  assert.ok(director.blending);
  const alley = new CameraTrackRider(new SampledCameraTrack(alleyTrack)).snap(5, 5);
  assert.ok(Math.hypot(first.x - before.x, first.z - before.z) < Math.hypot(alley.x - before.x, alley.z - before.z) / 4, "only a little way along in the first frame");
  let pose = first;
  for (let frame = 0; frame < 120; frame += 1) pose = director.update(5, 5, 1 / 60, 3);
  assert.ok(!director.blending);
  assert.ok(Math.hypot(pose.x - alley.x, pose.z - alley.z) < 0.01, "then settles on the new track");
});

test("starting inside a zone puts the camera straight on its track", () => {
  const director = new CameraTrackDirector([mainTrack, alleyTrack]);
  const pose = director.snap(5, 5);
  assert.equal(director.activeTrackId, "alley");
  assert.equal(pose.x, 20);
});
