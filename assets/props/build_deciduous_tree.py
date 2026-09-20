"""Rebuild with: blender --background --python assets/props/build_deciduous_tree.py"""
from pathlib import Path
import bpy
import math
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

# Each variation keeps the same footprint and material contract while changing
# the trunk gesture and crown rhythm. Points are authored Z-up before glTF export.
VARIANTS = [
    {
        'name': 'Balanced fork',
        'trunk': [
            ((0, 0, 0), .34), ((.04, -.01, .48), .30), ((-.03, .02, .98), .255),
            ((.05, .01, 1.48), .205), ((.00, .03, 2.10), .12), ((.06, .04, 3.14), .042),
        ],
        'limbs': [
            ('Left limb', [((.00, 0, .82), .19), ((-.14, .01, 1.28), .16), ((-.50, .02, 1.88), .115), ((-.86, .04, 2.35), .075), ((-1.20, .02, 2.79), .034)]),
            ('Right limb', [((.02, 0, .98), .185), ((.18, -.02, 1.38), .15), ((.55, -.04, 1.92), .105), ((.90, -.04, 2.39), .068), ((1.23, -.02, 2.85), .032)]),
            ('Rear limb', [((.02, .01, 1.30), .13), ((-.04, .25, 1.83), .095), ((-.10, .52, 2.50), .043)]),
        ],
        'crowns': [
            ('Upper crown', (.06, .05, 3.52), (.68, .68, .64), (0.02, -.08, .08), .35),
            ('Left crown', (-1.24, .02, 2.93), (.72, .70, .58), (-.04, .10, -.08), 1.75),
            ('Right crown', (1.27, -.03, 2.98), (.74, .69, .60), (.05, -.08, .10), 3.15),
        ],
    },
    {
        'name': 'Windswept fork',
        'trunk': [
            ((0, 0, 0), .35), ((-.04, .02, .45), .305), ((.05, .03, .92), .255),
            ((.13, .05, 1.42), .20), ((.02, .08, 2.02), .115), ((-.18, .10, 3.08), .04),
        ],
        'limbs': [
            ('Long left limb', [((.04, .02, .88), .19), ((-.18, .04, 1.30), .155), ((-.58, .07, 1.83), .11), ((-.99, .08, 2.32), .07), ((-1.30, .06, 2.79), .032)]),
            ('Low right limb', [((.09, .03, 1.08), .17), ((.39, -.02, 1.47), .135), ((.74, -.10, 1.91), .09), ((1.08, -.16, 2.27), .056), ((1.25, -.18, 2.57), .03)]),
            ('Rear fan', [((.08, .04, 1.48), .12), ((.18, .32, 1.95), .085), ((.28, .66, 2.55), .038)]),
        ],
        'crowns': [
            ('High crown', (-.20, .09, 3.43), (.69, .66, .63), (.02, .07, -.10), .80),
            ('Left crown', (-1.31, .06, 2.91), (.63, .67, .57), (-.06, -.08, -.12), 2.10),
            ('Right crown', (1.25, -.18, 2.73), (.67, .64, .55), (.08, .04, .12), 3.65),
            ('Rear crown', (.30, .70, 2.94), (.54, .52, .49), (-.08, .06, .04), 4.75),
        ],
    },
    {
        'name': 'High spreading fork',
        'trunk': [
            ((0, 0, 0), .34), ((.05, -.02, .46), .295), ((.01, -.01, .94), .25),
            ((-.09, .02, 1.42), .195), ((-.03, .04, 2.03), .115), ((.12, .06, 3.20), .04),
        ],
        'limbs': [
            ('Rising left limb', [((-.02, 0, 1.02), .18), ((-.25, -.02, 1.47), .145), ((-.57, -.07, 1.98), .10), ((-.88, -.12, 2.46), .061), ((-1.05, -.14, 2.78), .03)]),
            ('Rising right limb', [((-.04, .02, 1.31), .17), ((.19, .04, 1.69), .135), ((.53, .04, 2.10), .09), ((.83, .03, 2.57), .055), ((1.06, .03, 2.98), .029)]),
            ('Rear split', [((-.03, .03, 1.55), .125), ((-.18, .31, 2.02), .087), ((-.27, .67, 2.63), .038)]),
        ],
        'crowns': [
            ('Top crown', (.13, .06, 3.55), (.63, .62, .61), (-.02, -.06, .09), 1.20),
            ('Left crown', (-1.08, -.14, 2.91), (.68, .64, .56), (.05, .09, -.10), 2.70),
            ('Right crown', (1.09, .03, 3.10), (.67, .65, .58), (-.07, -.04, .11), 4.10),
            ('Rear crown', (-.28, .72, 3.00), (.55, .51, .48), (.05, .08, -.05), 5.20),
        ],
    },
]


def tapered_path(name, points, parts):
    sides = 10
    vertices = []
    faces = []
    centers = [Vector(position) for position, _ in points]
    for index, (center, (_, radius)) in enumerate(zip(centers, points)):
        if index == 0:
            tangent = (centers[1] - center).normalized()
        elif index == len(centers) - 1:
            tangent = (center - centers[index - 1]).normalized()
        else:
            tangent = ((center - centers[index - 1]).normalized() + (centers[index + 1] - center).normalized()).normalized()
        reference = Vector((0, 1, 0)) if abs(tangent.y) < .9 else Vector((1, 0, 0))
        axis_x = tangent.cross(reference).normalized()
        axis_y = axis_x.cross(tangent).normalized()
        for side_index in range(sides):
            angle = side_index / sides * math.tau
            offset = (axis_x * math.cos(angle) + axis_y * math.sin(angle)) * radius
            vertices.append(tuple(center + offset))

    for ring_index in range(len(points) - 1):
        ring = ring_index * sides
        next_ring = (ring_index + 1) * sides
        for side_index in range(sides):
            following = (side_index + 1) % sides
            faces.append((ring + side_index, ring + following, next_ring + following, next_ring + side_index))

    base_center = len(vertices)
    vertices.append(tuple(centers[0]))
    tip_center = len(vertices)
    vertices.append(tuple(centers[-1]))
    for side_index in range(sides):
        following = (side_index + 1) % sides
        faces.append((base_center, following, side_index))
        tip_ring = (len(points) - 1) * sides
        faces.append((tip_center, tip_ring + side_index, tip_ring + following))

    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(wood)
    for face in mesh.polygons:
        face.use_smooth = len(face.vertices) == 4
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    parts.append(obj)


def root_flare(angle, length, parts):
    direction = Vector((math.cos(angle), math.sin(angle), 0))
    points = [
        ((0, 0, .18), .15),
        ((direction.x * length * .55, direction.y * length * .55, .075), .095),
        ((direction.x * length, direction.y * length, .015), .025),
    ]
    tapered_path('Root flare', points, parts)


def add_crown(name, position, scale, rotation, phase, parts):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=4, radius=1, location=position)
    crown = bpy.context.object
    crown.name = name
    for vertex in crown.data.vertices:
        direction = vertex.co.normalized()
        azimuth = math.atan2(direction.y, direction.x)
        shoulder = max(0, 1 - direction.z * direction.z)
        radius = 1 + shoulder * (
            .075 * math.sin(3 * azimuth + phase)
            + .035 * math.sin(5 * azimuth - phase * .6)
        )
        vertex.co *= radius
        if vertex.co.z < -.22:
            vertex.co.z = -.22 + (vertex.co.z + .22) * .72
    crown.scale = scale
    crown.rotation_euler = rotation
    crown.data.materials.append(leaf)
    for face in crown.data.polygons:
        face.use_smooth = True
    parts.append(crown)


def build_tree(index, definition):
    parts = []
    tapered_path('Curved trunk', definition['trunk'], parts)
    for name, points in definition['limbs']:
        tapered_path(name, points, parts)
    for angle, length in [(.25, .42), (1.85, .34), (3.35, .40), (5.10, .32)]:
        root_flare(angle + index * .37, length, parts)
    for crown in definition['crowns']:
        add_crown(*crown, parts)

    bpy.ops.object.select_all(action='DESELECT')
    for part in parts:
        part.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    obj = bpy.context.object
    obj.name = f'DeciduousTree{index + 1}'
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    bpy.context.scene.cursor.location = (0, 0, 0)
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    # Angled root rings can extend a few millimeters below their center point.
    # Keep the exported base exactly on the authored ground plane.
    for vertex in obj.data.vertices:
        vertex.co.z = max(0, vertex.co.z)
    height = max(vertex.co.z for vertex in obj.data.vertices)
    size_factor = 10 / height
    for vertex in obj.data.vertices:
        vertex.co *= size_factor
    obj['height_m'] = 10
    obj['variant'] = definition['name']
    obj['origin'] = 'Ground level, trunk center; meters; glTF Y-up'

    filename = 'deciduous_tree.glb' if index == 0 else f'deciduous_tree_{index + 1}.glb'
    bpy.ops.export_scene.gltf(
        filepath=str(OUT / filename), export_format='GLB', use_selection=True,
        export_yup=True, export_extras=True, export_cameras=False,
        export_lights=False, export_texcoords=False,
    )
    return obj


trees = []
for variant_index, variant in enumerate(VARIANTS):
    tree = build_tree(variant_index, variant)
    tree.location.x = (variant_index - 1) * 10.5
    trees.append(tree)

# Preview only: exports above exclude camera, lights, and floor.
bpy.ops.object.select_all(action='DESELECT')
scene = bpy.context.scene
scene.render.engine = 'BLENDER_EEVEE'
scene.render.resolution_x = 1400
scene.render.resolution_y = 700
scene.render.resolution_percentage = 100
scene.world.color = (.65, .65, .65)
scene.view_settings.view_transform = 'Standard'
bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, -.01))
bpy.context.object.data.materials.append(material('Preview floor', 'E8E1D5'))
bpy.ops.object.light_add(type='AREA', location=(-8, -12, 20))
bpy.context.object.data.energy = 3900
bpy.context.object.data.size = 12
bpy.ops.object.camera_add(location=(20, -37, 17))
camera = bpy.context.object
camera.rotation_euler = (Vector((0, 0, 4.8)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
camera.data.type = 'ORTHO'
camera.data.ortho_scale = 32
scene.camera = camera
scene.render.filepath = '/private/tmp/deciduous_tree_preview.png'
bpy.ops.render.render(write_still=True)
