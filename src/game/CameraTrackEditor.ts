import * as THREE from "three";
import type { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { TransformControls } from "three/addons/controls/TransformControls.js";
import { cameraDirectorPose, fallbackCameraTrack } from "./cameraDirector.ts";
import { CAMERA_BASE_FOV, CAMERA_FOCUS_HEIGHT, CAMERA_TRACK_MAX_ZOOM, CAMERA_TRACK_MIN_ZOOM, clampCameraTrackPoint, SampledCameraTrack, type CameraTrack, type CameraTrackPoint } from "./cameraTrack.ts";
import type { WorldArea } from "./worldLayout.ts";
import { getWorldGroundHeight } from "./worldLevel.ts";

const SNAP = 0.25;
const TRACK_COLORS = [0xb9a6ff, 0x7fd6c2, 0xf2a37a, 0x9fd36b, 0xf07fb0, 0x8cc4f2];
const SELECTED_COLOR = 0xf1d38b;
const NEW_TRACK_HEIGHT = 12;
const NEW_ZONE_HALF_SIZE = 8;
const ZONE_Y = 0.15;

type Selection = { kind: "point" | "corner"; index: number };
type MarkerTag = Selection & { trackIndex: number };

export interface CameraTrackEditorHost {
  readonly area: WorldArea;
  mutate(message: string, change: () => void): void;
  setStatus(message: string, error?: boolean): void;
}

function editorOnly(object: THREE.Object3D): void {
  object.traverse((node) => { node.userData.editorIgnore = true; node.renderOrder = 30; });
}
function snap(value: number): number { return Math.round(value / SNAP) * SNAP; }
function trackColor(index: number): number { return TRACK_COLORS[index % TRACK_COLORS.length]; }

/**
 * Builder mode for an area's sky camera tracks. Each track shows as balls on a
 * line in the sky; a track can own a zone drawn on the ground, and is used while
 * the goose is inside it. The track without a zone covers everywhere else. A
 * stand-in goose previews which track and camera the player would get anywhere.
 */
export class CameraTrackEditor {
  readonly tools = document.createElement("div");
  active = false;
  private readonly helpers = new THREE.Group();
  private readonly shapes = new THREE.Group();
  private readonly markers: THREE.Mesh[] = [];
  private readonly markerGeometry = new THREE.SphereGeometry(0.85, 18, 14);
  private readonly cornerGeometry = new THREE.CylinderGeometry(0.7, 0.7, 0.25, 20);
  private readonly previewCamera = new THREE.PerspectiveCamera(CAMERA_BASE_FOV, 1, 0.5, 20);
  private readonly previewHelper = new THREE.CameraHelper(this.previewCamera);
  private readonly sightLine = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ depthTest: false, transparent: true }));
  private readonly standIn = new THREE.Vector3();
  private readonly fallbackStandIn = new THREE.Mesh(new THREE.SphereGeometry(0.35, 14, 10), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  private trackIndex = 0;
  private selection: Selection = { kind: "point", index: 0 };
  private zoomBefore?: number;
  private savedView?: { position: THREE.Vector3; target: THREE.Vector3; fov: number };
  private readonly trackSelect = document.createElement("select");
  private readonly nameInput = document.createElement("input");
  private readonly zoneLabel = document.createElement("p");
  private readonly zoneButton: HTMLButtonElement;
  private readonly selectionLabel = document.createElement("p");
  private readonly heightInput = document.createElement("input");
  private readonly zoomInput = document.createElement("input");
  private readonly zoomValue = document.createElement("span");
  private readonly addButton: HTMLButtonElement;
  private readonly deleteButton: HTMLButtonElement;
  private readonly deleteTrackButton: HTMLButtonElement;
  private readonly lookButton: HTMLButtonElement;
  private readonly previewLabel = document.createElement("p");
  private readonly trackTools = document.createElement("div");
  private readonly pointFields = document.createElement("div");
  private readonly camera: THREE.PerspectiveCamera;
  private readonly transform: TransformControls;
  private readonly orbit: OrbitControls;
  private readonly host: CameraTrackEditorHost;
  private readonly goose: THREE.Object3D;

  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera, transform: TransformControls, orbit: OrbitControls, host: CameraTrackEditorHost, goose?: THREE.Object3D) {
    this.camera = camera; this.transform = transform; this.orbit = orbit; this.host = host;
    this.goose = goose ?? this.fallbackStandIn;
    if (!goose) { this.fallbackStandIn.visible = false; scene.add(this.fallbackStandIn); }
    (this.previewHelper.material as THREE.LineBasicMaterial).depthTest = false;
    this.helpers.add(this.shapes, this.previewHelper, this.sightLine);
    editorOnly(this.helpers);
    this.helpers.visible = false;
    scene.add(this.helpers);
    this.zoneButton = this.button("Add zone", () => this.toggleZone());
    this.addButton = this.button("Add point", () => this.addToSelection());
    this.deleteButton = this.button("Delete point", () => this.deleteSelected());
    this.deleteTrackButton = this.button("Delete track", () => this.deleteTrack());
    this.lookButton = this.button("Look through camera", () => this.toggleLook());
    this.buildTools();
  }

  get looking(): boolean { return this.savedView !== undefined; }
  private get tracks(): CameraTrack[] { return this.host.area.cameraTracks ?? []; }
  private get track(): CameraTrack | undefined { return this.tracks[this.trackIndex]; }

  private button(text: string, handler: () => void): HTMLButtonElement { const button = document.createElement("button"); button.type = "button"; button.textContent = text; button.addEventListener("click", handler); return button; }
  private row(...children: HTMLElement[]): HTMLDivElement { const row = document.createElement("div"); row.className = `plaza-editor__actions${children.length === 1 ? " plaza-editor__actions--single" : ""}`; row.append(...children); return row; }

  private buildTools(): void {
    this.tools.className = "plaza-editor__track"; this.tools.hidden = true;
    const trackLabel = document.createElement("label"); trackLabel.textContent = "Camera track"; trackLabel.append(this.trackSelect);
    this.trackSelect.addEventListener("change", () => { this.trackIndex = Number(this.trackSelect.value); this.selection = { kind: "point", index: 0 }; this.refresh(); });
    const nameLabel = document.createElement("label"); nameLabel.textContent = "Name"; nameLabel.append(this.nameInput);
    this.nameInput.type = "text"; this.nameInput.maxLength = 60; this.nameInput.addEventListener("change", this.commitName);
    this.zoneLabel.className = "plaza-editor__track-point";
    this.selectionLabel.className = "plaza-editor__track-point";
    this.previewLabel.className = "plaza-editor__track-point";
    this.pointFields.className = "plaza-editor__track-fields";
    const height = document.createElement("label"); height.textContent = "Height";
    this.heightInput.type = "number"; this.heightInput.step = "0.5"; this.heightInput.addEventListener("change", this.commitHeight);
    const unit = document.createElement("span"); unit.className = "plaza-editor__suffix"; unit.textContent = "m"; height.append(this.heightInput, unit);
    const zoom = document.createElement("label"); zoom.textContent = "Zoom ";
    this.zoomInput.type = "range"; this.zoomInput.min = String(CAMERA_TRACK_MIN_ZOOM * 100); this.zoomInput.max = String(CAMERA_TRACK_MAX_ZOOM * 100); this.zoomInput.step = "5";
    this.zoomInput.addEventListener("input", this.previewZoom); this.zoomInput.addEventListener("change", this.commitZoom);
    this.zoomValue.className = "plaza-editor__track-zoom-value"; zoom.append(this.zoomValue, this.zoomInput);
    this.pointFields.append(height, zoom);
    this.trackTools.append(nameLabel, this.zoneLabel, this.row(this.zoneButton), this.selectionLabel,
      this.row(this.button("Previous", () => this.step(-1)), this.button("Next", () => this.step(1))), this.pointFields, this.row(this.addButton, this.deleteButton), this.row(this.lookButton), this.previewLabel);
    const help = document.createElement("p"); help.className = "plaza-editor__help";
    help.textContent = "Click a ball or a zone corner to select it and drag its arrows to move it; a ball's green arrow sets its height. Inside a track's zone the camera uses that track; the track without a zone covers everywhere else, and the camera glides between them. Click the ground to move the stand-in goose and see which camera the player would get. Keep tracks to the side of where the goose walks, not straight above it.";
    this.tools.append(trackLabel, this.row(this.button("New track", () => this.newTrack()), this.deleteTrackButton), this.trackTools, help);
  }

  setActive(active: boolean): void {
    if (this.active === active) return;
    if (!active && this.looking) this.toggleLook();
    this.active = active; this.tools.hidden = !active; this.helpers.visible = active; this.goose.visible = active;
    if (active) {
      this.standIn.set(this.orbit.target.x, 0, this.orbit.target.z);
      this.transform.setMode("translate"); this.transform.showX = true; this.transform.showZ = true;
      this.refresh();
    } else {
      this.transform.detach();
    }
  }

  /** Rebuild visuals and fields from the area data, e.g. after undo or switching areas. */
  refresh(): void {
    const tracks = this.tracks;
    this.trackIndex = Math.min(Math.max(this.trackIndex, 0), Math.max(tracks.length - 1, 0));
    const fallback = fallbackCameraTrack(tracks);
    this.trackSelect.replaceChildren(...tracks.map((track, index) => {
      const option = document.createElement("option"); option.value = String(index);
      option.textContent = `${track.label} · ${track.zone ? "its zone" : track === fallback ? "everywhere else" : "unused (no zone)"}`;
      return option;
    }));
    this.trackSelect.value = String(this.trackIndex); this.trackSelect.disabled = tracks.length === 0;
    this.deleteTrackButton.disabled = tracks.length === 0;
    for (const marker of this.markers) marker.removeFromParent();
    this.markers.length = 0;
    tracks.forEach((track, trackIndex) => {
      const color = trackColor(trackIndex); const current = trackIndex === this.trackIndex;
      track.points.forEach((point, index) => {
        const marker = new THREE.Mesh(this.markerGeometry, new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true, opacity: current ? 1 : 0.45 }));
        marker.position.set(point.x, point.y, point.z); marker.userData.trackMarker = { trackIndex, kind: "point", index } satisfies MarkerTag;
        const drop = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, -point.y, 0)]), new THREE.LineDashedMaterial({ color, dashSize: 0.5, gapSize: 0.4, transparent: true, opacity: current ? 0.55 : 0.25 }));
        drop.computeLineDistances(); marker.add(drop);
        editorOnly(marker); this.markers.push(marker); this.helpers.add(marker);
      });
      track.zone?.forEach((corner, index) => {
        const marker = new THREE.Mesh(this.cornerGeometry, new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true, opacity: current ? 1 : 0.45 }));
        marker.position.set(corner.x, ZONE_Y, corner.z); marker.userData.trackMarker = { trackIndex, kind: "corner", index } satisfies MarkerTag;
        editorOnly(marker); this.markers.push(marker); this.helpers.add(marker);
      });
    });
    this.rebuildShapes();
    this.updateSelection();
  }

  /** Handles a click in the world while this mode is active. */
  handleClick(raycaster: THREE.Raycaster, ground: THREE.Vector3 | undefined): void {
    if (!this.looking) {
      const hit = raycaster.intersectObjects(this.markers, false)[0];
      if (hit) {
        const tag = hit.object.userData.trackMarker as MarkerTag;
        const switching = tag.trackIndex !== this.trackIndex;
        this.trackIndex = tag.trackIndex; this.selection = { kind: tag.kind, index: tag.index };
        if (switching) this.refresh(); else this.updateSelection();
        return;
      }
    }
    if (ground) { this.standIn.set(ground.x, 0, ground.z); this.updatePreview(); }
  }

  private isSelected(tag: MarkerTag): boolean { return tag.trackIndex === this.trackIndex && tag.kind === this.selection.kind && tag.index === this.selection.index; }
  private selectedMarker(): THREE.Mesh | undefined { return this.markers.find((marker) => this.isSelected(marker.userData.trackMarker as MarkerTag)); }

  /** Called while the gizmo drags the selected ball or zone corner. */
  onTransformChange(): void {
    const track = this.track; const marker = this.selectedMarker();
    if (!track || !marker) return;
    if (this.selection.kind === "corner") {
      const corner = track.zone?.[this.selection.index]; if (!corner) return;
      corner.x = snap(marker.position.x); corner.z = snap(marker.position.z);
      marker.position.set(corner.x, ZONE_Y, corner.z);
    } else {
      const point = track.points[this.selection.index]; if (!point) return;
      point.x = snap(marker.position.x); point.y = snap(marker.position.y); point.z = snap(marker.position.z);
      clampCameraTrackPoint(point);
      marker.position.set(point.x, point.y, point.z);
      const drop = marker.children[0] as THREE.Line;
      drop.geometry.setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, -point.y, 0)]); drop.computeLineDistances();
      this.heightInput.value = point.y.toFixed(1);
    }
    this.rebuildShapes();
  }

  private selectionCount(): number {
    const track = this.track; if (!track) return 0;
    return this.selection.kind === "corner" ? track.zone?.length ?? 0 : track.points.length;
  }

  private step(direction: number): void {
    const count = this.selectionCount(); if (count === 0) return;
    this.selection = { kind: this.selection.kind, index: (this.selection.index + direction + count) % count };
    this.updateSelection();
  }

  private updateSelection(): void {
    const track = this.track;
    if (this.selection.kind === "corner" && !track?.zone) this.selection = { kind: "point", index: 0 };
    this.selection.index = Math.min(this.selection.index, Math.max(this.selectionCount() - 1, 0));
    for (const marker of this.markers) {
      const tag = marker.userData.trackMarker as MarkerTag;
      (marker.material as THREE.MeshBasicMaterial).color.setHex(this.isSelected(tag) ? SELECTED_COLOR : trackColor(tag.trackIndex));
    }
    this.trackTools.hidden = !track;
    if (!track) {
      this.transform.detach();
      this.updatePreview();
      return;
    }
    this.nameInput.value = track.label;
    const fallback = fallbackCameraTrack(this.tracks);
    this.zoneLabel.textContent = track.zone ? "Used while the goose is inside this track's zone."
      : track === fallback ? "No zone: used everywhere outside the other tracks' zones."
        : "No zone, and another track already covers everywhere else, so this one is never used. Give it a zone.";
    this.zoneButton.textContent = track.zone ? "Remove zone" : "Add zone";
    const corner = this.selection.kind === "corner";
    this.pointFields.hidden = corner;
    this.addButton.textContent = corner ? "Add corner" : "Add point";
    this.deleteButton.textContent = corner ? "Delete corner" : "Delete point";
    this.selectionLabel.textContent = corner ? `Zone corner ${this.selection.index + 1} of ${track.zone?.length ?? 0}` : `Point ${this.selection.index + 1} of ${track.points.length}`;
    if (!corner) {
      const point = track.points[this.selection.index];
      this.heightInput.value = point.y.toFixed(1);
      this.zoomInput.value = String(Math.round(point.zoom * 100)); this.zoomValue.textContent = `${Math.round(point.zoom * 100)}%`;
    }
    // Zone corners sit on the ground, so they only slide sideways.
    this.transform.showY = !corner;
    const marker = this.selectedMarker();
    if (this.active && !this.looking && marker) this.transform.attach(marker); else this.transform.detach();
    this.updatePreview();
  }

  private rebuildShapes(): void {
    for (const child of [...this.shapes.children]) {
      child.removeFromParent();
      if (child instanceof THREE.Mesh || child instanceof THREE.Line) child.geometry.dispose();
    }
    this.tracks.forEach((track, trackIndex) => {
      const color = trackColor(trackIndex); const current = trackIndex === this.trackIndex;
      if (track.points.length >= 2) {
        const samples = new SampledCameraTrack(track).samples.map((sample) => new THREE.Vector3(sample.x, sample.y, sample.z));
        this.shapes.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(samples), samples.length * 2, 0.18, 8, false), new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true, opacity: current ? 0.85 : 0.35 })));
      }
      if (track.zone && track.zone.length >= 3) {
        // The shape is drawn flat in x/y, then laid on the ground (shape y becomes world -z).
        const shape = new THREE.Shape(track.zone.map((corner) => new THREE.Vector2(corner.x, -corner.z)));
        const fill = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true, opacity: current ? 0.2 : 0.1, side: THREE.DoubleSide }));
        fill.rotation.x = -Math.PI / 2; fill.position.y = ZONE_Y;
        const outline = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(track.zone.map((corner) => new THREE.Vector3(corner.x, ZONE_Y, corner.z))), new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true, opacity: current ? 0.9 : 0.4 }));
        this.shapes.add(fill, outline);
      }
    });
    editorOnly(this.shapes);
    this.updatePreview();
  }

  private focusPoint(): THREE.Vector3 {
    const ground = getWorldGroundHeight(this.host.area, this.standIn.x, this.standIn.z) ?? 0;
    return new THREE.Vector3(this.standIn.x, ground + CAMERA_FOCUS_HEIGHT, this.standIn.z);
  }

  private updatePreview(): void {
    const focus = this.focusPoint();
    this.goose.position.set(focus.x, focus.y - CAMERA_FOCUS_HEIGHT, focus.z);
    const chosen = cameraDirectorPose(this.tracks, focus);
    this.previewHelper.visible = Boolean(chosen); this.sightLine.visible = Boolean(chosen);
    this.previewLabel.textContent = chosen ? `Where the stand-in goose stands, the camera uses “${chosen.track.label}”.` : "";
    if (!chosen) return;
    const { pose, track } = chosen;
    const color = new THREE.Color(trackColor(this.tracks.indexOf(track)));
    this.previewHelper.setColors(color, color, color, color, color);
    (this.sightLine.material as THREE.LineBasicMaterial).color.copy(color);
    this.previewCamera.position.set(pose.x, pose.y, pose.z);
    this.previewCamera.fov = CAMERA_BASE_FOV / pose.zoom;
    this.previewCamera.aspect = this.camera.aspect;
    this.previewCamera.far = this.previewCamera.position.distanceTo(focus) + 1;
    this.previewCamera.lookAt(focus);
    this.previewCamera.updateProjectionMatrix(); this.previewCamera.updateMatrixWorld();
    this.previewHelper.update();
    this.sightLine.geometry.setFromPoints([this.previewCamera.position, focus]);
    if (this.looking) {
      this.camera.position.copy(this.previewCamera.position);
      this.camera.fov = this.previewCamera.fov; this.camera.updateProjectionMatrix();
      this.camera.lookAt(focus);
    }
  }

  private toggleLook(): void {
    if (this.savedView) {
      this.camera.position.copy(this.savedView.position); this.orbit.target.copy(this.savedView.target);
      this.camera.fov = this.savedView.fov; this.camera.updateProjectionMatrix();
      this.savedView = undefined; this.orbit.enabled = true; this.orbit.update();
      this.helpers.visible = true; this.lookButton.textContent = "Look through camera"; this.lookButton.classList.remove("is-active");
      this.updateSelection();
      return;
    }
    if (!this.tracks.length) { this.host.setStatus("Make a track first.", true); return; }
    this.savedView = { position: this.camera.position.clone(), target: this.orbit.target.clone(), fov: this.camera.fov };
    this.orbit.enabled = false; this.transform.detach(); this.helpers.visible = false;
    this.lookButton.textContent = "Back to editing"; this.lookButton.classList.add("is-active");
    this.host.setStatus("Showing the player's view. Click the ground to move the stand-in goose; Esc goes back.");
    this.updatePreview();
  }

  exitLook(): boolean { if (!this.looking) return false; this.toggleLook(); return true; }

  private squareAroundView(): { x: number; z: number }[] {
    const x = snap(this.orbit.target.x); const z = snap(this.orbit.target.z); const size = NEW_ZONE_HALF_SIZE;
    return [{ x: x - size, z: z - size }, { x: x + size, z: z - size }, { x: x + size, z: z + size }, { x: x - size, z: z + size }];
  }

  private newTrack(): void {
    this.host.mutate("Camera track added.", () => {
      const area = this.host.area; const tracks = area.cameraTracks ?? [];
      const x = Math.round(this.orbit.target.x); const z = Math.round(this.orbit.target.z);
      let number = tracks.length + 1; while (tracks.some((track) => track.id === `track-${number}`)) number += 1;
      const track: CameraTrack = {
        id: tracks.length ? `track-${number}` : "main", label: tracks.length ? `Track ${tracks.length + 1}` : "Main track",
        points: [{ x: x - 8, y: NEW_TRACK_HEIGHT, z: z - 10, zoom: 1 }, { x: x + 8, y: NEW_TRACK_HEIGHT, z: z - 10, zoom: 1 }],
      };
      // The first track covers the whole area; later ones start with a zone around the current view.
      if (tracks.length) track.zone = this.squareAroundView();
      area.cameraTracks = [...tracks, track];
      this.trackIndex = area.cameraTracks.length - 1; this.selection = { kind: "point", index: 1 };
      this.refresh();
    });
  }

  private deleteTrack(): void {
    const track = this.track; if (!track) return;
    if (!window.confirm(`Delete the camera track “${track.label}”?`)) return;
    this.removeTrack();
  }

  private removeTrack(): void {
    this.host.mutate("Camera track deleted.", () => {
      const area = this.host.area;
      const remaining = this.tracks.filter((_, index) => index !== this.trackIndex);
      if (remaining.length) area.cameraTracks = remaining; else delete area.cameraTracks;
      this.trackIndex = Math.max(0, this.trackIndex - 1); this.selection = { kind: "point", index: 0 };
      this.refresh();
    });
  }

  private toggleZone(): void {
    const track = this.track; if (!track) return;
    if (track.zone) {
      this.host.mutate("Zone removed.", () => { delete track.zone; this.selection = { kind: "point", index: 0 }; this.refresh(); });
    } else {
      this.host.mutate("Zone added. Drag its corners to shape it.", () => { track.zone = this.squareAroundView(); this.selection = { kind: "corner", index: 0 }; this.refresh(); });
    }
  }

  private addToSelection(): void {
    const track = this.track; if (!track) return;
    if (this.selection.kind === "corner") {
      const zone = track.zone; if (!zone) return;
      this.host.mutate("Zone corner added.", () => {
        const current = zone[this.selection.index]; const next = zone[(this.selection.index + 1) % zone.length];
        zone.splice(this.selection.index + 1, 0, { x: snap((current.x + next.x) / 2), z: snap((current.z + next.z) / 2) });
        this.selection.index += 1; this.refresh();
      });
      return;
    }
    this.host.mutate("Camera track point added.", () => {
      const points = track.points; const current = points[this.selection.index];
      const next = points[this.selection.index + 1];
      let point: CameraTrackPoint;
      if (next) point = { x: (current.x + next.x) / 2, y: (current.y + next.y) / 2, z: (current.z + next.z) / 2, zoom: (current.zoom + next.zoom) / 2 };
      else {
        const previous = points[this.selection.index - 1];
        const dx = current.x - previous.x; const dz = current.z - previous.z; const length = Math.hypot(dx, dz) || 1;
        const step = Math.min(length, 10);
        point = { x: current.x + (dx / length) * step, y: current.y, z: current.z + (dz / length) * step, zoom: current.zoom };
      }
      point.x = snap(point.x); point.z = snap(point.z);
      points.splice(this.selection.index + 1, 0, point);
      this.selection.index += 1;
      this.refresh();
    });
  }

  deleteSelected(): void {
    const track = this.track; if (!track) return;
    if (this.selection.kind === "corner") {
      const zone = track.zone; if (!zone) return;
      if (zone.length <= 3) { this.host.setStatus("A zone needs at least three corners. Use Remove zone to drop it.", true); return; }
      this.host.mutate("Zone corner deleted.", () => { zone.splice(this.selection.index, 1); this.selection.index = Math.max(0, this.selection.index - 1); this.refresh(); });
      return;
    }
    if (track.points.length <= 2) {
      if (!window.confirm(`A track needs at least two points. Delete the camera track “${track.label}”?`)) return;
      this.removeTrack();
      return;
    }
    this.host.mutate("Camera track point deleted.", () => { track.points.splice(this.selection.index, 1); this.selection.index = Math.max(0, this.selection.index - 1); this.refresh(); });
  }

  private selectedPoint(): CameraTrackPoint | undefined { return this.selection.kind === "point" ? this.track?.points[this.selection.index] : undefined; }

  private readonly commitName = (): void => {
    const track = this.track; const label = this.nameInput.value.trim().slice(0, 60);
    if (!track || !label || label === track.label) { this.nameInput.value = track?.label ?? ""; return; }
    this.host.mutate("Camera track renamed.", () => { track.label = label; this.refresh(); });
  };

  private readonly commitHeight = (): void => {
    const point = this.selectedPoint(); const height = Number(this.heightInput.value);
    if (!point || !Number.isFinite(height)) return;
    this.host.mutate("Camera height saved.", () => { point.y = height; clampCameraTrackPoint(point); this.refresh(); });
  };

  private readonly previewZoom = (): void => {
    const point = this.selectedPoint(); if (!point) return;
    this.zoomBefore ??= point.zoom;
    this.zoomValue.textContent = `${this.zoomInput.value}%`;
    point.zoom = Number(this.zoomInput.value) / 100; this.updatePreview();
  };

  private readonly commitZoom = (): void => {
    const point = this.selectedPoint(); if (!point) return;
    const zoom = Number(this.zoomInput.value) / 100;
    // The slider previewed live; put the old value back so the change is recorded as one undo step.
    point.zoom = this.zoomBefore ?? point.zoom; this.zoomBefore = undefined;
    this.host.mutate("Camera zoom saved.", () => { point.zoom = zoom; clampCameraTrackPoint(point); this.refresh(); });
  };
}
