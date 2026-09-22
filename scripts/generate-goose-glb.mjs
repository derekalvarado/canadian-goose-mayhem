import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { createGooseModel } from "../src/game/GooseModel.ts";

globalThis.FileReader ??= class FileReader {
  result = null;
  onloadend = null;
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((result) => {
      this.result = result;
      this.onloadend?.();
    });
  }
};

const model = createGooseModel();
// Bootstrap geometry only; runtime animation is exported from Blender.
const outputPath = process.argv[2];
if (!outputPath) throw new Error("Pass an explicit output path. Use npm run assets:goose to export the Blender source.");
const result = await new GLTFExporter().parseAsync(model, {
  binary: true,
  onlyVisible: false,
  animations: model.animations,
});
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, Buffer.from(result));
console.log(`Wrote rigged Canada goose to ${outputPath}`);
