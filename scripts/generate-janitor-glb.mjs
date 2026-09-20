import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { createJanitorModel } from "../src/game/JanitorModel.ts";

// Node 22.18+ strips the shared recipe's TypeScript; no browser is needed.
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

const model = createJanitorModel();
const outputPath = fileURLToPath(new URL("../assets/characters/janitor/models/janitor-street-sweeper.glb", import.meta.url));
const result = await new GLTFExporter().parseAsync(model, {
  binary: true,
  onlyVisible: false,
  animations: model.animations,
});
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, Buffer.from(result));
console.log(`Wrote rigged, broom-free janitor to ${outputPath}`);
