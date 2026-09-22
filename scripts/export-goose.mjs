import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

const blender = process.env.BLENDER_PATH ?? (existsSync('/Applications/Blender.app/Contents/MacOS/Blender')
  ? '/Applications/Blender.app/Contents/MacOS/Blender' : 'blender');
const result = spawnSync(blender, ['--background', '--python', 'scripts/animate-goose.py', '--',
  ...(process.argv.includes('--author') ? [] : ['--export-only'])], { stdio: 'inherit' });
if (result.error) console.error('Unable to start Blender. Set BLENDER_PATH to its executable.', result.error.message);
process.exit(result.status ?? 1);
