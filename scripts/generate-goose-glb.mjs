import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
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
const outputPath = fileURLToPath(new URL("../assets/characters/goose/models/canada-goose.glb", import.meta.url));
const result = await new GLTFExporter().parseAsync(model, {
  binary: true,
  onlyVisible: false,
  animations: model.animations,
});
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, Buffer.from(result));
console.log(`Wrote rigged Canada goose to ${outputPath}`);
