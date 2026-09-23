"""Rebuild with: blender --background --python assets/props/build_brewery_tank.py"""
from pathlib import Path
import bpy
import bmesh
import math
import random
from mathutils import Vector

OUT = Path(__file__).resolve().parent
STAGE = OUT / 'brewery_tank.glb'

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
    bsdf.inputs['Metallic'].default_value = 0
    return mat


# Authored colors match PALETTE.breweryTank so previews read like the game.
SHELL_MAT = material('Tank shell', 'E3DDCD')
BRASS_MAT = material('Tank brass', 'BF9840')
FRAME_MAT = material('Tank frame', 'D3CEC0')
BRACE_MAT = material('Tank frame brace', 'BCB8A9')
FOOTING_MAT = material('Tank footing', '9C9588')
IRON_MAT = material('Tank railing', '2B3D3C')
PIPE_MAT = material('Tank service pipe', 'C6BDA8')
MURAL_MATS = [
    material('Tank mural sky', '5F8FB4'),
    material('Tank mural blue', '3A6C94'),
    material('Tank mural teal', '6AA8A6'),
    material('Tank mural green', '6D9159'),
    material('Tank mural forest', '436A4B'),
    material('Tank mural gold', 'CFA64C'),
    material('Tank mural orange', 'CB7F43'),
    material('Tank mural rust', 'A85541'),
    material('Tank mural cream', 'D8CEB6'),
    material('Tank mural slate', '5A6366'),
]

solids = []
sheets = []


def mesh(name, verts, faces, mat, solid=True):
    data = bpy.data.meshes.new(name)
    data.from_pydata(verts, [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    data.materials.append(mat)
    (solids if solid else sheets).append(obj)
    return obj


def revolve(name, profile, mat, n=48, closed=False):
    """Profile runs counter-clockwise in the (radius, height) half-plane."""
    verts = [(r*math.cos(2*math.pi*j/n), r*math.sin(2*math.pi*j/n), z)
             for r, z in profile for j in range(n)]
    rings = len(profile)
    faces = []
    for k in range(rings if closed else rings - 1):
        nxt = (k + 1) % rings
        for j in range(n):
            faces.append((k*n + j, k*n + (j+1) % n, nxt*n + (j+1) % n, nxt*n + j))
    if not closed:
        faces.append(tuple(reversed(range(n))))
        faces.append(tuple((rings-1)*n + j for j in range(n)))
    return mesh(name, verts, faces, mat)


def box(name, center, size, mat, rot=0.0):
    cx, cy, cz = center
    sx, sy, sz = size
    verts = []
    for dz in (-1, 1):
        for dx, dy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
            x, y = dx*sx/2, dy*sy/2
            verts.append((cx + x*math.cos(rot) - y*math.sin(rot),
                          cy + x*math.sin(rot) + y*math.cos(rot),
                          cz + dz*sz/2))
    faces = [(3, 2, 1, 0), (4, 5, 6, 7)]
    faces += [(q, (q+1) % 4, (q+1) % 4 + 4, q + 4) for q in range(4)]
    return mesh(name, verts, faces, mat)


def bar(name, start, end, width, thick, normal, mat):
    start, end = Vector(start), Vector(end)
    along = (end - start).normalized()
    out = Vector(normal)
    out = (out - along*out.dot(along)).normalized()
    wide = along.cross(out).normalized() * (width/2)
    deep = out * (thick/2)
    verts = [tuple(p + wide*sw + deep*st)
             for p in (start, end) for sw, st in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    faces = [(0, 1, 2, 3), (7, 6, 5, 4)]
    faces += [(q, q + 4, (q+1) % 4 + 4, (q+1) % 4) for q in range(4)]
    return mesh(name, verts, faces, mat)


def tube(name, points, radius, mat, seg=10):
    points = [Vector(p) for p in points]
    verts = []
    for i, p in enumerate(points):
        if i == 0:
            along = points[1] - points[0]
        elif i == len(points) - 1:
            along = points[-1] - points[-2]
        else:
            along = points[i+1] - points[i-1]
        along.normalize()
        reference = Vector((1, 0, 0)) if abs(along.dot(Vector((0, 1, 0)))) > .9 else Vector((0, 1, 0))
        across = along.cross(reference).normalized()
        up = along.cross(across).normalized()
        for j in range(seg):
            angle = 2*math.pi*j/seg
            verts.append(tuple(p + across*(radius*math.cos(angle)) + up*(radius*math.sin(angle))))
    faces = []
    for k in range(len(points) - 1):
        for j in range(seg):
            a, b = k*seg + j, k*seg + (j+1) % seg
            faces.append((a, b, b + seg, a + seg))
    faces.append(tuple(reversed(range(seg))))
    faces.append(tuple((len(points)-1)*seg + j for j in range(seg)))
    return mesh(name, verts, faces, mat)


# Silhouette of the vessel itself, bottom cone tip to the top of the shallow dome.
SHELL = [
    (.30, .52), (1.80, 2.34), (1.80, 7.22), (1.739, 7.453), (1.559, 7.670),
    (1.273, 7.856), (.900, 7.999), (.466, 8.089), (.30, 8.110),
]
RAIL_R = 2.45
RAIL_OUTER = RAIL_R + .035
HEIGHT = 8.40


def profile_at(z):
    z = min(max(z, SHELL[0][1]), SHELL[-1][1])
    for (r0, z0), (r1, z1) in zip(SHELL, SHELL[1:]):
        if z <= z1 or (r1, z1) == SHELL[-1]:
            ratio = (z - z0)/(z1 - z0)
            span = math.hypot(r1 - r0, z1 - z0)
            return r0 + (r1 - r0)*ratio, (z1 - z0)/span, -(r1 - r0)/span
    raise AssertionError(z)


def surface(angle, z, offset):
    """A point lifted off the vessel skin along its outward normal."""
    radius, out_r, out_z = profile_at(z)
    lifted = radius + offset*out_r
    return (lifted*math.cos(angle), lifted*math.sin(angle), z + offset*out_z)


def tri_grid(a, b, c, n):
    a, b, c = Vector(a), Vector(b), Vector(c)
    index = {}
    points = []
    for i in range(n + 1):
        for j in range(n + 1 - i):
            index[(i, j)] = len(points)
            points.append(tuple((a*i + b*j + c*(n - i - j))/n))
    faces = []
    for i in range(n):
        for j in range(n - i):
            faces.append((index[(i, j)], index[(i+1, j)], index[(i, j+1)]))
            if j < n - i - 1:
                faces.append((index[(i, j+1)], index[(i+1, j)], index[(i+1, j+1)]))
    return points, faces


def mural_band(prefix, z0, z1, rows, cols, seed, arc_radius, gap=.94):
    """Irregular painted panels quilted over the skin, leaving light seams."""
    rng = random.Random(seed)
    step_a = 2*math.pi/cols
    step_z = (z1 - z0)/rows
    lattice = [[(j*step_a + rng.uniform(-.24, .24)*step_a,
                 z0 + i*step_z + (0 if i in (0, rows) else rng.uniform(-.28, .28)*step_z))
                for j in range(cols)] for i in range(rows + 1)]
    bumps = {}

    def midpoint(key, p, q):
        bump = bumps.setdefault(key, rng.uniform(-.1, .1))
        da, dz = (q[0] - p[0])*arc_radius, q[1] - p[1]
        span = math.hypot(da, dz)
        return ((p[0] + q[0])/2 - dz/span*bump*span/arc_radius,
                (p[1] + q[1])/2 + da/span*bump*span)

    colors = [[0]*cols for _ in range(rows)]
    for i in range(rows):
        for j in range(cols):
            taken = {colors[i][j-1], colors[i-1][j] if i else -1}
            colors[i][j] = rng.choice([c for c in range(len(MURAL_MATS)) if c not in taken])
    for i in range(rows):
        for j in range(cols):
            right = (j + 1) % cols
            wrap = 2*math.pi if right == 0 else 0
            corners = [lattice[i][j], (lattice[i][right][0] + wrap, lattice[i][right][1]),
                       (lattice[i+1][right][0] + wrap, lattice[i+1][right][1]), lattice[i+1][j]]
            edges = [('h', i, j), ('v', i, right), ('h', i+1, j), ('v', i, j)]
            outline = []
            for k in range(4):
                outline.append(corners[k])
                outline.append(midpoint(edges[k], corners[k], corners[(k+1) % 4]))
            center_a = sum(p[0] for p in outline)/8
            center_z = sum(p[1] for p in outline)/8
            outline = [(center_a + (a - center_a)*gap, center_z + (z - center_z)*gap)
                       for a, z in outline]
            offset = .02 + rng.uniform(0, .006)
            verts, faces = [], []
            for k in range(8):
                grid, tris = tri_grid((center_a, center_z), outline[k], outline[(k+1) % 8], 2)
                base = len(verts)
                verts += [surface(a, z, offset) for a, z in grid]
                faces += [tuple(base + t for t in tri) for tri in tris]
            mesh(f'{prefix} panel {i}-{j}', verts, faces, MURAL_MATS[colors[i][j]], solid=False)


revolve('Vessel shell', SHELL, SHELL_MAT)
revolve('Brass manway collar', [(.30, 8.100), (.315, 8.135), (.315, 8.250),
                                (.285, 8.320), (.205, 8.375), (.090, 8.400)], BRASS_MAT, 24)
revolve('Discharge valve', [(.26, .300), (.30, .335), (.30, .400), (.38, .420),
                            (.38, .470), (.30, .490), (.30, .530)], BRASS_MAT, 24)

mural_band('Cone', .82, 2.26, 2, 11, 12, 1.1)
mural_band('Cylinder', 2.42, 7.19, 5, 14, 7, 1.8)
mural_band('Dome', 7.26, 7.99, 1, 12, 23, 1.5)

LEG_R = 1.70
LEG_ANCHOR = 1.79
for index in range(4):
    angle = math.pi/4 + index*math.pi/2
    spot = (LEG_R*math.cos(angle), LEG_R*math.sin(angle))
    box(f'Footing {index}', (*spot, .05), (.46, .46, .10), FOOTING_MAT, angle)
    box(f'Leg {index}', (*spot, 1.23), (.17, .17, 2.30), FRAME_MAT, angle)
    nxt = math.pi/4 + (index + 1)*math.pi/2
    here = Vector((LEG_ANCHOR*math.cos(angle), LEG_ANCHOR*math.sin(angle), 0))
    there = Vector((LEG_ANCHOR*math.cos(nxt), LEG_ANCHOR*math.sin(nxt), 0))
    panel = (here + there)
    panel.z = 0
    bar(f'Brace {index}a', here + Vector((0, 0, .50)), there + Vector((0, 0, 2.15)), .14, .055, panel, BRACE_MAT)
    bar(f'Brace {index}b', there + Vector((0, 0, .50)), here + Vector((0, 0, 2.15)), .14, .055, panel, BRACE_MAT)
    bar(f'Tie {index}', here + Vector((0, 0, .42)), there + Vector((0, 0, .42)), .13, .05, panel, BRACE_MAT)

revolve('Rail top', [(RAIL_R - .035, .960), (RAIL_OUTER, .960), (RAIL_OUTER, 1.050),
                     (RAIL_R - .035, 1.050)], IRON_MAT, 48, closed=True)
revolve('Rail bottom', [(RAIL_R - .03, .080), (RAIL_R + .03, .080), (RAIL_R + .03, .140),
                        (RAIL_R - .03, .140)], IRON_MAT, 48, closed=True)
for index in range(28):
    angle = 2*math.pi*index/28
    box(f'Baluster {index}', (RAIL_R*math.cos(angle), RAIL_R*math.sin(angle), .53),
        (.05, .05, 1.06), IRON_MAT, angle)

PIPE_A = math.radians(-55)
tube('Racking arm', [(r*math.cos(PIPE_A), r*math.sin(PIPE_A), z) for r, z in
                     [(1.83, 2.52), (1.83, 3.30), (1.87, 3.44), (2.02, 3.50)]], .05, PIPE_MAT)
tube('Sample valve', [(r*math.cos(PIPE_A + .5), r*math.sin(PIPE_A + .5), z) for r, z in
                      [(.92, 1.44), (1.24, 1.30)]], .045, PIPE_MAT)

for obj in sheets:
    obj.data.calc_loop_triangles()
    for poly in obj.data.polygons:
        radial = Vector((poly.center.x, poly.center.y, 0)).normalized()
        assert poly.normal.dot(radial) > 0, f'{obj.name} panel faces inward'
for obj in solids:
    scratch = bmesh.new()
    scratch.from_mesh(obj.data)
    assert scratch.calc_volume(signed=True) > 0, f'{obj.name} is inside out'
    scratch.free()

bpy.ops.object.select_all(action='DESELECT')
parts = solids + sheets
for obj in parts:
    obj.select_set(True)
bpy.context.view_layer.objects.active = parts[0]
bpy.ops.object.join()
tank = bpy.context.object
tank.name = 'BreweryTank'
bpy.context.scene.cursor.location = (0, 0, 0)
bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.quads_convert_to_tris(quad_method='BEAUTY', ngon_method='BEAUTY')
bpy.ops.object.mode_set(mode='OBJECT')
for poly in tank.data.polygons:
    poly.use_smooth = False
assert abs(tank.dimensions.z - HEIGHT) < 1e-5, tuple(tank.dimensions)
assert abs(tank.dimensions.x - 2*RAIL_OUTER) < 1e-5, tuple(tank.dimensions)
assert abs(min(v.co.z for v in tank.data.vertices)) < 1e-6
assert tank.location.length == 0
tank['height_m'] = HEIGHT
tank['origin'] = 'Ground center; glTF Y-up; meters'
bpy.ops.export_scene.gltf(filepath=str(STAGE), export_format='GLB', use_selection=True,
                          export_yup=True, export_extras=True, export_cameras=False,
                          export_lights=False, export_texcoords=False)
print('MODEL', len(tank.data.polygons), 'triangles; dimensions', tuple(tank.dimensions))

# Reimport the exported file so the preview shows exactly what ships.
bpy.data.objects.remove(tank, do_unlink=True)
bpy.ops.import_scene.gltf(filepath=str(STAGE))
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.samples = 24
scene.cycles.use_denoising = True
scene.render.resolution_x = 900
scene.render.resolution_y = 1200
scene.render.resolution_percentage = 100
scene.world.color = (.55, .55, .55)
scene.view_settings.view_transform = 'Standard'
bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, -.01))
bpy.context.object.data.materials.append(material('Preview ground', 'E8E1D5'))
bpy.ops.object.light_add(type='AREA', location=(-9, -12, 18))
bpy.context.object.data.energy = 4200
bpy.context.object.data.shape = 'DISK'
bpy.context.object.data.size = 10
bpy.ops.object.camera_add(location=(9, -15, 7.5))
camera = bpy.context.object
camera.rotation_euler = (Vector((0, 0, 4.2)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
camera.data.type = 'ORTHO'
camera.data.ortho_scale = 11
scene.camera = camera
scene.render.filepath = '/private/tmp/brewery_tank_preview.png'
bpy.ops.render.render(write_still=True)
