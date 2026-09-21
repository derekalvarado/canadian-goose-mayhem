"""Import the generated runtime goose and save an editable Blender source file."""

from pathlib import Path
import bpy

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets/characters/goose/models/canada-goose.glb"
OUTPUT = ROOT / "assets/characters/goose/goose.blend"

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(SOURCE))
bpy.context.scene["asset_role"] = "rigged-player-character"
bpy.context.scene["runtime_export"] = "models/canada-goose.glb"
bpy.context.scene["forward_axis"] = "-Z"
bpy.context.scene["units"] = "meters"
bpy.context.scene.unit_settings.system = "METRIC"
bpy.context.scene.unit_settings.scale_length = 1.0
bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT))
print(f"Saved editable goose source to {OUTPUT}")
