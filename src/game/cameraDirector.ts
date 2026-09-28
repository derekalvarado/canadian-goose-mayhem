// Chooses between an area's camera tracks. Each track may own a zone drawn on
// the ground; while the goose is inside it, that track is used. A track with no
// zone covers everywhere else. Switching glides the camera from where it was to
// the new track instead of cutting. Renderer-independent so it can be tested.

import { CAMERA_TRACK_MAX_REACH, CameraTrackRider, limitCameraReach, SampledCameraTrack, type CameraTrack, type CameraTrackSample, type CameraZonePoint } from "./cameraTrack.ts";

// Once inside a zone, the goose must get this far outside it before the camera lets go,
// so pacing along a zone edge does not flick between tracks.
export const CAMERA_ZONE_EXIT_MARGIN = 1.5;
export const CAMERA_TRACK_BLEND_SECONDS = 1.1;

export function pointInZone(zone: readonly CameraZonePoint[], x: number, z: number): boolean {
  let inside = false;
  for (let index = 0, previous = zone.length - 1; index < zone.length; previous = index, index += 1) {
    const a = zone[index]; const b = zone[previous];
    if ((a.z > z) !== (b.z > z) && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

/** How far (x, z) lies outside the zone; zero when inside. */
export function distanceOutsideZone(zone: readonly CameraZonePoint[], x: number, z: number): number {
  if (pointInZone(zone, x, z)) return 0;
  let nearest = Infinity;
  for (let index = 0; index < zone.length; index += 1) {
    const a = zone[index]; const b = zone[(index + 1) % zone.length];
    const dx = b.x - a.x; const dz = b.z - a.z; const lengthSquared = dx * dx + dz * dz;
    const t = lengthSquared > 0 ? Math.min(1, Math.max(0, ((x - a.x) * dx + (z - a.z) * dz) / lengthSquared)) : 0;
    nearest = Math.min(nearest, Math.hypot(a.x + dx * t - x, a.z + dz * t - z));
  }
  return nearest;
}

/** The track without a zone that covers the rest of the area (the first one, if several). */
export function fallbackCameraTrack(tracks: readonly CameraTrack[]): CameraTrack | undefined {
  return tracks.find((track) => !track.zone);
}

/**
 * Which track a goose at (x, z) should use. The current track is kept while the
 * goose stays inside (or just outside) its zone; otherwise the first zone the
 * goose is in wins, then the zone-less track. With neither, the current one stays.
 */
export function chooseCameraTrack(tracks: readonly CameraTrack[], x: number, z: number, currentId?: string): CameraTrack | undefined {
  const current = tracks.find((track) => track.id === currentId);
  if (current?.zone && distanceOutsideZone(current.zone, x, z) <= CAMERA_ZONE_EXIT_MARGIN) return current;
  return tracks.find((track) => track.zone && pointInZone(track.zone, x, z)) ?? fallbackCameraTrack(tracks) ?? current ?? tracks[0];
}

function smoothstep(t: number): number { const clamped = Math.min(1, Math.max(0, t)); return clamped * clamped * (3 - 2 * clamped); }

/** Rides whichever track the goose's position calls for, gliding between them on a change. */
export class CameraTrackDirector {
  private readonly tracks: readonly CameraTrack[];
  private readonly riders = new Map<string, CameraTrackRider>();
  private activeId?: string;
  private last?: CameraTrackSample;
  private blend?: { from: CameraTrackSample; elapsed: number };

  constructor(tracks: readonly CameraTrack[]) {
    this.tracks = tracks;
    for (const track of tracks) this.riders.set(track.id, new CameraTrackRider(new SampledCameraTrack(track)));
  }

  get activeTrackId(): string | undefined { return this.activeId; }
  get blending(): boolean { return this.blend !== undefined; }

  update(focusX: number, focusZ: number, delta: number, response: number, blendSeconds = CAMERA_TRACK_BLEND_SECONDS): CameraTrackSample {
    if (this.activeId === undefined || !this.last) return this.snap(focusX, focusZ);
    const next = chooseCameraTrack(this.tracks, focusX, focusZ, this.activeId);
    if (next && next.id !== this.activeId) {
      // Glide from wherever the camera is right now, even if it was mid-glide already.
      this.blend = { from: this.last, elapsed: 0 };
      this.activeId = next.id;
      this.riders.get(next.id)?.snap(focusX, focusZ);
    }
    const target = this.riders.get(this.activeId)?.update(focusX, focusZ, delta, response) ?? this.last;
    let pose = target;
    if (this.blend) {
      this.blend.elapsed += delta;
      const t = blendSeconds > 0 ? smoothstep(this.blend.elapsed / blendSeconds) : 1;
      const from = this.blend.from;
      pose = { x: from.x + (target.x - from.x) * t, y: from.y + (target.y - from.y) * t, z: from.z + (target.z - from.z) * t, zoom: from.zoom + (target.zoom - from.zoom) * t };
      if (t >= 1) this.blend = undefined;
    }
    this.last = pose;
    return pose;
  }

  /** Jump straight to the right track and spot, e.g. when entering an area. */
  snap(focusX: number, focusZ: number): CameraTrackSample {
    const track = chooseCameraTrack(this.tracks, focusX, focusZ);
    this.activeId = track?.id; this.blend = undefined;
    this.last = (track && this.riders.get(track.id)?.snap(focusX, focusZ)) ?? { x: focusX, y: 10, z: focusZ - 10, zoom: 1 };
    return this.last;
  }
}

/** The settled camera for a goose standing at `focus`, ignoring glides; used by the builder preview. */
export function cameraDirectorPose(tracks: readonly CameraTrack[], focus: { x: number; z: number }): { track: CameraTrack; pose: CameraTrackSample } | undefined {
  const track = chooseCameraTrack(tracks, focus.x, focus.z);
  if (!track) return undefined;
  const sampled = new SampledCameraTrack(track);
  const sample = sampled.sampleAt(sampled.nearestDistance(focus.x, focus.z));
  return { track, pose: { ...limitCameraReach(sample, focus, CAMERA_TRACK_MAX_REACH), zoom: sample.zoom } };
}
