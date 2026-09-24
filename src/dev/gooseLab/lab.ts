/// <reference types="vite/client" />
import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { GOOSE_COLORS } from "../../game/GooseModel.ts";
import { GOOSE_ANIMATION } from "../../game/GooseAnimation.ts";
import { HURRY_SPEED, WALK_SPEED } from "../../game/simulation/Simulation.ts";
import { toonMaterial, STORYBOOK_LIGHTING } from "../../game/toonMaterial.ts";
import { GooseGaitRig } from "./gait.ts";
import { VARIANTS, type Variant } from "./variants.ts";

/** Dev-only side-by-side goose walk comparison; see assets/characters/goose/anim-lab.html. */

const MODEL_URL = new URL("../../../assets/characters/goose/models/canada-goose.glb", import.meta.url).href;
// Same cadence the game gives the walk clip at walking speed (GooseAnimationState).
const WALK_RATIO = WALK_SPEED / HURRY_SPEED;
const CYCLES_PER_SECOND = (0.8 + 1.8 * WALK_RATIO) * GOOSE_ANIMATION.gaitCadenceScale;

const settings = loadSettings();
const canvas = document.querySelector<HTMLCanvasElement>("#gl")!;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.NoToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.BasicShadowMap;
renderer.setScissorTest(true);

const gltf: GLTF = await new GLTFLoader().loadAsync(MODEL_URL);
const materials = new Map<string, THREE.Material>();
gltf.scene.traverse((object) => {
  if (!(object instanceof THREE.Mesh)) return;
  const name = (object.material as THREE.Material).name as keyof typeof GOOSE_COLORS;
  if (!materials.has(name)) materials.set(name, toonMaterial(GOOSE_COLORS[name], {}, true));
  object.material = materials.get(name)!;
  object.castShadow = true;
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
const TILE_METRES = 0.25;
const ORTHO_HALF = 0.62;

interface Card {
  variant: Variant;
  scene: THREE.Scene;
  pose: (phase: number) => void;
  floor: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshToonMaterial>;
  skeleton: THREE.SkeletonHelper;
  views: { element: HTMLElement; camera: THREE.Camera }[];
}

function gameCamera(): THREE.PerspectiveCamera {
  // Game.ts view direction, offset (-a, a√2, -a) around a focus 0.55 m up, facing the goose's front-left; zoomed to fill the card.
  const camera = new THREE.PerspectiveCamera(6.5, 1, 1, 100);
  const a = 9.6 / 1.3;
  camera.position.set(-a, 0.55 + a * Math.SQRT2, -a);
  camera.lookAt(0, 0.5, 0);
  return camera;
}
function orthoCamera(position: THREE.Vector3Tuple, target: THREE.Vector3Tuple, half = ORTHO_HALF): THREE.OrthographicCamera {
  const camera = new THREE.OrthographicCamera(-half, half, half, -half, 0.1, 50);
  camera.position.set(...position);
  if (position[1] > 5) camera.up.set(0, 0, -1);
  camera.lookAt(...target);
  return camera;
}

function buildCard(variant: Variant): Card {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf2efe7);
  scene.add(new THREE.AmbientLight(0xffffff, STORYBOOK_LIGHTING.ambient));
  const sun = new THREE.DirectionalLight(0xffffff, STORYBOOK_LIGHTING.sun + Math.PI * 0.3);
  sun.position.set(-3, 7, -5); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -2, right: 2, top: 2, bottom: -2, near: 0.1, far: 20 });
  scene.add(sun);
  const floorMaterial = toonMaterial(0xffffff, { map: floorTexture.clone() });
  floorMaterial.map!.repeat.set(20 / TILE_METRES / 2, 20 / TILE_METRES / 2);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), floorMaterial);
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  const goose = clone(gltf.scene);
  scene.add(goose);
  const skeleton = new THREE.SkeletonHelper(goose);
  skeleton.visible = settings.skeleton;
  scene.add(skeleton);

  let pose: (phase: number) => void;
  if (variant.style) {
    const rig = new GooseGaitRig(goose.getObjectByName("canada-goose")!);
    const style = variant.style;
    pose = (phase) => rig.apply(style, phase);
  } else {
    const clip = gltf.animations.find((candidate) => candidate.name === variant.clip);
    if (!clip) throw new Error(`No exported goose clip named ${variant.clip}`);
    const mixer = new THREE.AnimationMixer(goose);
    const action = mixer.clipAction(clip).play();
    // Goose.ts drives locomotion clips by phase, not by clip time.
    pose = (phase) => { action.time = phase * clip.duration; mixer.update(0); };
  }

  const element = document.createElement("article");
  element.className = "card";
  element.innerHTML = `<header><h2></h2><span class="meta"></span></header><p class="notes"></p>
    <div class="views"><figure><div class="view"></div><figcaption>Game camera</figcaption></figure>
    <figure><div class="view"></div><figcaption>Top</figcaption></figure>
    <figure><div class="view"></div><figcaption>Rear</figcaption></figure>
    <figure><div class="view"></div><figcaption>Side</figcaption></figure></div>`;
  element.querySelector("h2")!.textContent = variant.name;
  element.querySelector(".meta")!.textContent = `${(1 / CYCLES_PER_SECOND).toFixed(2)}s cycle at walking speed · ${WALK_SPEED} m/s`;
  element.querySelector(".notes")!.textContent = variant.notes;
  document.querySelector("#cards")!.append(element);
  const [game, top, rear, side] = element.querySelectorAll<HTMLElement>(".view");
  return {
    variant, scene, pose, floor, skeleton,
    views: [
      { element: game, camera: gameCamera() },
      { element: top, camera: orthoCamera([0, 10, 0.05], [0, 0, 0.05], 0.8) },
      { element: rear, camera: orthoCamera([0, 0.45, 8], [0, 0.45, 0]) },
      { element: side, camera: orthoCamera([8, 0.45, 0], [0, 0.45, 0]) },
    ],
  };
}

let cards: Card[] = [];
function rebuild(variants: Variant[]): void {
  const scroll = scrollY;
  document.querySelector("#cards")!.replaceChildren();
  cards = variants.filter((variant) => variant.group === "walk").map(buildCard);
  scrollTo(0, scroll);
}
rebuild(VARIANTS);
if (import.meta.hot) import.meta.hot.accept("./variants.ts", (module) => { if (module) rebuild(module.VARIANTS as Variant[]); });

let time = 0;
const step = 1 / 60;
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
  const phase = (time * CYCLES_PER_SECOND) % 1;
  for (const card of cards) {
    card.pose(phase);
    // The goose walks in place toward -Z; the floor scrolls at game walking speed so foot sliding is visible.
    const travelled = settings.treadmill ? time * WALK_SPEED : 0;
    card.floor.material.map!.offset.y = (travelled / TILE_METRES / 2) % 1;
    for (const { element, camera } of card.views) {
      const rect = element.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > canvas.clientHeight || rect.width === 0) continue;
      if (camera instanceof THREE.PerspectiveCamera) { camera.aspect = rect.width / rect.height; camera.updateProjectionMatrix(); }
      if (camera instanceof THREE.OrthographicCamera) {
        const half = camera.top * rect.width / rect.height;
        if (camera.right !== half) { camera.left = -half; camera.right = half; camera.updateProjectionMatrix(); }
      }
      const y = canvas.clientHeight - rect.bottom;
      renderer.setViewport(rect.left, y, rect.width, rect.height);
      renderer.setScissor(rect.left, y, rect.width, rect.height);
      renderer.render(card.scene, camera);
    }
  }
  document.querySelector("#clock")!.textContent = `t ${time.toFixed(2)}s · phase ${phase.toFixed(2)}`;
}
frame();

interface Settings { paused: boolean; speed: number; treadmill: boolean; skeleton: boolean; zoom: boolean }
function loadSettings(): Settings {
  const defaults: Settings = { paused: false, speed: 1, treadmill: true, skeleton: false, zoom: false };
  let saved: Partial<Settings> = {};
  try { saved = JSON.parse(localStorage.getItem("goose-lab") ?? "{}"); } catch { /* preview only */ }
  // ?zoom&paused opens a specific view without disturbing saved settings in other tabs.
  const query = new URLSearchParams(location.search);
  const fromQuery: Partial<Settings> = {};
  if (query.has("zoom")) fromQuery.zoom = true;
  if (query.has("paused")) fromQuery.paused = true;
  return { ...defaults, ...saved, ...fromQuery };
}
function saveSettings(): void {
  try { localStorage.setItem("goose-lab", JSON.stringify(settings)); } catch { /* preview only */ }
}
