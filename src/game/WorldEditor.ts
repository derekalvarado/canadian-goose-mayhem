import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { WORLD_ASSETS, getWorldAsset } from "./worldAssets.ts";
import { CENTRAL_PLAZA_AREA_ID, addWorldArea, clampWorldInstance, createInstance, deleteWorldArea, getWorldArea, loadWorldLayout, migratePlazaLayout, resetWorldLayout, saveWorldLayout, serializeWorldLayout, toggleWorldChunkPlayable, type WorldArea, type WorldInstance, type WorldLayout, validateWorldLayout, worldChunkCoordinates } from "./worldLayout.ts";
import { validatePlazaLayout } from "./plazaLayout.ts";
import { findWorldInstanceOverlaps, getWorldGroundHeight } from "./worldLevel.ts";
import { WorldView } from "./WorldView.ts";
import { resolveEditorShortcut, WorldEditorHistory, type WorldEditorSnapshot } from "./worldEditorHistory.ts";

const SNAP = 0.25; const ROTATION_SNAP = THREE.MathUtils.degToRad(5);
function download(contents: string): void { const blob = new Blob([contents], { type: "application/json" }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = "goose-game-world.json"; link.click(); URL.revokeObjectURL(url); }
function findInstance(object: THREE.Object3D | null): string | undefined { for (let node = object; node; node = node.parent) { const id = node.userData.worldInstanceId as string | undefined; if (id) return id; } return undefined; }
function cleanId(value: string): string { return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "area"; }

export class WorldEditor {
  private readonly orbit: OrbitControls; private readonly transform: TransformControls; private readonly raycaster = new THREE.Raycaster(); private readonly pointer = new THREE.Vector2();
  private readonly panel = document.createElement("aside"); private readonly areaSelect = document.createElement("select"); private readonly assetSelect = document.createElement("select"); private readonly instanceSelect = document.createElement("select");
  private readonly xInput = document.createElement("input"); private readonly zInput = document.createElement("input"); private readonly rotationInput = document.createElement("input"); private readonly status = document.createElement("p"); private readonly warnings = document.createElement("p");
  private readonly preview = new THREE.Group(); private readonly outline = new THREE.BoxHelper(new THREE.Object3D(), 0xf1d38b);
  private readonly history = new WorldEditorHistory(); private undoButton?: HTMLButtonElement; private redoButton?: HTMLButtonElement;
  private world: WorldLayout; private view: WorldView; private areaId = CENTRAL_PLAZA_AREA_ID; private selectedId?: string; private placing = false;

  constructor(scene: THREE.Scene, private readonly camera: THREE.Camera, private readonly canvas: HTMLCanvasElement, world = loadWorldLayout(), view?: WorldView) {
    this.world = world; this.view = view ?? new WorldView(this.area); if (!view) scene.add(this.view); scene.add(this.preview, this.outline);
    this.preview.visible = false; this.preview.userData.editorIgnore = true; this.outline.userData.editorIgnore = true; this.outline.renderOrder = 20;
    this.orbit = new OrbitControls(camera, canvas); this.orbit.mouseButtons.LEFT = null; this.orbit.mouseButtons.MIDDLE = THREE.MOUSE.ROTATE; this.orbit.target.set(0, 0, 0); this.orbit.update(); this.orbit.saveState(); this.view.setEditorChunkFocus(0, 0); this.orbit.addEventListener("change", () => this.view.setEditorChunkFocus(this.orbit.target.x, this.orbit.target.z));
    const authoringGrid = new THREE.GridHelper(4096, 64, 0xf1d38b, 0x766d60); authoringGrid.position.y = -0.02; authoringGrid.userData.editorIgnore = true; scene.add(authoringGrid);
    this.transform = new TransformControls(camera, canvas); this.transform.setSpace("world"); this.transform.showY = false; this.transform.setTranslationSnap(SNAP); this.transform.setRotationSnap(ROTATION_SNAP); this.transform.setSize(0.82); scene.add(this.transform.getHelper());
    this.transform.addEventListener("dragging-changed", (event) => { this.orbit.enabled = event.value !== true; if (event.value === true) this.history.begin(this.snapshot()); else if (this.history.commit(this.snapshot())) this.save("Saved automatically."); }); this.transform.addEventListener("objectChange", this.commitTransform);
    document.body.classList.add("editor-mode"); this.buildPanel(); this.refreshAreaOptions(); this.refreshAssetOptions(); this.selectInstance(this.area.instances[0]?.id); this.history.reset(this.snapshot()); window.addEventListener("keydown", this.handleKeyDown, { passive: false }); canvas.addEventListener("pointermove", this.movePreview); canvas.addEventListener("pointerup", this.handleCanvasClick);
  }
  private get area(): WorldArea { return getWorldArea(this.world, this.areaId); }
  private buildPanel(): void {
    this.panel.className = "plaza-editor"; this.panel.setAttribute("aria-label", "World editor");
    const heading = document.createElement("div"); heading.className = "plaza-editor__heading"; heading.innerHTML = "<p>World builder</p><h1>World Editor</h1>"; const play = document.createElement("a"); play.href = window.location.pathname; play.textContent = "Play mode"; play.className = "plaza-editor__play-link"; heading.append(play);
    const areaLabel = this.label("Area", this.areaSelect); this.areaSelect.addEventListener("change", () => { this.areaId = this.areaSelect.value; this.view.applyArea(this.area); this.selectInstance(this.area.instances[0]?.id); });
    const areaActions = document.createElement("div"); areaActions.className = "plaza-editor__actions";
    areaActions.append(this.button("New area", () => this.createArea()), this.button("Rename", () => this.renameArea()), this.button("Delete", () => this.deleteArea()));
    const assetLabel = this.label("Add asset", this.assetSelect);
    const historyActions = document.createElement("div"); historyActions.className = "plaza-editor__actions"; this.undoButton = this.button("Undo", () => this.undo()); this.redoButton = this.button("Redo", () => this.redo()); this.undoButton.title = "Undo (⌘/Ctrl+Z)"; this.redoButton.title = "Redo (⌘/Ctrl+Shift+Z)"; historyActions.append(this.undoButton, this.redoButton);
    const placement = document.createElement("div"); placement.className = "plaza-editor__actions"; placement.append(this.button("Place in world", () => this.startPlacing()), this.button("Stop placing", () => this.stopPlacing()), this.button("Toggle playable chunk", () => this.togglePlayableChunk()), this.button("Duplicate selected", () => this.duplicate()), this.button("Delete selected", () => this.removeSelected()));
    const instanceLabel = this.label("Selected instance", this.instanceSelect); this.instanceSelect.addEventListener("change", () => this.selectInstance(this.instanceSelect.value));
    const modes = document.createElement("div"); modes.className = "plaza-editor__modes"; modes.append(this.button("Move", () => this.setTransformMode("translate")), this.button("Rotate", () => this.setTransformMode("rotate")));
    const fields = document.createElement("div"); fields.className = "plaza-editor__fields"; fields.append(this.number("X", this.xInput, SNAP), this.number("Z", this.zInput, SNAP), this.number("Rotation", this.rotationInput, 5, "°")); [this.xInput, this.zInput, this.rotationInput].forEach((input) => input.addEventListener("change", this.commitFields));
    const io = document.createElement("div"); io.className = "plaza-editor__actions"; const importInput = document.createElement("input"); importInput.type = "file"; importInput.accept = ".json,application/json"; importInput.hidden = true; importInput.addEventListener("change", () => this.importFile(importInput)); io.append(this.button("Export world", () => download(serializeWorldLayout(this.world))), this.button("Import world", () => importInput.click()), importInput, this.button("Reset defaults", () => this.resetDefaults()), this.button("Reset view", () => this.orbit.reset()));
    this.status.className = "plaza-editor__status"; this.status.setAttribute("aria-live", "polite"); this.warnings.className = "plaza-editor__warnings"; this.warnings.setAttribute("aria-live", "polite"); const help = document.createElement("p"); help.className = "plaza-editor__help"; help.textContent = "Middle-drag rotates the world; left-click selects. Choose an asset, place its preview with a click, then select an instance to move or rotate it. Arrow keys move the selected asset by 0.25 m. Position snaps to 0.25 m; rotation snaps to 5°. Changes save automatically.";
    this.panel.append(heading, areaLabel, areaActions, assetLabel, historyActions, placement, instanceLabel, modes, fields, io, this.status, this.warnings, help); document.querySelector("#game-shell")?.append(this.panel); this.updateHistoryButtons();
  }
  private label(text: string, control: HTMLElement): HTMLLabelElement { const label = document.createElement("label"); label.textContent = text; label.append(control); return label; }
  private number(text: string, input: HTMLInputElement, step: number, suffix = "m"): HTMLLabelElement { input.type = "number"; input.step = String(step); const label = this.label(text, input); const unit = document.createElement("span"); unit.className = "plaza-editor__suffix"; unit.textContent = suffix; label.append(unit); return label; }
  private button(text: string, handler: () => void): HTMLButtonElement { const button = document.createElement("button"); button.type = "button"; button.textContent = text; button.addEventListener("click", handler); return button; }
  private refreshAreaOptions(): void { this.areaSelect.replaceChildren(...this.world.areas.map((area) => { const option = document.createElement("option"); option.value = area.id; option.textContent = area.label; return option; })); this.areaSelect.value = this.areaId; }
  private refreshAssetOptions(): void { const categories = new Map<string, HTMLOptGroupElement>(); for (const asset of WORLD_ASSETS) { let group = categories.get(asset.category); if (!group) { group = document.createElement("optgroup"); group.label = asset.category; categories.set(asset.category, group); this.assetSelect.append(group); } const option = document.createElement("option"); option.value = asset.assetId; option.textContent = asset.label; group.append(option); } }
  private refreshInstanceOptions(): void { this.instanceSelect.replaceChildren(...this.area.instances.map((item) => { const option = document.createElement("option"); option.value = item.id; option.textContent = item.label; return option; })); if (this.selectedId) this.instanceSelect.value = this.selectedId; }
  private selectInstance(id: string | undefined): void { this.selectedId = id; this.refreshInstanceOptions(); const item = this.area.instances.find((candidate) => candidate.id === id); const group = id ? this.view.instances.get(id) : undefined; if (!item || !group) { this.transform.detach(); this.outline.visible = false; return; } this.transform.attach(group); this.outline.visible = true; this.outline.setFromObject(group); this.xInput.value = item.transform.x.toFixed(2); this.zInput.value = item.transform.z.toFixed(2); this.rotationInput.value = THREE.MathUtils.radToDeg(item.transform.rotationY).toFixed(1); const overlaps = findWorldInstanceOverlaps(this.area, item.id); this.warnings.textContent = overlaps.length ? `Possible overlap with ${overlaps.map((other) => this.area.instances.find((item) => item.id === other)?.label).join(", ")}.` : "No instance overlaps detected."; this.warnings.classList.toggle("has-warning", overlaps.length > 0); }
  private pivotOffset(group: THREE.Object3D): Readonly<{ x: number; z: number }> { const offset = group.userData.worldPivotOffset as { x?: unknown; z?: unknown } | undefined; return typeof offset?.x === "number" && Number.isFinite(offset.x) && typeof offset.z === "number" && Number.isFinite(offset.z) ? { x: offset.x, z: offset.z } : { x: 0, z: 0 }; }
  private snapshot(): WorldEditorSnapshot { return { layout: this.world, areaId: this.areaId, selectedId: this.selectedId }; }
  private updateHistoryButtons(): void { if (this.undoButton) this.undoButton.disabled = !this.history.canUndo; if (this.redoButton) this.redoButton.disabled = !this.history.canRedo; }
  private setTransformMode(mode: "translate" | "rotate"): void {
    this.transform.setMode(mode);
    const rotate = mode === "rotate";
    // Authoring transforms are flat: movement uses X/Z, while rotation is
    // intentionally around the vertical Y axis and is the only rotation
    // component persisted by WorldInstance.
    this.transform.showX = !rotate;
    this.transform.showY = rotate;
    this.transform.showZ = !rotate;
  }
  private mutate(message: string, change: () => void): void {
    this.history.begin(this.snapshot());
    try { change(); } catch (error) { this.history.cancel(); throw error; }
    if (this.history.commit(this.snapshot())) this.save(message);
    this.updateHistoryButtons();
  }
  private restore(snapshot: WorldEditorSnapshot): void {
    this.world = snapshot.layout;
    this.areaId = snapshot.areaId;
    this.view.applyArea(this.area);
    this.refreshAreaOptions();
    this.areaSelect.value = this.areaId;
    this.selectInstance(snapshot.selectedId);
    this.updateHistoryButtons();
  }
  private undo(): void { const snapshot = this.history.undo(this.snapshot()); if (!snapshot) return this.setStatus("Nothing to undo."); this.restore(snapshot); this.save("Undid last change."); }
  private redo(): void { const snapshot = this.history.redo(this.snapshot()); if (!snapshot) return this.setStatus("Nothing to redo."); this.restore(snapshot); this.save("Redid last change."); }
  private createArea(): void { const label = window.prompt("Area name"); if (!label) return; const id = `${cleanId(label)}-${Date.now().toString(36)}`; this.mutate("Area created.", () => { addWorldArea(this.world, id, label); this.areaId = id; this.view.applyArea(this.area); this.refreshAreaOptions(); this.areaSelect.value = id; this.selectInstance(undefined); }); }
  private renameArea(): void { const label = window.prompt("Area name", this.area.label); if (!label) return; this.mutate("Area renamed.", () => { this.area.label = label.trim(); this.refreshAreaOptions(); }); }
  private deleteArea(): void {
    try { this.mutate("Area deleted.", () => { deleteWorldArea(this.world, this.areaId); this.areaId = CENTRAL_PLAZA_AREA_ID; this.view.applyArea(this.area); this.refreshAreaOptions(); this.selectInstance(this.area.instances[0]?.id); }); }
    catch (error) { this.setStatus(error instanceof Error ? error.message : "Area could not be deleted.", true); }
  }
  private startPlacing(): void { this.placing = true; this.preview.visible = true; this.preview.clear(); const asset = getWorldAsset(this.assetSelect.value); if (!asset) return; const source = this.view.addInstance({ id: "editor-preview", assetId: asset.assetId, label: asset.label, transform: { x: 0, y: 0, z: 0, rotationY: 0 } }, false); this.view.remove(source); this.view.instances.delete("editor-preview"); this.preview.add(...source.children); source.clear(); const pivot = asset.pivotOffset ?? { x: 0, z: 0 }; this.preview.position.set(pivot.x, asset.surfaceHeight === undefined ? (getWorldGroundHeight(this.area, pivot.x, pivot.z) ?? 0) : 0, pivot.z); this.preview.traverse((object) => { object.userData.editorIgnore = true; const mesh = object as THREE.Mesh; if (mesh.material instanceof THREE.Material) { mesh.material = mesh.material.clone(); mesh.material.transparent = true; mesh.material.opacity = 0.45; } }); this.setStatus(`Click the ground to place ${asset.label}.`); }
  private point(event: PointerEvent): THREE.Vector3 | undefined { const rect = this.canvas.getBoundingClientRect(); this.pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1); this.raycaster.setFromCamera(this.pointer, this.camera); const hit = new THREE.Vector3(); return this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit) ?? undefined; }
  private readonly movePreview = (event: PointerEvent): void => { if (!this.placing) return; const hit = this.point(event); const asset = getWorldAsset(this.assetSelect.value); if (!hit || !asset) return; const x = Math.round(hit.x / SNAP) * SNAP; const z = Math.round(hit.z / SNAP) * SNAP; const pivot = asset.pivotOffset ?? { x: 0, z: 0 }; this.preview.position.set(x + pivot.x, asset.surfaceHeight === undefined ? (getWorldGroundHeight(this.area, x + pivot.x, z + pivot.z) ?? 0) : 0, z + pivot.z); };
  private readonly handleCanvasClick = (event: PointerEvent): void => { if (event.button !== 0) return; const hit = this.point(event); if (this.placing && hit) { const asset = getWorldAsset(this.assetSelect.value); if (!asset) return; const x = Math.round(hit.x / SNAP) * SNAP; const z = Math.round(hit.z / SNAP) * SNAP; const id = `${asset.assetId.replace("plaza.", "")}-${Date.now().toString(36)}`; this.mutate("Asset placed. Click again to place another, or stop placing.", () => { const created = createInstance(this.area, asset.assetId, id, x, z); created.transform.y = asset.surfaceHeight === undefined ? (getWorldGroundHeight(this.area, x, z) ?? 0) : 0; this.view.addInstance(created); this.selectInstance(created.id); }); return; } if (!this.placing) { const hitObject = this.raycaster.intersectObjects([...this.view.instances.values()], true).find((entry) => !entry.object.userData.editorIgnore); const id = findInstance(hitObject?.object ?? null); if (id) this.selectInstance(id); } };
  private readonly commitTransform = (): void => {
    const item = this.area.instances.find((candidate) => candidate.id === this.selectedId);
    const group = this.selectedId ? this.view.instances.get(this.selectedId) : undefined;
    if (!item || !group) return;
    const pivot = this.pivotOffset(group);
    item.transform.x = group.position.x - pivot.x;
    item.transform.z = group.position.z - pivot.z;
    item.transform.rotationY = group.rotation.y;
    clampWorldInstance(item);
    // TransformControls emits during a drag. Keep this wrapper alive instead of
    // rebuilding the area, which would detach the active gizmo and its siblings.
    group.position.set(item.transform.x + pivot.x, item.transform.y, item.transform.z + pivot.z);
    group.rotation.y = item.transform.rotationY;
    this.outline.setFromObject(group);
    this.updateSelectedFields(item);
  };
  private readonly commitFields = (): void => {
    const item = this.area.instances.find((candidate) => candidate.id === this.selectedId);
    const group = this.selectedId ? this.view.instances.get(this.selectedId) : undefined;
    if (!item || !group) return;
    const x = Number(this.xInput.value); const z = Number(this.zInput.value); const degrees = Number(this.rotationInput.value);
    if (![x, z, degrees].every(Number.isFinite)) return this.setStatus("Enter valid numeric values.", true);
    this.mutate("Saved automatically.", () => {
      item.transform.x = x; item.transform.z = z; item.transform.rotationY = THREE.MathUtils.degToRad(degrees);
      clampWorldInstance(item);
      const pivot = this.pivotOffset(group);
      group.position.set(item.transform.x + pivot.x, item.transform.y, item.transform.z + pivot.z);
      group.rotation.y = item.transform.rotationY;
      this.selectInstance(item.id);
    });
  };
  private duplicate(): void { const item = this.area.instances.find((candidate) => candidate.id === this.selectedId); if (!item) return; this.mutate("Instance duplicated.", () => { const copy = createInstance(this.area, item.assetId, `${item.assetId.replace("plaza.", "")}-${Date.now().toString(36)}`, item.transform.x + SNAP, item.transform.z + SNAP); copy.transform.rotationY = item.transform.rotationY; this.view.addInstance(copy); this.selectInstance(copy.id); }); }
  private stopPlacing(): void { this.placing = false; this.preview.visible = false; this.preview.clear(); this.setStatus("Placement stopped."); }
  private togglePlayableChunk(): void { const position = this.selectedId ? this.area.instances.find((item) => item.id === this.selectedId)?.transform : this.orbit.target; const coordinate = worldChunkCoordinates(position?.x ?? 0, position?.z ?? 0); let chunkX = coordinate.x; let chunkZ = coordinate.z; this.mutate("Playable chunk updated.", () => { const chunk = toggleWorldChunkPlayable(this.area, coordinate.x, coordinate.z); chunkX = chunk.x; chunkZ = chunk.z; }); this.setStatus(`Chunk ${chunkX}, ${chunkZ} is now ${this.area.chunks.find((chunk) => chunk.x === chunkX && chunk.z === chunkZ)?.playable ? "playable" : "editor-only"}.`); }
  private removeSelected(): void { const index = this.area.instances.findIndex((item) => item.id === this.selectedId); if (index < 0) return; const removed = this.area.instances[index]; this.mutate(`${removed.label} deleted.`, () => { this.area.instances.splice(index, 1); const group = this.view.instances.get(removed.id); if (group) this.view.remove(group); this.view.instances.delete(removed.id); this.selectInstance(this.area.instances[0]?.id); }); }
  private moveSelected(dx: number, dz: number): void {
    const item = this.area.instances.find((candidate) => candidate.id === this.selectedId);
    const group = this.selectedId ? this.view.instances.get(this.selectedId) : undefined;
    if (!item || !group) return;
    this.mutate("Asset moved.", () => {
      item.transform.x += dx * SNAP;
      item.transform.z += dz * SNAP;
      clampWorldInstance(item);
      const pivot = this.pivotOffset(group);
      group.position.set(item.transform.x + pivot.x, item.transform.y, item.transform.z + pivot.z);
      this.outline.setFromObject(group);
      this.selectInstance(item.id);
    });
  }
  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    const target = event.target instanceof HTMLElement;
    const targetIsTextEntry = target && (event.target.closest("input, textarea, [contenteditable]") !== null);
    const action = resolveEditorShortcut({ code: event.code, key: event.key, metaKey: event.metaKey, ctrlKey: event.ctrlKey, shiftKey: event.shiftKey, targetIsTextEntry }, this.placing, this.selectedId !== undefined);
    if (!action) return;
    event.preventDefault();
    if (action.type === "undo") this.undo();
    else if (action.type === "redo") this.redo();
    else if (action.type === "stop-placing") this.stopPlacing();
    else if (action.type === "delete-selected") this.removeSelected();
    else this.moveSelected(action.dx, action.dz);
  };
  private resetDefaults(): void { this.mutate("Restored the canonical world.", () => { this.world = resetWorldLayout(); this.areaId = CENTRAL_PLAZA_AREA_ID; this.view.applyArea(this.area); this.refreshAreaOptions(); this.selectInstance(this.area.instances[0]?.id); }); }
  private async importFile(input: HTMLInputElement): Promise<void> { const file = input.files?.[0]; if (!file) return; try { const raw = JSON.parse(await file.text()); this.history.begin(this.snapshot()); try { this.world = validateWorldLayout(raw); } catch { this.world = migratePlazaLayout(validatePlazaLayout(raw)); } this.areaId = CENTRAL_PLAZA_AREA_ID; this.view.applyArea(this.area); this.refreshAreaOptions(); this.selectInstance(this.area.instances[0]?.id); if (this.history.commit(this.snapshot())) this.save(`Imported ${file.name}.`); this.updateHistoryButtons(); } catch (error) { this.history.cancel(); this.setStatus(error instanceof Error ? `Import failed: ${error.message}` : "Import failed.", true); } finally { input.value = ""; } }
  private save(message: string): void { this.setStatus(saveWorldLayout(this.world) ? message : "Browser storage is unavailable."); }
  private setStatus(message: string, error = false): void { this.status.textContent = message; this.status.classList.toggle("has-error", error); }
  private updateSelectedFields(item: WorldInstance): void {
    this.xInput.value = item.transform.x.toFixed(2);
    this.zInput.value = item.transform.z.toFixed(2);
    this.rotationInput.value = THREE.MathUtils.radToDeg(item.transform.rotationY).toFixed(1);
  }
}
