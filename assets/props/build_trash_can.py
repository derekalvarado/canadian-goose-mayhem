"""Create the reference street bin, export meter-scale GLB, and render a preview."""
import bpy
import math
from mathutils import Vector

STAGE = '/private/tmp/trash_can.glb'
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

def material(name, hexcolor):
    rgb = [int(hexcolor[i:i+2], 16)/255 for i in (0, 2, 4)]
    linear = [v/12.92 if v <= .04045 else ((v+.055)/1.055)**2.4 for v in rgb]
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*linear, 1)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*linear, 1)
    bsdf.inputs['Roughness'].default_value = 1
    bsdf.inputs['Metallic'].default_value = 0
    return mat

body_mat = material('Charcoal recessed body', '414647')
rib_mat = material('Charcoal vertical ribs', '55595A')
lid_mat = material('Charcoal lid and base', '626668')
inside_mat = material('Dark opening', '262D2D')
parts = []

def mesh(name, verts, faces, mat):
    data = bpy.data.meshes.new(name)
    data.from_pydata(verts, [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    data.materials.append(mat)
    parts.append(obj)
    return obj

def lathe(name, profile, mat, n=32):
    # Profile follows the outer shell bottom-to-top, then inward/downward.
    verts = [(r*math.cos(2*math.pi*j/n), r*math.sin(2*math.pi*j/n), z)
             for r,z in profile for j in range(n)]
    faces = []
    for k in range(len(profile)-1):
        for j in range(n):
            a=k*n+j; b=k*n+(j+1)%n
            faces.append((a,b,b+n,a+n))
    faces.append(tuple(reversed(range(n))))
    faces.append(tuple((len(profile)-1)*n+j for j in range(n)))
    return mesh(name, verts, faces, mat)

lathe('Base ring', [(.378,0),(.408,.025),(.408,.09),(.389,.115)], lid_mat)
lathe('Faceted body', [(.365,.08),(.391,1.115)], body_mat, 16)

# Sixteen broad slats: shallow radial extrusion with softened end silhouettes.
for j in range(16):
    angle=2*math.pi*(j+.5)/16
    verts=[]
    for z,r,w in [(.13,.367,.025),(.16,.368,.038),
                  (1.07,.389,.038),(1.105,.390,.025)]:
        for radial,tangent in [(r-.02,-w),(r+.02,-w),(r+.02,w),(r-.02,w)]:
            verts.append((radial*math.cos(angle)-tangent*math.sin(angle),
                          radial*math.sin(angle)+tangent*math.cos(angle),z))
    faces=[(3,2,1,0),(12,13,14,15)]
    for k in range(3):
        for q in range(4):
            a=k*4+q; b=k*4+(q+1)%4
            faces.append((a,b,b+4,a+4))
    mesh('Vertical rib %02d'%j,verts,faces,rib_mat)

lathe('Upper collar',[(.391,1.075),(.418,1.095),(.418,1.15),(.397,1.16)],rib_mat)
# Broad, gently raised annular lid with a real opening and dark recessed interior.
lathe('Lid with opening',[(.403,1.14),(.452,1.155),(.46,1.18),
      (.46,1.225),(.44,1.25),(.20,1.30),(.137,1.30),
      (.125,1.285),(.125,1.16)],lid_mat)
lathe('Opening recess',[(.124,1.145),(.124,1.162)],inside_mat)

bpy.ops.object.select_all(action='DESELECT')
for obj in parts:
    obj.select_set(True)
bpy.context.view_layer.objects.active=parts[0]
bpy.ops.object.join()
obj=bpy.context.object
obj.name='TrashCan'
bpy.context.scene.cursor.location=(0,0,0)
bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
# Recalculate all face normals, retain flat shading, and triangulate for export.
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.normals_make_consistent(inside=False)
bpy.ops.mesh.quads_convert_to_tris(quad_method='BEAUTY',ngon_method='BEAUTY')
bpy.ops.object.mode_set(mode='OBJECT')
for poly in obj.data.polygons:
    poly.use_smooth=False
assert abs(obj.dimensions.z-1.3)<1e-6
assert min(v.co.z for v in obj.data.vertices)==0
assert obj.location.length==0
obj['height_m']=1.3
obj['origin']='Ground center; glTF Y-up; meters'
bpy.ops.export_scene.gltf(filepath=STAGE,export_format='GLB',use_selection=True,
    export_yup=True,export_extras=True,export_cameras=False,export_lights=False)
print('MODEL',len(obj.data.polygons),'triangles; dimensions',tuple(obj.dimensions))

# Reimport the actual exported file for visual QA.
bpy.data.objects.remove(obj,do_unlink=True)
bpy.ops.import_scene.gltf(filepath=STAGE)
scene=bpy.context.scene
scene.render.engine='CYCLES'
scene.cycles.samples=24
scene.cycles.use_denoising=True
scene.render.resolution_x=720
scene.render.resolution_y=800
scene.render.resolution_percentage=100
scene.world.color=(.55,.55,.55)
scene.view_settings.view_transform='Standard'
floor_mat=material('Preview ground','E8E1D5')
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.006))
bpy.context.object.data.materials.append(floor_mat)
bpy.ops.object.light_add(type='AREA',location=(-3,-4,7))
bpy.context.object.data.energy=500
bpy.context.object.data.shape='DISK'
bpy.context.object.data.size=4
bpy.ops.object.camera_add(location=(2.7,-4.2,2.7))
camera=bpy.context.object
camera.rotation_euler=(Vector((0,0,.65))-camera.location).to_track_quat('-Z','Y').to_euler()
camera.data.type='ORTHO'
camera.data.ortho_scale=1.9
scene.camera=camera
scene.render.filepath='/private/tmp/trash_can_preview.png'
bpy.ops.render.render(write_still=True)
