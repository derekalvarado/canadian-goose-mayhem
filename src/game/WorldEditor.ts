import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { getWorldAsset } from "./worldAssets.ts";
import { CENTRAL_PLAZA_AREA_ID, addWorldArea, clampWorldInstance, createInstance, deleteWorldArea, getWorldArea, loadWorldLayout, loadPreviousWorldLayout, migratePlazaLayout, resetWorldLayout, saveWorldLayout, serializeWorldLayout, toggleWorldChunkPlayable, type WorldArea, type WorldInstance, type WorldLayout, validateWorldLayout, worldChunkCoordinates } from "./worldLayout.ts";
import { validatePlazaLayout } from "./plazaLayout.ts";
import { findWorldInstanceOverlaps, findWorldPlacementOverlaps, getWorldGroundHeight } from "./worldLevel.ts";
import { CatalogDrawer, createDragChip, type AssetCatalog, type PaletteHost } from "./editorCatalog.ts";
import { WorldView } from "./WorldView.ts";
import { resolveEditorShortcut, WorldEditorHistory, type WorldEditorSnapshot } from "./worldEditorHistory.ts";
import { CameraTrackEditor } from "./CameraTrackEditor.ts";

const SNAP = 0.25; const ROTATION_SNAP = THREE.MathUtils.degToRad(5); const PLACING_ROTATION_STEP = THREE.MathUtils.degToRad(15); const CAMERA_ORBIT_STEP = THREE.MathUtils.degToRad(8); const CAMERA_ORBIT_SPEED = THREE.MathUtils.degToRad(110); const CAMERA_ZOOM_FACTOR = 1.18; const CAMERA_ZOOM_SPEED = 1.85; const CAMERA_FLY_SPEED = 18;
const DRAG_THRESHOLD_PX = 6;
const LITTER_PICKER_ASSET_ID = "prop.litter-picker";
const LITTER_PICKER_GROUND_ROTATION_X = Math.PI / 2;
const EDITOR_HELD_CAMERA_KEYS = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "KeyI", "KeyJ", "KeyK", "KeyL", "KeyU", "KeyO", "Space", "ShiftLeft", "ShiftRight"]);
const FOLDED_PANELS_KEY = "goose-game-editor-folded-panels";
// Which panels are folded is a per-browser convenience; storage may be unavailable.
function readFoldedPanels(): string[] { try { const value: unknown = JSON.parse(localStorage.getItem(FOLDED_PANELS_KEY) ?? "[]"); return Array.isArray(value) ? value.filter((name): name is string => typeof name === "string") : []; } catch { return []; } }
function saveFoldedPanels(names: string[]): void { try { localStorage.setItem(FOLDED_PANELS_KEY, JSON.stringify(names)); } catch { /* ignore */ } }
function download(contents: string): void { const blob = new Blob([contents], { type: "application/json" }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = "goose-game-world.json"; link.click(); URL.revokeObjectURL(url); }
function findInstance(object: THREE.Object3D | null): string | undefined { for (let node = object; node; node = node.parent) { const id = node.userData.worldInstanceId as string | undefined; if (id) return id; } return undefined; }
function cleanId(value: string): string { return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "area"; }

export class WorldEditor {
  private readonly orbit: OrbitControls; private readonly transform: TransformControls; private readonly raycaster = new THREE.Raycaster(); private readonly pointer = new THREE.Vector2();
  private readonly panel = document.createElement("aside"); private readonly areaSelect = document.createElement("select"); private readonly instanceSelect = document.createElement("select");
  private readonly controlTargetSelect = document.createElement("select"); private readonly controlTargetLabel = document.createElement("label");
  private readonly xInput = document.createElement("input"); private readonly zInput = document.createElement("input"); private readonly rotationInput = document.createElement("input"); private readonly status = document.createElement("p"); private readonly warnings = document.createElement("p");
  private readonly shortcutDrawer = document.createElement("aside"); private shortcutToggle?: HTMLButtonElement; private shortcutsOpen = false;
  private readonly preview = new THREE.Group(); private readonly outline = new THREE.BoxHelper(new THREE.Object3D(), 0xf1d38b);
  private readonly history = new WorldEditorHistory(); private undoButton?: HTMLButtonElement; private redoButton?: HTMLButtonElement;
  private world: WorldLayout; private view: WorldView; private areaId = CENTRAL_PLAZA_AREA_ID; private selectedId?: string; private placing = false;
  private readonly flyKeys = new Set<string>(); private flyFrame?: number; private flyLastTime = 0;
  private readonly flyForward = new THREE.Vector3(); private readonly flyRight = new THREE.Vector3(); private readonly flyDirection = new THREE.Vector3();
  // Placement ghost for assets dragged or picked up from the catalog.
  private placingAssetId?: string; private placingRotation = 0; private lastPointer = { x: 0, y: 0 };
  private readonly footprint = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0x8fdc97, transparent: true, opacity: 0.38, depthWrite: false }));
  private drag?: { assetId: string; startX: number; startY: number; moved: boolean; chip: HTMLElement };
  private readonly catalog: AssetCatalog;
  private readonly foldable = new Map<HTMLElement, HTMLButtonElement>();
  private readonly trackEditor: CameraTrackEditor; private readonly objectTools = document.createElement("div"); private trackToggle?: HTMLButtonElement;

  constructor(scene: THREE.Scene, private readonly camera: THREE.PerspectiveCamera, private readonly canvas: HTMLCanvasElement, world = loadWorldLayout(), view?: WorldView, initialAreaId = CENTRAL_PLAZA_AREA_ID, goose?: THREE.Object3D) {
    this.world = world; this.areaId = world.areas.some((area) => area.id === initialAreaId) ? initialAreaId : CENTRAL_PLAZA_AREA_ID;
    this.view = view ?? new WorldView(this.area); if (!view) scene.add(this.view); scene.add(this.preview, this.outline, this.footprint); this.footprint.rotation.x = -Math.PI / 2; this.footprint.visible = false; this.footprint.renderOrder = 19; this.footprint.userData.editorIgnore = true;
    this.preview.visible = false; this.preview.userData.editorIgnore = true; this.outline.userData.editorIgnore = true; this.outline.renderOrder = 20;
    this.orbit = new OrbitControls(camera, canvas); this.orbit.mouseButtons.LEFT = null; this.orbit.mouseButtons.MIDDLE = THREE.MOUSE.ROTATE; this.orbit.target.set(0, 0, 0); this.orbit.update(); this.orbit.saveState(); this.view.setEditorChunkFocus(0, 0); this.orbit.addEventListener("change", () => this.view.setEditorChunkFocus(this.orbit.target.x, this.orbit.target.z));
    const authoringGrid = new THREE.GridHelper(4096, 64, 0xf1d38b, 0x766d60); authoringGrid.position.y = -0.02; authoringGrid.userData.editorIgnore = true; scene.add(authoringGrid);
    this.transform = new TransformControls(camera, canvas); this.transform.setSpace("world"); this.transform.showY = false; this.transform.setTranslationSnap(SNAP); this.transform.setRotationSnap(ROTATION_SNAP); this.transform.setSize(0.82); scene.add(this.transform.getHelper());
    this.transform.addEventListener("dragging-changed", (event) => { this.orbit.enabled = event.value !== true; if (event.value === true) this.history.begin(this.snapshot()); else if (this.history.commit(this.snapshot())) this.save("Saved automatically."); this.updateHistoryButtons(); }); this.transform.addEventListener("objectChange", this.commitTransform);
    const editor = this; this.trackEditor = new CameraTrackEditor(scene, camera, this.transform, this.orbit, { get area() { return editor.area; }, mutate: (message, change) => this.mutate(message, change), setStatus: (message, error) => this.setStatus(message, error) }, goose);
    document.body.classList.add("editor-mode"); this.buildPanel(); this.refreshAreaOptions(); this.selectInstance(this.area.instances[0]?.id); this.history.reset(this.snapshot()); window.addEventListener("keydown", this.handleKeyDown, { passive: false }); window.addEventListener("keyup", this.handleKeyUp, { passive: false }); window.addEventListener("blur", this.clearFlyKeys); canvas.addEventListener("pointermove", this.movePreview); canvas.addEventListener("pointerup", this.handleCanvasClick); window.addEventListener("pointermove", this.trackPointer);
    this.catalog = new CatalogDrawer(this.paletteHost); document.querySelector("#game-shell")?.append(this.catalog.root);
    this.addFoldButton(this.catalog.root, "Catalog", "left"); this.addFoldButton(this.panel, "Editor", "right"); const folded = readFoldedPanels(); this.foldable.forEach((button, panel) => { if (folded.includes(button.dataset.name ?? "")) this.setPanelFolded(panel, true); });
  }
  private get area(): WorldArea { return getWorldArea(this.world, this.areaId); }
  private buildPanel(): void {
    this.panel.className = "plaza-editor"; this.panel.setAttribute("aria-label", "World editor");
    const heading = document.createElement("div"); heading.className = "plaza-editor__heading"; heading.innerHTML = "<p>World builder</p><h1>World Editor</h1>"; const play = document.createElement("a"); play.href = window.location.pathname; play.textContent = "Play mode"; play.className = "plaza-editor__play-link"; heading.append(play);
    const areaLabel = this.label("Area", this.areaSelect); this.areaSelect.addEventListener("change", () => { this.areaId = this.areaSelect.value; this.view.applyArea(this.area); this.selectInstance(this.area.instances[0]?.id); });
    const areaActions = document.createElement("div"); areaActions.className = "plaza-editor__actions";
    areaActions.append(this.button("New area", () => this.createArea()), this.button("Rename", () => this.renameArea()), this.button("Delete", () => this.deleteArea()));
    const historyActions = document.createElement("div"); historyActions.className = "plaza-editor__actions"; this.undoButton = this.button("Undo", () => this.undo()); this.redoButton = this.button("Redo", () => this.redo()); this.undoButton.title = "Undo (⌘/Ctrl+Z)"; this.redoButton.title = "Redo (⌘/Ctrl+Shift+Z)"; historyActions.append(this.undoButton, this.redoButton);
    const placement = document.createElement("div"); placement.className = "plaza-editor__actions"; placement.append(this.button("Stop placing", () => this.stopPlacing()), this.button("Toggle playable chunk", () => this.togglePlayableChunk()), this.button("Duplicate selected", () => this.duplicate()), this.button("Delete selected", () => this.removeSelected()));
    const instanceLabel = this.label("Selected instance", this.instanceSelect); this.instanceSelect.addEventListener("change", () => this.selectInstance(this.instanceSelect.value));
    this.controlTargetLabel.textContent = "Controls target"; this.controlTargetLabel.append(this.controlTargetSelect); this.controlTargetLabel.hidden = true; this.controlTargetSelect.addEventListener("change", this.commitControlTarget);
    const modes = document.createElement("div"); modes.className = "plaza-editor__modes"; modes.append(this.button("Move", () => this.setTransformMode("translate")), this.button("Rotate", () => this.setTransformMode("rotate")));
    const fields = document.createElement("div"); fields.className = "plaza-editor__fields"; fields.append(this.number("X", this.xInput, SNAP), this.number("Z", this.zInput, SNAP), this.number("Rotation", this.rotationInput, 5, "°")); [this.xInput, this.zInput, this.rotationInput].forEach((input) => input.addEventListener("change", this.commitFields));
    const io = document.createElement("div"); io.className = "plaza-editor__actions"; const importInput = document.createElement("input"); importInput.type = "file"; importInput.accept = ".json,application/json"; importInput.hidden = true; importInput.addEventListener("change", () => this.importFile(importInput)); io.append(this.button("Export world", () => download(serializeWorldLayout(this.world))), this.button("Import world", () => importInput.click()), importInput, this.button("Reset defaults", () => this.resetDefaults()), this.button("Reset view", () => this.orbit.reset()));
    if (loadPreviousWorldLayout()) io.append(this.button("Restore previous square", () => {
      const previous = loadPreviousWorldLayout();
      if (!previous) return;
      this.mutate("Restored the previous square. Undo returns to the new square.", () => {
        this.world = previous; this.areaId = CENTRAL_PLAZA_AREA_ID;
        this.view.applyArea(this.area); this.refreshAreaOptions(); this.selectInstance(this.area.instances[0]?.id);
      });
    }));
    this.shortcutToggle = this.button("Shortcuts (?)", () => this.toggleShortcuts()); this.shortcutToggle.className = "plaza-editor__shortcut-button"; this.shortcutToggle.setAttribute("aria-expanded", "false"); heading.append(this.shortcutToggle);
    this.status.className = "plaza-editor__status"; this.status.setAttribute("aria-live", "polite"); this.warnings.className = "plaza-editor__warnings"; this.warnings.setAttribute("aria-live", "polite"); const help = document.createElement("p"); help.className = "plaza-editor__help"; help.textContent = "Middle-drag rotates the world; left-click selects. Drag an item from the catalog into the world, or click it and then click the ground. Shift while dropping keeps placing, R rotates the ghost, Esc cancels. Press ? or F1 for keyboard controls.";
    this.trackToggle = this.button("Edit camera tracks", () => this.setTrackMode(!this.trackEditor.active)); const trackMode = document.createElement("div"); trackMode.className = "plaza-editor__actions plaza-editor__actions--single"; trackMode.append(this.trackToggle);
    this.objectTools.append(placement, instanceLabel, this.controlTargetLabel, modes, fields);
    this.buildShortcutDrawer(); this.panel.append(heading, areaLabel, areaActions, historyActions, trackMode, this.objectTools, this.trackEditor.tools, io, this.status, this.warnings, help); document.querySelector("#game-shell")?.append(this.panel, this.shortcutDrawer); this.updateHistoryButtons();
  }
  private buildShortcutDrawer(): void {
    this.shortcutDrawer.className = "editor-shortcuts";
    this.shortcutDrawer.hidden = true;
    this.shortcutDrawer.setAttribute("aria-label", "World editor keyboard shortcuts");
    this.shortcutDrawer.innerHTML = `<div class="editor-shortcuts__header"><div><p class="editor-shortcuts__eyebrow">Editor help</p><h2>Keyboard shortcuts</h2></div></div><div class="editor-shortcuts__columns"><section><h3>Camera</h3><p><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> hold to fly</p><p><kbd>Space</kbd> / <kbd>Shift</kbd> up / down</p><p><kbd>I</kbd><kbd>J</kbd><kbd>K</kbd><kbd>L</kbd> hold to orbit</p><p><kbd>O</kbd><kbd>U</kbd> hold to zoom out / in</p><p><kbd>H</kbd> focus · <kbd>Home</kbd> reset</p><p><kbd>\\</kbd> hide / show panels</p></section><section><h3>Object</h3><p><kbd>←</kbd><kbd>↑</kbd><kbd>↓</kbd><kbd>→</kbd> move selected</p><p><kbd>Shift</kbd> + arrows move farther</p><p><kbd>Q</kbd><kbd>E</kbd> rotate selected</p><p><kbd>Tab</kbd> / <kbd>Shift</kbd> + <kbd>Tab</kbd> next / previous</p></section><section><h3>Placement & editing</h3><p><kbd>Enter</kbd> place at camera focus</p><p><kbd>Shift</kbd> + <kbd>Enter</kbd> keep placing</p><p><kbd>R</kbd> rotate preview · <kbd>Esc</kbd> cancel</p><p><kbd>Delete</kbd> remove · <kbd>⌘/Ctrl</kbd> + <kbd>Z</kbd> undo</p></section></div>`;
    const close = this.button("Close", () => this.toggleShortcuts(false)); close.className = "editor-shortcuts__close"; close.setAttribute("aria-label", "Close keyboard shortcuts"); this.shortcutDrawer.querySelector(".editor-shortcuts__header")?.append(close);
  }
  private addFoldButton(panel: HTMLElement, name: string, side: "left" | "right"): void {
    const button = this.button("", () => this.setPanelFolded(panel, !panel.classList.contains("is-folded"), true)); button.className = "editor-fold"; button.dataset.side = side; button.dataset.name = name;
    button.innerHTML = `<span class="editor-fold__arrow" aria-hidden="true"></span><span class="editor-fold__label">${name}</span>`; panel.prepend(button); this.foldable.set(panel, button); this.setPanelFolded(panel, false);
  }
  private setPanelFolded(panel: HTMLElement, folded: boolean, remember = false): void {
    const button = this.foldable.get(panel); if (!button) return; const name = button.dataset.name ?? "panel";
    panel.classList.toggle("is-folded", folded); button.setAttribute("aria-expanded", String(!folded)); button.title = `${folded ? "Show" : "Hide"} ${name.toLowerCase()} (\\ hides both)`; button.setAttribute("aria-label", `${folded ? "Show" : "Hide"} ${name.toLowerCase()}`);
    if (remember) saveFoldedPanels([...this.foldable].filter(([other]) => other.classList.contains("is-folded")).map(([, otherButton]) => otherButton.dataset.name ?? ""));
  }
  /** Hides both panels for a clear view of the world; pressing again brings them back. */
  private togglePanels(): void { const fold = [...this.foldable.keys()].some((panel) => !panel.classList.contains("is-folded")); this.foldable.forEach((_, panel) => this.setPanelFolded(panel, fold, true)); }
  private toggleShortcuts(open = !this.shortcutsOpen): void { this.shortcutsOpen = open; this.shortcutDrawer.hidden = !open; this.shortcutToggle?.setAttribute("aria-expanded", String(open)); if (open) this.shortcutDrawer.querySelector<HTMLButtonElement>("button")?.focus(); }
  private label(text: string, control: HTMLElement): HTMLLabelElement { const label = document.createElement("label"); label.textContent = text; label.append(control); return label; }
  private number(text: string, input: HTMLInputElement, step: number, suffix = "m"): HTMLLabelElement { input.type = "number"; input.step = String(step); const label = this.label(text, input); const unit = document.createElement("span"); unit.className = "plaza-editor__suffix"; unit.textContent = suffix; label.append(unit); return label; }
  private button(text: string, handler: () => void): HTMLButtonElement { const button = document.createElement("button"); button.type = "button"; button.textContent = text; button.addEventListener("click", handler); return button; }
  private refreshAreaOptions(): void { this.areaSelect.replaceChildren(...this.world.areas.map((area) => { const option = document.createElement("option"); option.value = area.id; option.textContent = area.label; return option; })); this.areaSelect.value = this.areaId; }
  private refreshInstanceOptions(): void { this.instanceSelect.replaceChildren(...this.area.instances.map((item) => { const option = document.createElement("option"); option.value = item.id; option.textContent = item.label; return option; })); if (this.selectedId) this.instanceSelect.value = this.selectedId; }
  private selectInstance(id: string | undefined): void { this.selectedId = id; this.refreshInstanceOptions(); if (this.trackEditor.active) { this.outline.visible = false; this.trackEditor.refresh(); return; } const item = this.area.instances.find((candidate) => candidate.id === id); const group = id ? this.view.instances.get(id) : undefined; if (!item || !group) { this.transform.detach(); this.outline.visible = false; this.controlTargetLabel.hidden = true; return; } this.transform.attach(group); this.outline.visible = true; this.outline.setFromObject(group); this.xInput.value = item.transform.x.toFixed(2); this.zInput.value = item.transform.z.toFixed(2); this.rotationInput.value = THREE.MathUtils.radToDeg(item.transform.rotationY).toFixed(1); this.refreshControlTarget(item); const overlaps = findWorldInstanceOverlaps(this.area, item.id); const missingTarget = Boolean(getWorldAsset(item.assetId)?.controller) && !this.area.controlLinks.some((link) => link.controllerId === item.id); this.warnings.textContent = missingTarget ? "This controller needs a compatible target." : overlaps.length ? `Possible overlap with ${overlaps.map((other) => this.area.instances.find((candidate) => candidate.id === other)?.label).join(", ")}.` : "No instance overlaps detected."; this.warnings.classList.toggle("has-warning", missingTarget || overlaps.length > 0); }
  private refreshControlTarget(item: WorldInstance): void {
    const isController = Boolean(getWorldAsset(item.assetId)?.controller); this.controlTargetLabel.hidden = !isController;
    if (!isController) return;
    const blank = document.createElement("option"); blank.value = ""; blank.textContent = "Choose a target…";
    const targets = this.area.instances.filter((candidate) => getWorldAsset(candidate.assetId)?.activeTarget).map((candidate) => { const option = document.createElement("option"); option.value = candidate.id; option.textContent = candidate.label; return option; });
    this.controlTargetSelect.replaceChildren(blank, ...targets);
    this.controlTargetSelect.value = this.area.controlLinks.find((link) => link.controllerId === item.id)?.targetId ?? "";
  }
  private readonly commitControlTarget = (): void => {
    const controllerId = this.selectedId; if (!controllerId) return;
    this.mutate("Controller target saved.", () => {
      this.area.controlLinks = this.area.controlLinks.filter((link) => link.controllerId !== controllerId);
      if (this.controlTargetSelect.value) this.area.controlLinks.push({ controllerId, targetId: this.controlTargetSelect.value });
      this.selectInstance(controllerId);
    });
  };
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
  private setTrackMode(active: boolean): void {
    if (active && this.placing) this.stopPlacing();
    this.trackEditor.setActive(active); this.objectTools.hidden = active; this.warnings.hidden = active;
    if (this.trackToggle) { this.trackToggle.textContent = active ? "Back to objects" : "Edit camera tracks"; this.trackToggle.classList.toggle("is-active", active); }
    if (active) { this.outline.visible = false; this.setStatus("Editing this area's camera tracks."); }
    else { this.setTransformMode("translate"); this.selectInstance(this.selectedId); this.setStatus(""); }
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
  private startPlacing(assetId: string): void {
    const asset = getWorldAsset(assetId); if (!asset) return;
    if (this.trackEditor.active) this.setTrackMode(false);
    this.placing = true; this.placingAssetId = asset.assetId; this.preview.visible = true; this.preview.clear();
    const source = this.view.addInstance({ id: "editor-preview", assetId: asset.assetId, label: asset.label, transform: { x: 0, y: 0, z: 0, rotationY: 0 } }, false); this.view.remove(source); this.view.instances.delete("editor-preview"); this.preview.add(...source.children); source.clear();
    this.preview.rotation.set(asset.assetId === LITTER_PICKER_ASSET_ID ? LITTER_PICKER_GROUND_ROTATION_X : 0, this.placingRotation, 0);
    const pivot = asset.pivotOffset ?? { x: 0, z: 0 }; this.preview.position.set(pivot.x, asset.surfaceHeight === undefined ? (getWorldGroundHeight(this.area, pivot.x, pivot.z) ?? 0) : 0, pivot.z);
    this.preview.traverse((object) => { object.userData.editorIgnore = true; const mesh = object as THREE.Mesh; if (mesh.material instanceof THREE.Material) { mesh.material = mesh.material.clone(); mesh.material.transparent = true; mesh.material.opacity = 0.6; } });
    this.footprint.scale.set(asset.halfWidth * 2, asset.halfDepth * 2, 1); this.footprint.rotation.z = this.placingRotation; this.footprint.visible = this.preview.visible;
    this.setStatus(`Carrying ${asset.label}: click the ground to place (Shift keeps placing), R rotates, Esc cancels.`);
  }
  private point(event: Pick<PointerEvent, "clientX" | "clientY">): THREE.Vector3 | undefined { const rect = this.canvas.getBoundingClientRect(); this.pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1); this.raycaster.setFromCamera(this.pointer, this.camera); const hit = new THREE.Vector3(); return this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit) ?? undefined; }
  private readonly movePreview = (event: PointerEvent): void => { if (this.placing && !this.drag) this.updatePreviewAt(event); };
  private readonly trackPointer = (event: PointerEvent): void => { this.lastPointer = { x: event.clientX, y: event.clientY }; };
  private updatePreviewAt(event: Pick<PointerEvent, "clientX" | "clientY">): void {
    const hit = this.point(event); if (hit) this.updatePreviewAtPoint(hit);
  }
  private updatePreviewAtPoint(hit: THREE.Vector3): void {
    const asset = this.placingAssetId ? getWorldAsset(this.placingAssetId) : undefined; if (!asset) return;
    const x = Math.round(hit.x / SNAP) * SNAP; const z = Math.round(hit.z / SNAP) * SNAP; const pivot = asset.pivotOffset ?? { x: 0, z: 0 };
    const y = asset.surfaceHeight === undefined ? (getWorldGroundHeight(this.area, x + pivot.x, z + pivot.z) ?? 0) : 0;
    this.preview.position.set(x + pivot.x, y, z + pivot.z); this.preview.visible = true;
    const blocked = findWorldPlacementOverlaps(this.area, asset.assetId, x, z).length > 0;
    this.footprint.position.set(x, y + 0.04, z); this.footprint.visible = true; (this.footprint.material as THREE.MeshBasicMaterial).color.setHex(blocked ? 0xf0826a : 0x8fdc97);
  }
  private placeAt(event: Pick<PointerEvent, "clientX" | "clientY">): void {
    const hit = this.point(event); if (hit) this.placeAtPoint(hit);
  }
  private placeAtPoint(hit: THREE.Vector3): void {
    const asset = this.placingAssetId ? getWorldAsset(this.placingAssetId) : undefined; if (!asset) return;
    const x = Math.round(hit.x / SNAP) * SNAP; const z = Math.round(hit.z / SNAP) * SNAP; const id = `${asset.assetId.replace("plaza.", "")}-${Date.now().toString(36)}`;
    this.mutate(`${asset.label} placed.`, () => { const created = createInstance(this.area, asset.assetId, id, x, z); created.transform.y = asset.surfaceHeight === undefined ? (getWorldGroundHeight(this.area, x, z) ?? 0) : 0; created.transform.rotationY = this.placingRotation; this.view.addInstance(created); this.selectInstance(created.id); });
    this.catalog.notePlaced(asset.assetId);
  }
  private placeAtCameraFocus(keepPlacing: boolean): void {
    if (!this.placing) return;
    const focus = this.orbit.target.clone(); this.updatePreviewAtPoint(focus); this.placeAtPoint(focus); if (!keepPlacing) this.stopPlacing(this.status.textContent ?? "");
  }
  private readonly paletteHost: PaletteHost = {
    beginDrag: (assetId, event) => {
      this.cancelDrag(); this.startPlacing(assetId); this.preview.visible = false; this.footprint.visible = false;
      const chip = createDragChip(assetId); chip.hidden = true; document.body.append(chip);
      this.drag = { assetId, startX: event.clientX, startY: event.clientY, moved: false, chip };
      document.body.classList.add("is-dragging-asset");
      window.addEventListener("pointermove", this.handleDragMove); window.addEventListener("pointerup", this.handleDragEnd); window.addEventListener("pointercancel", this.cancelDrag);
    },
    pickUp: (assetId) => { this.cancelDrag(); this.startPlacing(assetId); if (document.elementFromPoint(this.lastPointer.x, this.lastPointer.y) === this.canvas) this.updatePreviewAt({ clientX: this.lastPointer.x, clientY: this.lastPointer.y }); else { this.preview.visible = false; this.footprint.visible = false; } },
  };
  private readonly handleDragMove = (event: PointerEvent): void => {
    const drag = this.drag; if (!drag) return;
    if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > DRAG_THRESHOLD_PX) drag.moved = true;
    const overCanvas = document.elementFromPoint(event.clientX, event.clientY) === this.canvas;
    drag.chip.hidden = overCanvas || !drag.moved; drag.chip.style.transform = `translate(${event.clientX}px, ${event.clientY}px)`;
    if (overCanvas) this.updatePreviewAt(event); else { this.preview.visible = false; this.footprint.visible = false; }
  };
  private readonly handleDragEnd = (event: PointerEvent): void => {
    const drag = this.drag; if (!drag) return; this.endDragListeners();
    const target = document.elementFromPoint(event.clientX, event.clientY);
    if (target === this.canvas) { this.placeAt(event); if (!event.shiftKey) this.stopPlacing(this.status.textContent ?? ""); }
    else if (!drag.moved) { if (!this.preview.visible) this.setStatus(`Carrying ${getWorldAsset(drag.assetId)?.label}: click the ground to place (Shift keeps placing), R rotates, Esc cancels.`); }
    else this.stopPlacing("Drop cancelled.");
  };
  private endDragListeners(): void {
    this.drag?.chip.remove(); this.drag = undefined; document.body.classList.remove("is-dragging-asset");
    window.removeEventListener("pointermove", this.handleDragMove); window.removeEventListener("pointerup", this.handleDragEnd); window.removeEventListener("pointercancel", this.cancelDrag);
  }
  private readonly cancelDrag = (): void => { if (!this.drag) return; this.endDragListeners(); this.stopPlacing("Drop cancelled."); };

  private readonly handleCanvasClick = (event: PointerEvent): void => { if (event.button !== 0 || this.drag) return; const hit = this.point(event); if (this.trackEditor.active && !this.placing) { this.trackEditor.handleClick(this.raycaster, hit); return; } if (this.placing && hit) { this.placeAt(event); if (!event.shiftKey) this.stopPlacing(this.status.textContent ?? ""); return; } if (!this.placing) { const hitObject = this.raycaster.intersectObjects([...this.view.instances.values()], true).find((entry) => !entry.object.userData.editorIgnore); const id = findInstance(hitObject?.object ?? null); if (id) this.selectInstance(id); } };
  private readonly commitTransform = (): void => {
    if (this.trackEditor.active) { this.trackEditor.onTransformChange(); return; }
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
  private duplicate(): void { const item = this.area.instances.find((candidate) => candidate.id === this.selectedId); if (!item) return; this.mutate("Instance duplicated.", () => { const copy = createInstance(this.area, item.assetId, `${item.assetId.replace("plaza.", "")}-${Date.now().toString(36)}`, item.transform.x + SNAP, item.transform.z + SNAP); copy.transform.rotationY = item.transform.rotationY; const link = this.area.controlLinks.find((candidate) => candidate.controllerId === item.id); if (link) this.area.controlLinks.push({ controllerId: copy.id, targetId: link.targetId }); this.view.addInstance(copy); this.selectInstance(copy.id); }); }
  private stopPlacing(message = "Placement stopped."): void { this.placing = false; this.placingAssetId = undefined; this.preview.visible = false; this.footprint.visible = false; this.preview.clear(); this.setStatus(message); }
  private togglePlayableChunk(): void { const position = this.selectedId ? this.area.instances.find((item) => item.id === this.selectedId)?.transform : this.orbit.target; const coordinate = worldChunkCoordinates(position?.x ?? 0, position?.z ?? 0); let chunkX = coordinate.x; let chunkZ = coordinate.z; this.mutate("Playable chunk updated.", () => { const chunk = toggleWorldChunkPlayable(this.area, coordinate.x, coordinate.z); chunkX = chunk.x; chunkZ = chunk.z; }); this.setStatus(`Chunk ${chunkX}, ${chunkZ} is now ${this.area.chunks.find((chunk) => chunk.x === chunkX && chunk.z === chunkZ)?.playable ? "playable" : "editor-only"}.`); }
  private removeSelected(): void { const index = this.area.instances.findIndex((item) => item.id === this.selectedId); if (index < 0) return; const removed = this.area.instances[index]; this.mutate(`${removed.label} deleted.`, () => { this.area.instances.splice(index, 1); this.area.controlLinks = this.area.controlLinks.filter((link) => link.controllerId !== removed.id && link.targetId !== removed.id); const group = this.view.instances.get(removed.id); if (group) this.view.remove(group); this.view.instances.delete(removed.id); this.selectInstance(this.area.instances[0]?.id); }); }
  private moveSelectedByStep(dx: number, dz: number, step = 1): void {
    const item = this.area.instances.find((candidate) => candidate.id === this.selectedId);
    const group = this.selectedId ? this.view.instances.get(this.selectedId) : undefined;
    if (!item || !group) return;
    this.mutate("Asset moved.", () => {
      item.transform.x += dx * SNAP * step;
      item.transform.z += dz * SNAP * step;
      clampWorldInstance(item);
      const pivot = this.pivotOffset(group);
      group.position.set(item.transform.x + pivot.x, item.transform.y, item.transform.z + pivot.z);
      this.outline.setFromObject(group);
      this.selectInstance(item.id);
    });
  }
  private rotateSelected(direction: number): void {
    const item = this.area.instances.find((candidate) => candidate.id === this.selectedId);
    const group = this.selectedId ? this.view.instances.get(this.selectedId) : undefined;
    if (!item || !group) return;
    this.mutate("Asset rotated.", () => {
      item.transform.rotationY = THREE.MathUtils.euclideanModulo(item.transform.rotationY + direction * ROTATION_SNAP, Math.PI * 2);
      group.rotation.y = item.transform.rotationY;
      this.outline.setFromObject(group);
      this.updateSelectedFields(item);
    });
  }
  private cycleSelection(direction: number): void {
    if (this.area.instances.length === 0) return this.selectInstance(undefined);
    const currentIndex = this.selectedId ? this.area.instances.findIndex((item) => item.id === this.selectedId) : -1;
    const nextIndex = (currentIndex + direction + this.area.instances.length) % this.area.instances.length;
    this.selectInstance(this.area.instances[nextIndex].id);
  }
  private orbitCamera(horizontal: number, vertical: number, step = CAMERA_ORBIT_STEP): void {
    const offset = new THREE.Vector3().subVectors(this.camera.position, this.orbit.target);
    const spherical = new THREE.Spherical().setFromVector3(offset);
    spherical.theta -= horizontal * step;
    spherical.phi -= vertical * step;
    spherical.phi = THREE.MathUtils.clamp(spherical.phi, this.orbit.minPolarAngle, this.orbit.maxPolarAngle);
    spherical.makeSafe();
    this.camera.position.setFromSpherical(spherical).add(this.orbit.target);
    this.orbit.update();
  }
  private zoomCamera(direction: number, factor = CAMERA_ZOOM_FACTOR): void {
    const offset = new THREE.Vector3().subVectors(this.camera.position, this.orbit.target);
    const distance = offset.length(); if (distance === 0) return;
    const minimum = Math.max(this.orbit.minDistance, 0.5); const maximum = Number.isFinite(this.orbit.maxDistance) ? this.orbit.maxDistance : 280;
    const nextDistance = THREE.MathUtils.clamp(distance * (direction > 0 ? 1 / factor : factor), minimum, maximum);
    this.camera.position.copy(this.orbit.target).add(offset.normalize().multiplyScalar(nextDistance));
    this.orbit.update();
  }
  private focusSelected(): void {
    const group = this.selectedId ? this.view.instances.get(this.selectedId) : undefined; if (!group) return;
    this.orbit.target.set(group.position.x, group.position.y, group.position.z); this.orbit.update();
  }
  private startFlyLoop(): void {
    if (this.flyFrame !== undefined) return;
    this.flyLastTime = performance.now();
    this.flyFrame = requestAnimationFrame(this.updateFlyCamera);
  }
  private readonly updateFlyCamera = (time: number): void => {
    this.flyFrame = undefined;
    if (this.flyKeys.size === 0) return;
    const delta = Math.min(Math.max((time - this.flyLastTime) / 1000, 0), 0.05); this.flyLastTime = time;
    this.camera.getWorldDirection(this.flyForward); this.flyForward.y = 0;
    if (this.flyForward.lengthSq() > 0) this.flyForward.normalize();
    this.flyRight.crossVectors(this.flyForward, this.camera.up).normalize();
    this.flyDirection.set(
      Number(this.flyKeys.has("KeyD")) - Number(this.flyKeys.has("KeyA")),
      Number(this.flyKeys.has("Space")) - Number(this.flyKeys.has("ShiftLeft") || this.flyKeys.has("ShiftRight")),
      Number(this.flyKeys.has("KeyS")) - Number(this.flyKeys.has("KeyW")),
    );
    const vertical = this.flyDirection.y;
    this.flyDirection.y = 0;
    if (this.flyDirection.lengthSq() > 1) this.flyDirection.normalize();
    const orbitHorizontal = Number(this.flyKeys.has("KeyJ")) - Number(this.flyKeys.has("KeyL"));
    const orbitVertical = Number(this.flyKeys.has("KeyI")) - Number(this.flyKeys.has("KeyK"));
    if (orbitHorizontal !== 0 || orbitVertical !== 0) this.orbitCamera(orbitHorizontal, orbitVertical, CAMERA_ORBIT_SPEED * delta);
    const zoomDirection = Number(this.flyKeys.has("KeyU")) - Number(this.flyKeys.has("KeyO"));
    if (zoomDirection !== 0) this.zoomCamera(zoomDirection, Math.pow(CAMERA_ZOOM_SPEED, delta));
    this.camera.position.addScaledVector(this.flyRight, this.flyDirection.x * CAMERA_FLY_SPEED * delta);
    this.camera.position.addScaledVector(this.flyForward, -this.flyDirection.z * CAMERA_FLY_SPEED * delta);
    this.camera.position.y += vertical * CAMERA_FLY_SPEED * delta;
    this.orbit.target.addScaledVector(this.flyRight, this.flyDirection.x * CAMERA_FLY_SPEED * delta);
    this.orbit.target.addScaledVector(this.flyForward, -this.flyDirection.z * CAMERA_FLY_SPEED * delta);
    this.orbit.target.y += vertical * CAMERA_FLY_SPEED * delta;
    this.orbit.update();
    this.flyFrame = requestAnimationFrame(this.updateFlyCamera);
  };
  private clearFlyKeys = (): void => {
    this.flyKeys.clear();
    if (this.flyFrame !== undefined) { cancelAnimationFrame(this.flyFrame); this.flyFrame = undefined; }
  };
  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    if (EDITOR_HELD_CAMERA_KEYS.has(event.code)) this.flyKeys.delete(event.code);
  };
  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    const target = event.target instanceof HTMLElement;
    const targetIsTextEntry = target && (event.target.closest("input, textarea, select, button, [contenteditable]") !== null);
    if (this.trackEditor.looking) {
      if (event.code === "Escape") { event.preventDefault(); this.trackEditor.exitLook(); }
      if (EDITOR_HELD_CAMERA_KEYS.has(event.code)) return;
    }
    if (!targetIsTextEntry && EDITOR_HELD_CAMERA_KEYS.has(event.code)) {
      event.preventDefault(); this.flyKeys.add(event.code); this.startFlyLoop(); return;
    }
    if (this.placing && !targetIsTextEntry && event.code === "KeyR" && !event.metaKey && !event.ctrlKey) {
      event.preventDefault(); this.placingRotation = Math.round((this.placingRotation + (event.shiftKey ? -1 : 1) * PLACING_ROTATION_STEP) / PLACING_ROTATION_STEP) * PLACING_ROTATION_STEP % (Math.PI * 2);
      this.preview.rotation.y = this.placingRotation; this.footprint.rotation.z = this.placingRotation; return;
    }
    if (this.drag && event.code === "Escape") { event.preventDefault(); this.cancelDrag(); return; }
    const action = resolveEditorShortcut({ code: event.code, key: event.key, metaKey: event.metaKey, ctrlKey: event.ctrlKey, shiftKey: event.shiftKey, targetIsTextEntry }, this.placing, this.selectedId !== undefined);
    if (!action) return;
    if (this.trackEditor.active) {
      if (action.type === "delete-selected") { event.preventDefault(); this.trackEditor.deleteSelected(); return; }
      if (!["undo", "redo", "orbit-camera", "zoom-camera", "reset-view", "toggle-shortcuts", "toggle-panels"].includes(action.type)) return;
      if (this.trackEditor.looking && !["undo", "redo", "toggle-shortcuts", "toggle-panels"].includes(action.type)) return;
    }
    event.preventDefault();
    if (action.type === "undo") this.undo();
    else if (action.type === "redo") this.redo();
    else if (action.type === "stop-placing") this.stopPlacing();
    else if (action.type === "delete-selected") this.removeSelected();
    else if (action.type === "move-selected") this.moveSelectedByStep(action.dx, action.dz, action.step);
    else if (action.type === "rotate-selected") this.rotateSelected(action.direction);
    else if (action.type === "select-next") this.cycleSelection(action.direction);
    else if (action.type === "orbit-camera") this.orbitCamera(action.horizontal, action.vertical);
    else if (action.type === "zoom-camera") this.zoomCamera(action.direction);
    else if (action.type === "focus-selected") this.focusSelected();
    else if (action.type === "reset-view") this.orbit.reset();
    else if (action.type === "place-at-focus") this.placeAtCameraFocus(action.keepPlacing);
    else if (action.type === "toggle-shortcuts") this.toggleShortcuts();
    else if (action.type === "toggle-panels") this.togglePanels();
  };
  private resetDefaults(): void { this.mutate("Restored the canonical world.", () => { this.world = resetWorldLayout(); this.areaId = CENTRAL_PLAZA_AREA_ID; this.view.applyArea(this.area); this.refreshAreaOptions(); this.selectInstance(this.area.instances[0]?.id); }); }
  private async importFile(input: HTMLInputElement): Promise<void> { const file = input.files?.[0]; if (!file) return; try { const raw = JSON.parse(await file.text()); this.history.begin(this.snapshot()); try { this.world = validateWorldLayout(raw); } catch { this.world = migratePlazaLayout(validatePlazaLayout(raw)); } this.world.canonicalRevision = Math.max(this.world.canonicalRevision, 6); this.areaId = CENTRAL_PLAZA_AREA_ID; this.view.applyArea(this.area); this.refreshAreaOptions(); this.selectInstance(this.area.instances[0]?.id); if (this.history.commit(this.snapshot())) this.save(`Imported ${file.name}.`); this.updateHistoryButtons(); } catch (error) { this.history.cancel(); this.setStatus(error instanceof Error ? `Import failed: ${error.message}` : "Import failed.", true); } finally { input.value = ""; } }
  private save(message: string): void { this.setStatus(saveWorldLayout(this.world) ? message : "Browser storage is unavailable."); }
  private setStatus(message: string, error = false): void { this.status.textContent = message; this.status.classList.toggle("has-error", error); }
  private updateSelectedFields(item: WorldInstance): void {
    this.xInput.value = item.transform.x.toFixed(2);
    this.zInput.value = item.transform.z.toFixed(2);
    this.rotationInput.value = THREE.MathUtils.radToDeg(item.transform.rotationY).toFixed(1);
  }
}
