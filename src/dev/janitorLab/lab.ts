/// <reference types="vite/client" />
import * as THREE from "three";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { createJanitorModel, JANITOR_COLORS } from "../../game/JanitorModel.ts";
import { toonMaterial, STORYBOOK_LIGHTING } from "../../game/toonMaterial.ts";
import { VARIANTS } from "./variants.ts";
import type { Variant } from "./keys.ts";

/** Dev-only side-by-side animation comparison; see assets/characters/janitor/anim-lab.html. */

const settings = loadSettings();
const canvas = document.querySelector<HTMLCanvasElement>("#gl")!;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.NoToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.BasicShadowMap;
renderer.setScissorTest(true);

const template = createJanitorModel();
template.animations = [];
const materials = new Map<string, THREE.Material>();
template.traverse((object) => {
  if (!(object instanceof THREE.Mesh)) return;
  const name = (object.material as THREE.Material).name as keyof typeof JANITOR_COLORS;
  if (!materials.has(name)) materials.set(name, toonMaterial(JANITOR_COLORS[name]));
  object.material = materials.get(name)!;
  object.frustumCulled = false;
});

const floorTexture = (() => {
  const size = 128, paint = document.createElement("canvas");
  paint.width = paint.height = size;
  const context = paint.getContext("2d")!;
  context.fillStyle = "#e5e0d3"; context.fillRect(0, 0, size, size);
  context.fillStyle = "#d4cebd"; context.fillRect(0, 0, size / 2, size / 2); context.fillRect(size / 2, size / 2, size / 2, size / 2);
  const texture = new THREE.CanvasTexture(paint);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
})();
const TILE_METRES = 0.5;

interface Card {
  variant: Variant;
  scene: THREE.Scene;
  mixer: THREE.AnimationMixer;
  floor: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshToonMaterial>;
  skeleton: THREE.SkeletonHelper;
  views: { element: HTMLElement; camera: THREE.Camera }[];
}

function gameCamera(): THREE.PerspectiveCamera {
  // Game.ts view direction, offset (-a, a√2, -a), facing the janitor's front-left; zoomed in to fill the card.
  const camera = new THREE.PerspectiveCamera(16, 1, 0.1, 100);
  const a = 9.6 / 1.3;
  camera.position.set(-a, 1.2 + a * Math.SQRT2, -a);
  camera.lookAt(0, 1.2, 0);
  return camera;
}
function sideCamera(): THREE.OrthographicCamera {
  const camera = new THREE.OrthographicCamera(-1.6, 1.6, 1.6, -1.6, 0.1, 50);
  camera.position.set(8, 1.3, 0);
  camera.lookAt(0, 1.3, 0);
  return camera;
}
function frontCamera(): THREE.OrthographicCamera {
  const camera = new THREE.OrthographicCamera(-1.6, 1.6, 1.6, -1.6, 0.1, 50);
  camera.position.set(0, 1.3, -8);
  camera.lookAt(0, 1.3, 0);
  return camera;
}

function buildCard(variant: Variant): Card {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf2efe7);
  scene.add(new THREE.AmbientLight(0xffffff, STORYBOOK_LIGHTING.ambient));
  const sun = new THREE.DirectionalLight(0xffffff, STORYBOOK_LIGHTING.sun + Math.PI * 0.3);
  sun.position.set(-3, 7, -5); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3, near: 0.1, far: 20 });
  scene.add(sun);
  const floorMaterial = toonMaterial(0xffffff, { map: floorTexture.clone() });
  floorMaterial.map!.repeat.set(40 / TILE_METRES / 2, 40 / TILE_METRES / 2);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), floorMaterial);
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  const janitor = clone(template);
  scene.add(janitor);
  const skeleton = new THREE.SkeletonHelper(janitor);
  skeleton.visible = settings.skeleton;
  scene.add(skeleton);
  const mixer = new THREE.AnimationMixer(janitor);
  mixer.clipAction(variant.clip).play();

  const element = document.createElement("article");
  element.className = "card";
  element.innerHTML = `<header><h2></h2><span class="meta"></span></header><p class="notes"></p>
    <div class="views"><figure><div class="view"></div><figcaption>Game camera</figcaption></figure>
    <figure><div class="view"></div><figcaption>Side</figcaption></figure>
    <figure><div class="view"></div><figcaption>Front</figcaption></figure></div>`;
  element.querySelector("h2")!.textContent = variant.name;
  element.querySelector(".meta")!.textContent = `${variant.clip.duration.toFixed(2)}s loop${variant.travelSpeed ? ` · ${+variant.travelSpeed.toFixed(2)} m/s` : ""}`;
  element.querySelector(".notes")!.textContent = variant.notes;
  document.querySelector("#cards")!.append(element);
  const [game, side, front] = element.querySelectorAll<HTMLElement>(".view");
  return {
    variant, scene, mixer, floor, skeleton,
    views: [{ element: game, camera: gameCamera() }, { element: side, camera: sideCamera() }, { element: front, camera: frontCamera() }],
  };
}

let cards: Card[] = [];
function rebuild(variants: Variant[]): void {
  const scroll = scrollY;
  document.querySelector("#cards")!.replaceChildren();
  const groups: string[] = [...new Set(variants.map((variant) => variant.group))];
  if (!groups.includes(settings.group)) settings.group = groups[0];
  const tabs = document.querySelector("#groups")!;
  tabs.replaceChildren(...groups.map((group) => {
    const button = document.createElement("button");
    button.textContent = group;
    button.setAttribute("aria-pressed", String(group === settings.group));
    button.onclick = () => { settings.group = group; saveSettings(); rebuild(variants); };
    return button;
  }));
  cards = variants.filter((variant) => variant.group === settings.group).map(buildCard);
  scrollTo(0, scroll);
}
rebuild(VARIANTS);
if (import.meta.hot) import.meta.hot.accept("./variants.ts", (module) => { if (module) rebuild(module.VARIANTS as Variant[]); });

let time = 0;
const step = 1 / 30;
const bind = (selector: string, action: () => void) => { document.querySelector<HTMLButtonElement>(selector)!.onclick = () => { action(); saveSettings(); syncControls(); }; };
bind("#play", () => { settings.paused = !settings.paused; });
bind("#back", () => { settings.paused = true; time = Math.max(0, time - step); });
bind("#forward", () => { settings.paused = true; time += step; });
bind("#restart", () => { time = 0; });
bind("#treadmill", () => { settings.treadmill = !settings.treadmill; });
bind("#skeleton", () => { settings.skeleton = !settings.skeleton; });
bind("#zoom", () => { settings.zoom = !settings.zoom; });
const speed = document.querySelector<HTMLSelectElement>("#speed")!;
speed.onchange = () => { settings.speed = Number(speed.value); saveSettings(); };
function syncControls(): void {
  document.querySelector("#play")!.textContent = settings.paused ? "Play" : "Pause";
  document.querySelector("#treadmill")!.setAttribute("aria-pressed", String(settings.treadmill));
  document.querySelector("#skeleton")!.setAttribute("aria-pressed", String(settings.skeleton));
  document.querySelector("#zoom")!.setAttribute("aria-pressed", String(settings.zoom));
  document.body.classList.toggle("zoom", settings.zoom);
  speed.value = String(settings.speed);
  for (const card of cards) card.skeleton.visible = settings.skeleton;
}
syncControls();

const clock = new THREE.Clock();
const size = new THREE.Vector2();
function frame(): void {
  requestAnimationFrame(frame);
  const delta = Math.min(clock.getDelta(), 0.1);
  if (!settings.paused) time += delta * settings.speed;
  renderer.getSize(size);
  if (size.x !== canvas.clientWidth || size.y !== canvas.clientHeight) renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
  renderer.setScissor(0, 0, canvas.clientWidth, canvas.clientHeight);
  renderer.setClearColor(0x000000, 0); // scene backgrounds leave an opaque clear colour behind
  renderer.clear();
  for (const card of cards) {
    card.mixer.setTime(time);
    // Floor slides backwards (+Z) under the in-place clip so foot sliding is visible.
    const travelled = settings.treadmill ? time * (card.variant.travelSpeed ?? 0) : 0;
    card.floor.material.map!.offset.y = (travelled / TILE_METRES / 2) % 1;
    for (const { element, camera } of card.views) {
      const rect = element.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > canvas.clientHeight || rect.width === 0) continue;
      if (camera instanceof THREE.PerspectiveCamera) { camera.aspect = rect.width / rect.height; camera.updateProjectionMatrix(); }
      if (camera instanceof THREE.OrthographicCamera) {
        const half = 1.6 * rect.width / rect.height;
        if (camera.right !== half) { camera.left = -half; camera.right = half; camera.updateProjectionMatrix(); }
      }
      const y = canvas.clientHeight - rect.bottom;
      renderer.setViewport(rect.left, y, rect.width, rect.height);
      renderer.setScissor(rect.left, y, rect.width, rect.height);
      renderer.render(card.scene, camera);
    }
  }
  const first = cards[0];
  document.querySelector("#clock")!.textContent = first
    ? `t ${time.toFixed(2)}s · phase ${((time % first.variant.clip.duration) / first.variant.clip.duration).toFixed(2)}`
    : "";
}
frame();

interface Settings { group: string; paused: boolean; speed: number; treadmill: boolean; skeleton: boolean; zoom: boolean }
function loadSettings(): Settings {
  const defaults: Settings = { group: "walk", paused: false, speed: 1, treadmill: true, skeleton: false, zoom: false };
  let saved: Partial<Settings> = {};
  try { saved = JSON.parse(localStorage.getItem("janitor-lab") ?? "{}"); } catch { /* preview only */ }
  // ?group=model&zoom opens a specific view without disturbing saved settings in other tabs.
  const query = new URLSearchParams(location.search);
  const fromQuery: Partial<Settings> = {};
  if (query.has("group")) fromQuery.group = query.get("group")!;
  if (query.has("zoom")) fromQuery.zoom = true;
  if (query.has("paused")) fromQuery.paused = true;
  return { ...defaults, ...saved, ...fromQuery };
}
function saveSettings(): void {
  try { localStorage.setItem("janitor-lab", JSON.stringify(settings)); } catch { /* preview only */ }
}
