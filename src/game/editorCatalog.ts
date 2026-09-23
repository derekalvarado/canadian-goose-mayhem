import * as THREE from "three";
import { WORLD_ASSETS, getWorldAsset, type WorldAssetCategory, type WorldAssetDefinition } from "./worldAssets.ts";
import { createWorldAssetView } from "./PlazaWorld.ts";
import { OcclusionFadeGroupRegistry } from "./OcclusionFadeGroups.ts";
import { STORYBOOK_LIGHTING } from "./toonMaterial.ts";

/**
 * Drag-and-drop asset catalog for the world editor. The catalog is pure DOM;
 * the editor owns the 3D ghost, snapping, and placement.
 */

export interface PaletteHost {
  /** A pointer went down on an entry; the host follows it until release. */
  beginDrag(assetId: string, event: PointerEvent): void;
  /** Pick an asset up at the cursor without a drag gesture (click-to-carry). */
  pickUp(assetId: string): void;
}

export interface AssetCatalog {
  readonly root: HTMLElement;
  notePlaced(assetId: string): void;
  dispose(): void;
}

const CATEGORY_ORDER: readonly WorldAssetCategory[] = ["furniture", "planting", "lighting", "prop", "landmark", "architecture", "ground", "character", "gameplay"];
const CATEGORY_LABELS: Record<WorldAssetCategory, string> = {
  furniture: "Furniture", planting: "Plants", lighting: "Lighting", prop: "Props", landmark: "Landmarks",
  architecture: "Buildings", ground: "Ground", character: "People", gameplay: "Gameplay",
};
const ICON_PATHS: Record<WorldAssetCategory | "recent", string> = {
  recent: "M12 4a8 8 0 1 1-7.4 5M4 4v5h5M12 8v4l3 2",
  furniture: "M5 11h14v3H5zM6 14v5M18 14v5M7 11V6h10v5",
  planting: "M12 20v-8M12 12c-4 0-6-3-6-7 4 0 6 3 6 7zM12 14c3 0 5-2 5-5-3 0-5 2-5 5zM7 20h10",
  lighting: "M12 20V9M9 20h6M8 5h8l-1.5 4h-5z",
  prop: "M7 8h10l-1 12H8zM6 8h12M10 5h4v3h-4z",
  landmark: "M4 20h16M6 20v-7M18 20v-7M12 4 4 10h16z",
  architecture: "M4 20V9l8-5 8 5v11M9 20v-6h6v6M8 11h2M14 11h2",
  ground: "M3 15l9-5 9 5-9 5zM3 11l9-5 9 5",
  character: "M12 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 20c0-4 3-6 6-6s6 2 6 6",
  gameplay: "M12 3l2.5 5.5L20 9l-4 4 1 6-5-3-5 3 1-6-4-4 5.5-.5z",
};

function categoryIcon(key: keyof typeof ICON_PATHS): string {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="${ICON_PATHS[key]}"/></svg>`;
}

function assetsIn(category: WorldAssetCategory): WorldAssetDefinition[] { return WORLD_ASSETS.filter((asset) => asset.category === category); }
function matches(asset: WorldAssetDefinition, query: string): boolean {
  const needle = query.trim().toLowerCase();
  return !needle || asset.label.toLowerCase().includes(needle) || asset.assetId.includes(needle) || CATEGORY_LABELS[asset.category].toLowerCase().includes(needle);
}
function footprint(asset: WorldAssetDefinition): string { return `${(asset.halfWidth * 2).toFixed(1)} × ${(asset.halfDepth * 2).toFixed(1)} m`; }
function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, html = ""): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag); node.className = className; if (html) node.innerHTML = html; return node;
}

// ---------------------------------------------------------------- persistence

function readList(key: string): string[] {
  try { const raw = JSON.parse(window.localStorage.getItem(key) ?? "[]"); return Array.isArray(raw) ? raw.filter((id): id is string => typeof id === "string") : []; } catch { return []; }
}
function writeList(key: string, list: readonly (string | null)[]): void { try { window.localStorage.setItem(key, JSON.stringify(list)); } catch { /* storage is a convenience */ } }
const RECENT_KEY = "goose-editor-recent-assets";
function recentAssets(): WorldAssetDefinition[] { return readList(RECENT_KEY).map((id) => getWorldAsset(id)).filter((asset): asset is WorldAssetDefinition => Boolean(asset)); }
function rememberRecent(assetId: string): void { writeList(RECENT_KEY, [assetId, ...readList(RECENT_KEY).filter((id) => id !== assetId)].slice(0, 10)); }

// ---------------------------------------------------------------- thumbnails

/** Renders each catalog asset once into a small cel-shaded portrait. */
class AssetThumbnails {
  private renderer?: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(28, 1, 0.05, 500);
  private readonly urls = new Map<string, string>();
  private readonly pending = new Map<string, THREE.Group>();
  private readonly queue: { assetId: string; attempt: number }[] = [];
  private pumping = false;

  constructor() {
    this.scene.add(new THREE.AmbientLight(0xffffff, STORYBOOK_LIGHTING.ambient));
    const sun = new THREE.DirectionalLight(0xffffff, STORYBOOK_LIGHTING.sun * 6); sun.position.set(3, 6, 4); this.scene.add(sun);
  }

  /** Returns an <img> that fills in once the asset's portrait is ready. */
  image(assetId: string): HTMLImageElement {
    const img = document.createElement("img"); img.alt = ""; img.draggable = false; img.dataset.thumb = assetId; img.className = "asset-thumb";
    const url = this.urls.get(assetId);
    if (url) img.src = url; else this.request(assetId);
    return img;
  }

  private request(assetId: string, attempt = 0): void {
    if (!this.queue.some((entry) => entry.assetId === assetId)) this.queue.push({ assetId, attempt });
    if (!this.pumping) { this.pumping = true; requestAnimationFrame(this.pump); }
  }

  private readonly pump = (): void => {
    const started = performance.now();
    while (this.queue.length && performance.now() - started < 12) {
      const entry = this.queue.shift()!;
      const url = this.render(entry.assetId);
      if (url) { this.urls.set(entry.assetId, url); document.querySelectorAll<HTMLImageElement>(`img[data-thumb="${CSS.escape(entry.assetId)}"]`).forEach((img) => { img.src = url; }); }
      // GLB-backed views fill in asynchronously; retry a few times.
      else if (entry.attempt < 20) window.setTimeout(() => this.request(entry.assetId, entry.attempt + 1), 750);
    }
    if (this.queue.length) requestAnimationFrame(this.pump); else this.pumping = false;
  };

  private render(assetId: string): string | undefined {
    if (!this.renderer) {
      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      this.renderer.outputColorSpace = THREE.SRGBColorSpace; this.renderer.toneMapping = THREE.NoToneMapping; this.renderer.setPixelRatio(1); this.renderer.setSize(192, 192, false); this.renderer.setClearColor(0x000000, 0);
    }
    // Keep an empty view between attempts so a GLB that arrives later can fill it.
    let view = this.pending.get(assetId);
    if (!view) { try { view = createWorldAssetView(assetId, new OcclusionFadeGroupRegistry()); } catch { return undefined; } }
    if (assetId === "prop.litter-picker") view.rotation.x = Math.PI / 2;
    this.scene.add(view); view.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(view);
    if (box.isEmpty()) { this.scene.remove(view); this.pending.set(assetId, view); return undefined; }
    this.pending.delete(assetId);
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const distance = sphere.radius / Math.sin(THREE.MathUtils.degToRad(this.camera.fov / 2)) * 1.02;
    const direction = new THREE.Vector3(0.9, 0.75, 1.15).normalize();
    this.camera.position.copy(sphere.center).addScaledVector(direction, distance); this.camera.near = distance / 50; this.camera.far = distance * 4; this.camera.updateProjectionMatrix(); this.camera.lookAt(sphere.center);
    this.renderer.render(this.scene, this.camera);
    this.scene.remove(view);
    return this.renderer.domElement.toDataURL("image/png");
  }
}
const thumbnails = new AssetThumbnails();

// ---------------------------------------------------------------- shared card

function assetCard(asset: WorldAssetDefinition, host: PaletteHost, className: string, onHover?: (asset: WorldAssetDefinition | undefined) => void): HTMLButtonElement {
  const card = element("button", className); card.type = "button"; card.dataset.assetId = asset.assetId; card.title = `${asset.label}\n${footprint(asset)} · drag into the world`;
  const name = element("span", "asset-card__name"); name.textContent = asset.label;
  card.append(thumbnails.image(asset.assetId), name);
  card.addEventListener("pointerdown", (event) => { if (event.button !== 0) return; event.preventDefault(); host.beginDrag(asset.assetId, event); });
  // Keyboard activation (detail 0) picks the asset up without a pointer drag.
  card.addEventListener("click", (event) => { if (event.detail === 0) host.pickUp(asset.assetId); });
  if (onHover) { card.addEventListener("pointerenter", () => onHover(asset)); card.addEventListener("focus", () => onHover(asset)); }
  return card;
}

function searchInput(placeholder: string, onInput: (value: string) => void): HTMLInputElement {
  const input = element("input", "asset-search"); input.type = "search"; input.placeholder = placeholder; input.setAttribute("aria-label", placeholder);
  input.addEventListener("input", () => onInput(input.value));
  return input;
}

// ---------------------------------------------------------------- catalog drawer

/** Left drawer: everything visible as a grouped grid, with an inspector for the hovered item. */
export class CatalogDrawer implements AssetCatalog {
  readonly root = element("section", "asset-drawer");
  private readonly list = element("div", "asset-drawer__list");
  private readonly inspector = element("div", "asset-drawer__inspector");
  private query = "";
  private readonly closed = new Set<WorldAssetCategory>(["ground", "character", "gameplay"]);

  constructor(private readonly host: PaletteHost) {
    this.root.setAttribute("aria-label", "Asset catalog");
    const header = element("header", "asset-drawer__header", "<p>Catalog</p>");
    header.append(searchInput("Search 60+ assets", (value) => { this.query = value; this.render(); }));
    this.root.append(header, this.list, this.inspector); this.render(); this.inspect(undefined);
  }

  private section(key: string, label: string, icon: string, assets: WorldAssetDefinition[], open: boolean, onToggle?: (open: boolean) => void): HTMLElement {
    const details = element("details", "asset-drawer__section"); details.open = open;
    const summary = element("summary", "", `${icon}<span>${label}</span><em>${assets.length}</em>`); details.dataset.section = key;
    const grid = element("div", "asset-drawer__grid"); grid.append(...assets.map((asset) => assetCard(asset, this.host, "asset-card asset-card--drawer", (hovered) => this.inspect(hovered))));
    details.append(summary, grid);
    if (onToggle) details.addEventListener("toggle", () => onToggle(details.open));
    return details;
  }

  private render(): void {
    const searching = this.query.trim().length > 0; const sections: HTMLElement[] = [];
    const recent = recentAssets().slice(0, 6);
    if (!searching && recent.length) sections.push(this.section("recent", "Recently placed", categoryIcon("recent"), recent, true));
    for (const category of CATEGORY_ORDER) {
      const assets = assetsIn(category).filter((asset) => matches(asset, this.query)); if (!assets.length) continue;
      sections.push(this.section(category, CATEGORY_LABELS[category], categoryIcon(category), assets, searching || !this.closed.has(category), (open) => { if (searching) return; if (open) this.closed.delete(category); else this.closed.add(category); }));
    }
    this.list.replaceChildren(...sections);
    if (!sections.length) this.list.append(element("p", "asset-empty", "No matches."));
  }

  private inspect(asset: WorldAssetDefinition | undefined): void {
    if (!asset) { this.inspector.innerHTML = "<p class=\"asset-drawer__hint\">Hover an item to inspect it. Drag it into the world to place; hold <kbd>Shift</kbd> as you drop to keep placing, <kbd>R</kbd> rotates.</p>"; return; }
    const facts = [
      footprint(asset),
      asset.colliders.length ? "Blocks the goose" : "Walk-through",
      asset.occludesCamera ? "Fades for camera" : undefined,
      asset.surfaceHeight !== undefined ? "Walkable surface" : undefined,
      asset.carryable ? "Goose can carry" : undefined,
      asset.controller ? "Needs a target" : undefined,
    ].filter(Boolean);
    const name = element("strong", ""); name.textContent = asset.label;
    const meta = element("ul", ""); meta.append(...facts.map((fact) => { const li = document.createElement("li"); li.textContent = fact!; return li; }));
    const text = element("div", ""); text.append(name, meta);
    this.inspector.replaceChildren(thumbnails.image(asset.assetId), text);
  }

  notePlaced(assetId: string): void { rememberRecent(assetId); if (!this.query.trim()) { const top = this.list.scrollTop; this.render(); this.list.scrollTop = top; } }
  dispose(): void { this.root.remove(); }
}

/** A small floating card that follows the cursor while a drag is over the UI. */
export function createDragChip(assetId: string): HTMLElement {
  const asset = getWorldAsset(assetId); const chip = element("div", "asset-drag-chip");
  const name = element("span", ""); name.textContent = asset?.label ?? assetId;
  chip.append(thumbnails.image(assetId), name); return chip;
}
