/// <reference types="vite/client" />
import * as THREE from "three";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { toonMaterial, STORYBOOK_LIGHTING } from "../../game/toonMaterial.ts";

/** Dev-only side-by-side animation comparison shared by the character labs. */

export interface LabVariant {
  /** Short label shown on the card. */
  name: string;
  /** What this variant is trying, so feedback can reference it. */
  notes: string;
  group: string;
  clip: THREE.AnimationClip;
  /** Ground speed for the treadmill, m/s. */
  travelSpeed?: number;
  /** Which character model to show, for labs with several. */
  model?: string;
}

export interface LabCharacter {
  /** localStorage key for the lab's controls. */
  storageKey: string;
  defaultGroup: string;
  /** Builds the rig for a variant's `model` key (undefined for single-model labs). */
  createModel(model: string | undefined): THREE.Object3D;
  /** Palette slot → colour, looked up by mesh material name. */
  colors(model: string | undefined): Readonly<Record<string, number>>;
  /** Height the cameras aim at, metres. */
  focusY: number;
  /** Half the height the orthographic side/front views show, metres. */
  frameHalf: number;
  /** Game-camera distance scale; the game uses 9.6 m. */
  gameCameraDistance: number;
  /** Per-card presentation tweaks the game view makes, such as swapping facial expressions. */
  dress?(rig: THREE.Object3D, variant: LabVariant): void;
}

export function startAnimationLab(character: LabCharacter, initial: LabVariant[], onReplace: (accept: (variants: LabVariant[]) => void) => void): void {
  const settings = loadSettings(character);
  const canvas = document.querySelector<HTMLCanvasElement>("#gl")!;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.BasicShadowMap;
  renderer.setScissorTest(true);

  const templates = new Map<string, THREE.Object3D>();
  function template(model: string | undefined): THREE.Object3D {
    const key = model ?? "";
    let found = templates.get(key);
    if (!found) {
      found = character.createModel(model);
      found.animations = [];
      const palette = character.colors(model);
      const materials = new Map<string, THREE.Material>();
      found.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        const name = (object.material as THREE.Material).name;
        if (palette[name] === undefined) throw new Error(`No lab colour for ${name}`);
        if (!materials.has(name)) materials.set(name, toonMaterial(palette[name]));
        object.material = materials.get(name)!;
        object.frustumCulled = false;
      });
      templates.set(key, found);
    }
    return found;
  }

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
    variant: LabVariant;
    scene: THREE.Scene;
    mixer: THREE.AnimationMixer;
    floor: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshToonMaterial>;
    skeleton: THREE.SkeletonHelper;
    views: { element: HTMLElement; camera: THREE.Camera }[];
  }

  const { focusY, frameHalf } = character;
  function gameCamera(): THREE.PerspectiveCamera {
    // Game.ts view direction, offset (-a, a√2, -a), facing the character's front-left; zoomed in to fill the card.
    const camera = new THREE.PerspectiveCamera(16, 1, 0.1, 100);
    const a = character.gameCameraDistance / 1.3;
    camera.position.set(-a, focusY + a * Math.SQRT2, -a);
    camera.lookAt(0, focusY, 0);
    return camera;
  }
  function orthographic(position: THREE.Vector3): THREE.OrthographicCamera {
    const camera = new THREE.OrthographicCamera(-frameHalf, frameHalf, frameHalf, -frameHalf, 0.1, 50);
    camera.position.copy(position);
    camera.lookAt(0, position.y, 0);
    return camera;
  }

  function buildCard(variant: LabVariant): Card {
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
    const rig = clone(template(variant.model));
    character.dress?.(rig, variant);
    scene.add(rig);
    const skeleton = new THREE.SkeletonHelper(rig);
    skeleton.visible = settings.skeleton;
    scene.add(skeleton);
    const mixer = new THREE.AnimationMixer(rig);
    mixer.clipAction(variant.clip).play();

    const element = document.createElement("article");
    element.className = "card";
    element.innerHTML = `<header><h2></h2><span class="meta"></span></header><p class="notes"></p>
      <div class="views"><figure><div class="view"></div><figcaption>Game camera</figcaption></figure>
      <figure><div class="view"></div><figcaption>Side</figcaption></figure>
      <figure><div class="view"></div><figcaption>Front</figcaption></figure></div>`;
    element.querySelector("h2")!.textContent = variant.name;
    element.querySelector(".meta")!.textContent = `${variant.clip.duration.toFixed(2)}s loop${variant.travelSpeed ? ` · ${+variant.travelSpeed.toFixed(2)} m/s` : ""}${variant.model ? ` · ${variant.model}` : ""}`;
    element.querySelector(".notes")!.textContent = variant.notes;
    document.querySelector("#cards")!.append(element);
    const [game, side, front] = element.querySelectorAll<HTMLElement>(".view");
    return {
      variant, scene, mixer, floor, skeleton,
      views: [
        { element: game, camera: gameCamera() },
        { element: side, camera: orthographic(new THREE.Vector3(8, focusY, 0)) },
        { element: front, camera: orthographic(new THREE.Vector3(0, focusY, -8)) },
      ],
    };
  }

  let cards: Card[] = [];
  function rebuild(variants: LabVariant[]): void {
    const scroll = scrollY;
    document.querySelector("#cards")!.replaceChildren();
    const groups: string[] = [...new Set(variants.map((variant) => variant.group))];
    if (!groups.includes(settings.group)) settings.group = groups[0];
    const tabs = document.querySelector("#groups")!;
    tabs.replaceChildren(...groups.map((group) => {
      const button = document.createElement("button");
      button.textContent = group;
      button.setAttribute("aria-pressed", String(group === settings.group));
      button.onclick = () => { settings.group = group; saveSettings(character, settings); rebuild(variants); };
      return button;
    }));
    // ?only=<text> keeps just the cards whose name contains it, for close-up checks.
    const only = new URLSearchParams(location.search).get("only")?.toLowerCase();
    cards = variants.filter((variant) => variant.group === settings.group && (!only || variant.name.toLowerCase().includes(only))).map(buildCard);
    scrollTo(0, scroll);
  }
  rebuild(initial);
  onReplace((variants) => { templates.clear(); rebuild(variants); });

  let time = Number(new URLSearchParams(location.search).get("t") ?? 0) || 0;
  const step = 1 / 30;
  const bind = (selector: string, action: () => void) => { document.querySelector<HTMLButtonElement>(selector)!.onclick = () => { action(); saveSettings(character, settings); syncControls(); }; };
  bind("#play", () => { settings.paused = !settings.paused; });
  bind("#back", () => { settings.paused = true; time = Math.max(0, time - step); });
  bind("#forward", () => { settings.paused = true; time += step; });
  bind("#restart", () => { time = 0; });
  bind("#treadmill", () => { settings.treadmill = !settings.treadmill; });
  bind("#skeleton", () => { settings.skeleton = !settings.skeleton; });
  bind("#zoom", () => { settings.zoom = !settings.zoom; });
  const speed = document.querySelector<HTMLSelectElement>("#speed")!;
  speed.onchange = () => { settings.speed = Number(speed.value); saveSettings(character, settings); };
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
          const half = frameHalf * rect.width / rect.height;
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
}

interface Settings { group: string; paused: boolean; speed: number; treadmill: boolean; skeleton: boolean; zoom: boolean }
function loadSettings(character: LabCharacter): Settings {
  const defaults: Settings = { group: character.defaultGroup, paused: false, speed: 1, treadmill: true, skeleton: false, zoom: false };
  let saved: Partial<Settings> = {};
  try { saved = JSON.parse(localStorage.getItem(character.storageKey) ?? "{}"); } catch { /* preview only */ }
  // ?group=model&zoom opens a specific view without disturbing saved settings in other tabs.
  const query = new URLSearchParams(location.search);
  const fromQuery: Partial<Settings> = {};
  if (query.has("group")) fromQuery.group = query.get("group")!;
  if (query.has("zoom")) fromQuery.zoom = true;
  if (query.has("paused")) fromQuery.paused = true;
  return { ...defaults, ...saved, ...fromQuery };
}
function saveSettings(character: LabCharacter, settings: Settings): void {
  try { localStorage.setItem(character.storageKey, JSON.stringify(settings)); } catch { /* preview only */ }
}
