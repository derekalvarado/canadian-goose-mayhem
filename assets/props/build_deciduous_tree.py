"""Rebuild with: blender --background --python assets/props/build_deciduous_tree.py"""
from pathlib import Path
import bpy
import math
import random
from mathutils import Vector

OUT = Path(__file__).resolve().parent
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

def material(name, color):
    rgb = [int(color[i:i+2], 16)/255 for i in (0, 2, 4)]
    linear = [c/12.92 if c <= .04045 else ((c+.055)/1.055)**2.4 for c in rgb]
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*linear, 1)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*linear, 1)
    bsdf.inputs['Roughness'].default_value = 1
    return mat

leaf = material('Deciduous foliage', '71915B')
wood = material('Deciduous trunk', '76533B')
parts = []

def branch(name, start, end, base, tip):
    direction = Vector(end)-Vector(start)
    bpy.ops.mesh.primitive_cone_add(vertices=8, radius1=base, radius2=tip,
        depth=direction.length, location=(Vector(start)+Vector(end))/2)
    obj = bpy.context.object
    obj.name = name
    obj.rotation_euler = direction.to_track_quat('Z','Y').to_euler()
    obj.data.materials.append(wood)
    parts.append(obj)

branch('Flared trunk base', (0,0,0), (0,0,.24), .30,.22)
branch('Chunky trunk', (0,0,.12), (.04,0,1.68), .23,.16)
branch('Left fork', (.02,0,.86), (-.77,.03,2.04), .15,.075)
branch('Right fork', (.02,0,1.05), (.80,.08,2.10), .15,.07)
branch('Rear fork', (0,0,1.3), (-.10,.63,2.30), .13,.06)

# Broad lobes support overlapping low-poly leaf clusters.
# Author at reference scale, then normalize the complete mesh to exactly 10 m.
lobes = [
    ((-.12,.12,3.49),(1.13,.96,1.01)),
    ((-.93,.10,3.08),(.97,.86,.88)),
    ((.92,.09,3.03),(1.03,.86,.86)),
    ((-.98,-.20,2.30),(1.08,.91,.77)),
    ((1.02,-.15,2.24),(.97,.88,.69)),
    ((0,-.48,2.67),(1.14,.95,.89)),
    ((-.67,.67,2.45),(1.02,.85,.79)),
    ((.68,.69,2.57),(1.00,.83,.86)),
    ((-.39,-.68,3.30),(.88,.71,.86)),
]
for i,(position,scale) in enumerate(lobes):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=8, radius=1, location=position)
    obj=bpy.context.object
    obj.name=f'Rounded canopy {i+1}'
    obj.scale=scale
    obj.data.materials.append(leaf)
    for face in obj.data.polygons:
        face.use_smooth=True
    parts.append(obj)

# Low-poly flattened leaf tufts break up the large lobes with readable foliage.
# Fibonacci sampling is deterministic and avoids a visible grid of leaf rows.
rng = random.Random(17)
for i, (position, scale) in enumerate(lobes):
    for j in range(24):
        z = 1 - 2 * (j + .5) / 24
        angle = j * math.pi * (3 - math.sqrt(5)) + i * .61
        direction = Vector((math.sqrt(1-z*z)*math.cos(angle),
                            math.sqrt(1-z*z)*math.sin(angle), z))
        center = Vector(position) + Vector(tuple(direction[k]*scale[k]*.96 for k in range(3)))
        # Skip tufts buried inside another crown lobe.
        if any(sum(((center[k]-p[k])/s[k])**2 for k in range(3)) < .82
               for n,(p,s) in enumerate(lobes) if n != i):
            continue
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=1, location=center)
        tuft = bpy.context.object
        tuft.name = f'Leaf tuft {i+1}.{j+1}'
        tuft.rotation_euler = direction.to_track_quat('Z','Y').to_euler()
        size = rng.uniform(.85, 1.15)
        tuft.scale = (.32*size, .24*size, .19*size)
        tuft.data.materials.append(leaf)
        for face in tuft.data.polygons:
            face.use_smooth = True
        parts.append(tuft)

bpy.ops.object.select_all(action='DESELECT')
for obj in parts: obj.select_set(True)
bpy.context.view_layer.objects.active=parts[0]
bpy.ops.object.join()
obj=bpy.context.object
obj.name='DeciduousTree'
bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
bpy.context.scene.cursor.location=(0,0,0)
bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
height = max(v.co.z for v in obj.data.vertices)
size_factor = 10 / height
for vertex in obj.data.vertices:
    vertex.co *= size_factor
obj['height_m']=10
obj['origin']='Ground level, trunk center; meters; glTF Y-up'
bpy.ops.export_scene.gltf(filepath=str(OUT/'deciduous_tree.glb'),export_format='GLB',
    use_selection=True,export_yup=True,export_extras=True,export_cameras=False,
    export_lights=False,export_texcoords=False)
# Preview only: export above excludes camera, lights, and floor.
scene=bpy.context.scene
scene.render.engine='CYCLES'
scene.cycles.samples=24
scene.render.resolution_x=800
scene.render.resolution_y=800
scene.render.resolution_percentage=100
scene.world.color=(.65,.65,.65)
scene.view_settings.view_transform='Standard'
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.01))
bpy.context.object.data.materials.append(material('Preview floor','E8E1D5'))
bpy.ops.object.light_add(type='AREA',location=(-7,-9,18))
bpy.context.object.data.energy=3200
bpy.context.object.data.size=11
bpy.ops.object.camera_add(location=(13,-22,13))
camera=bpy.context.object
camera.rotation_euler=(Vector((0,0,4.8))-camera.location).to_track_quat('-Z','Y').to_euler()
camera.data.type='ORTHO'
camera.data.ortho_scale=13
scene.camera=camera
scene.render.filepath='/private/tmp/deciduous_tree_preview.png'
bpy.ops.render.render(write_still=True)
