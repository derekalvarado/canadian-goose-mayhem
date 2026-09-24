import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { Goose } from "./Goose";
import { PALETTE } from "./palette";
import { toonMaterial, STORYBOOK_LIGHTING } from "./toonMaterial";

/** Close-up review stage using the same character and controller as the game. */
export async function startGoosePreview(canvas: HTMLCanvasElement): Promise<void> {
  document.querySelectorAll<HTMLElement>(".hud, #touch-controls").forEach((element) => { element.hidden = true; });
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.BasicShadowMap;
  renderer.toneMapping = THREE.NoToneMapping;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.green.lawn);
  scene.add(new THREE.AmbientLight(0xffffff, STORYBOOK_LIGHTING.ambient));
  const sun = new THREE.DirectionalLight(0xffffff, STORYBOOK_LIGHTING.sun);
  sun.position.set(-9, 18, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -3;
  sun.shadow.camera.right = 3;
  sun.shadow.camera.top = 3;
  sun.shadow.camera.bottom = -3;
  scene.add(sun);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), toonMaterial(PALETTE.green.lawn));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.004;
  floor.receiveShadow = true;
  scene.add(floor);
  const grid = new THREE.GridHelper(6, 24, PALETTE.green.deep, PALETTE.green.deep);
  grid.position.y = -0.002;
  (grid.material as THREE.Material).transparent = true;
  (grid.material as THREE.Material).opacity = 0.15;
  scene.add(grid);
  const goose = new Goose();
  scene.add(goose);
  await goose.ready;
  const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 250);
  camera.position.set(2.4, 1.45, -3.2);
  const orbit = new OrbitControls(camera, canvas);
  orbit.target.set(0, 0.5, -0.05);
  orbit.enableDamping = true;
  orbit.minDistance = 1.3;
  orbit.maxDistance = 8;
  orbit.maxPolarAngle = Math.PI * 0.49;
  const target = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 12), toonMaterial(PALETTE.goose.white));
  scene.add(target);
  const panel = document.createElement("section");
  panel.setAttribute("aria-label", "Goose animation studio");
  panel.style.cssText = 'position:fixed;left:16px;top:16px;z-index:30;width:min(295px,calc(100vw - 32px));padding:18px;border-radius:16px;background:#17261dee;color:#fff;font:14px/1.5 system-ui;box-shadow:0 12px 40px #0003';
  panel.innerHTML = `<strong style="font-size:20px">Goose movement studio</strong>
    <p style="margin:6px 0 12px">Drag the stage to orbit. Review the same rig used in the plaza.</p>
    <label>Movement <select id="preview-gait"><option value="0">Idle</option><option value="0.3">Slow waddle</option><option value="0.605">Walk</option><option value="1">Hurry</option></select></label>
    <label style="display:block;margin-top:10px">Turn <input id="preview-turn" aria-label="Turn" type="range" min="-1" max="1" step=".05" value="0"></label>
    <label style="display:block">Playback <select id="preview-rate"><option value="1">Normal</option><option value=".25">Quarter speed</option><option value=".5">Half speed</option></select></label>
    <label style="display:block;margin-top:10px"><input id="preview-wings" type="checkbox"> Spread wings</label>
    <label style="display:block"><input id="preview-threat" type="checkbox"> Lower head / sneak</label>
    <label style="display:block"><input id="preview-look" type="checkbox"> Follow moving target</label>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:12px"><button id="preview-honk">Honk</button><button id="preview-grab">Grab</button><button id="preview-spook">Startle</button><button id="preview-pause">Pause</button><button id="preview-step">Step frame</button></div>
    <p id="preview-status" role="status" style="margin:10px 0 0">Ready</p>
    <a href="/assets/characters/goose/anim-lab.html" style="color:#fff;display:block;margin-top:12px">Compare walk variants side by side →</a>
    <a href="/" style="color:#fff;display:inline-block;margin-top:6px">Return to the plaza →</a>`;
  document.body.append(panel);
  const input = (id: string) => panel.querySelector<HTMLInputElement>(`#preview-${id}`)!;
  const select = (id: string) => panel.querySelector<HTMLSelectElement>(`#preview-${id}`)!;
  panel.querySelector('#preview-honk')!.addEventListener('click', () => goose.honk());
  panel.querySelector('#preview-grab')!.addEventListener('click', () => goose.grab());
  panel.querySelector('#preview-spook')!.addEventListener('click', () => goose.spook());
  let paused = false;
  let step = false;
  panel.querySelector('#preview-pause')!.addEventListener('click', (event) => {
    paused = !paused;
    (event.currentTarget as HTMLElement).textContent = paused ? 'Resume' : 'Pause';
  });
  panel.querySelector('#preview-step')!.addEventListener('click', () => {
    paused = true;
    step = true;
    panel.querySelector('#preview-pause')!.textContent = 'Resume';
  });
  const clock = new THREE.Clock();
  let elapsed = 0;
  const status = panel.querySelector<HTMLElement>('#preview-status')!;
  const resize = () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  resize();
  document.querySelector('#loading-screen')?.classList.add('loading-screen--hidden');
  renderer.setAnimationLoop(() => {
    const rawDelta = Math.min(clock.getDelta(), 0.05);
    const delta = step ? 1 / 60 : paused ? 0 : rawDelta * Number(select('rate').value);
    step = false;
    elapsed += delta;
    target.visible = input('look').checked;
    target.position.set(Math.sin(elapsed * 0.85) * 1.7, 0.8 + Math.sin(elapsed * 0.6) * 0.45, -2);
    goose.setLookTarget(target.visible ? target.position : undefined);
    goose.update(delta, elapsed, Number(select('gait').value), Number(input('turn').value), input('wings').checked, input('threat').checked);
    status.textContent = `${paused ? 'Paused' : 'Playing'} · ${select('gait').selectedOptions[0].text} · ${elapsed.toFixed(2)}s`;
    orbit.update();
    renderer.render(scene, camera);
  });
}
