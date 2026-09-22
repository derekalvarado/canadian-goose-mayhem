import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { createSplashKidModel } from "../src/game/SplashKidModel.ts";

globalThis.FileReader ??= class FileReader {
  result = null; onloadend = null;
  readAsArrayBuffer(blob) { blob.arrayBuffer().then((result) => { this.result = result; this.onloadend?.(); }); }
};

for (const variant of ["runner", "boots"]) {
  const model = createSplashKidModel(variant);
  const outputPath = fileURLToPath(new URL(`../assets/characters/kids/models/splash-kid-${variant}.glb`, import.meta.url));
  const result = await new GLTFExporter().parseAsync(model, { binary: true, onlyVisible: false, animations: model.animations });
  await mkdir(dirname(outputPath), { recursive: true }); await writeFile(outputPath, Buffer.from(result));
  console.log(`Wrote rigged ${variant} splash-pad kid to ${outputPath}`);
}
