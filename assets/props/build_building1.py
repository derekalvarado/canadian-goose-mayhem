"""Rebuild the leftmost concept storefront: meters, ground-center origin, glTF Y-up."""
from pathlib import Path
import math
import bpy
from mathutils import Vector

OUT = Path(__file__).resolve().parent / 'building1.glb'
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
parts = []

def material(name, color):
    rgb = [int(color[i:i+2],16)/255 for i in (0,2,4)]
    rgb = [v/12.92 if v <= .04045 else ((v+.055)/1.055)**2.4 for v in rgb]
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*rgb,1)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*rgb,1)
    bsdf.inputs['Roughness'].default_value = 1
    return m

brick = material('Building brick','B77961')
bricklight = material('Building brick accent','C28B72')
stone = material('Building limestone','D6C9B5')
glass = material('Building glass','455D61')
frame = material('Building frames','866E57')
awning = material('Building awning','648A78')
seam = material('Building awning seams','567868')
roof = material('Building roof','85827C')

def mesh(name, verts, faces, mat):
    data = bpy.data.meshes.new(name)
    data.from_pydata(verts,[],faces)
    data.materials.append(mat)
    data.update()
    ob = bpy.data.objects.new(name,data)
    bpy.context.collection.objects.link(ob)
    parts.append(ob)
    return ob

def box(name, loc, size, mat):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc)
    ob = bpy.context.object
    ob.name=name
    ob.dimensions=size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    ob.data.materials.append(mat)
    parts.append(ob)
    return ob

def arch(name, x, y, bottom, spring, radius, depth, mat):
    outline=[(x-radius,bottom),(x+radius,bottom)]
    outline += [(x+radius*math.cos(i*math.pi/16),spring+radius*math.sin(i*math.pi/16)) for i in range(17)]
    n=len(outline)
    verts=[(a,y+d,b) for d in (0,depth) for a,b in outline]
    return mesh(name,verts,[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)],mat)

body = box('Terracotta masonry shell',(0,.8,18.6),(28,27.2,37.2),brick)
box('Stone foundation',(0,.8,.85),(28.6,27.8,1.7),stone)
# Four true arched recesses, with thick curved stone lintels and deep blue panes.
for i,x in enumerate((-9.9,-3.3,3.3,9.9)):
    cutter=arch('Window recess cutter',x,-13.3,21.8,30.6,1.75,1.2,glass)
    bpy.ops.object.select_all(action='DESELECT')
    cutter.select_set(True)
    bpy.context.view_layer.objects.active=cutter
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    bpy.context.view_layer.objects.active=body
    mod=body.modifiers.new('Recess','BOOLEAN'); mod.operation='DIFFERENCE'; mod.object=cutter
    bpy.ops.object.modifier_apply(modifier=mod.name)
    parts.remove(cutter); bpy.data.objects.remove(cutter,do_unlink=True)
    arch('Arched window pane',x,-12.15,21.85,30.6,1.72,.08,glass)
    for side in (-1,1):
        box('Window jamb',(x+side*1.86,-12.88,26.2),(.23,.38,8.8),frame)
    for k in range(12):
        a=k*math.pi/12; b=(k+1)*math.pi/12
        verts=[(x+r*math.cos(t),y,30.6+r*math.sin(t)) for y in (-13.18,-12.75) for r,t in [(1.75,a),(2.22,a),(2.22,b),(1.75,b)]]
        mesh('Cream arch voussoir',verts,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],stone)
    box('Stone window sill',(x,-13.03,21.75),(4.25,.8,.5),stone)
# Tall glazed shop bays and a central green door.
for x,w in [(-9.9,4.6),(-4.9,4.6),(4.9,4.6),(9.9,4.6)]:
    box('Shop window frame',(x,-12.95,8),(w,.4,12.5),frame)
    box('Shop glazing',(x,-13.18,8.25),(w-.55,.12,11.35),glass)
    box('Shop transom',(x,-13.28,12),(w-.35,.15,.28),frame)
box('Green entrance',(0,-13.02,7.5),(3.8,.4,13.3),seam)
box('Door glass',(0,-13.26,10),(2.9,.1,7),glass)
box('Door handle',(1.25,-13.42,6.5),(.14,.16,.8),stone)
for x in (-13.1,13.1):
    box('Brick storefront pier',(x,-13.0,9),(1.8,.5,18),brick)
    box('Pier foot',(x,-13.12,1.1),(2,.65,2.2),stone)
# Broad sage sloping canopy with a short scallop-free valance, as in the concept.
mesh('Green sloped canopy',[(-12.3,-12.9,18.3),(12.3,-12.9,18.3),(12.3,-15,15.2),(-12.3,-15,15.2),(-12.3,-15,14.5),(12.3,-15,14.5)],[(0,1,2,3),(3,2,5,4),(0,3,4),(1,5,2)],awning)
for x in [-12.3+i*2.46 for i in range(11)]:
    mesh('Awning panel seam',[(x-.045,-12.92,18.34),(x+.045,-12.92,18.34),(x+.045,-15,15.25),(x-.045,-15,15.25)],[(0,1,2,3)],seam)
box('Facade stone belt',(0,-12.98,19.7),(28.6,.65,.7),stone)
# Restrained masonry cues near the cornice and along the side walls.
for row,z in enumerate((34.5,36.0)):
    for i in range(10):
        x=-12.4+i*2.75+(row%2)*.6
        box('Broad brick accent',(x,-12.83,z),(1.5,.08,.55),bricklight)
for side in (-1,1):
    for y in (-7,3,11):
        box('Side window trim',(side*14.04,y,25),(.18,3.8,7),frame)
        box('Side window glass',(side*14.15,y,25),(.08,3.2,6.4),glass)
    box('Side stone belt',(side*14.18,.8,19.7),(.5,27.6,.7),stone)
# Recessed roof and continuous raised parapet with layered cream coping.
box('Flat inset roof',(0,.8,37.25),(26.7,25.9,.3),roof)
for x in (-14.05,14.05):
    box('Side parapet',(x,.8,38.4),(.7,28.4,2.4),brick)
    box('Side coping',(x,.5,39.6),(1.9,25.4,.8),stone)
for y in (-13.1,14.1):
    box('End parapet',(0,y,38.4),(28.5,.8,2.4),brick)
    box('End coping',(0,y,39.6),(30,1.8,.8),stone)
for x in (-11,-7,7,11):
    box('Cornice brackets',(x,-13.28,37.9),(.95,.8,1.25),stone)

bpy.ops.object.select_all(action='DESELECT')
for ob in parts: ob.select_set(True)
bpy.context.view_layer.objects.active=body
bpy.ops.object.join()
ob=bpy.context.object; ob.name='Building1'
bpy.context.scene.cursor.location=(0,0,0)
bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.normals_make_consistent(inside=False)
bpy.ops.mesh.quads_convert_to_tris(quad_method='BEAUTY',ngon_method='BEAUTY')
bpy.ops.object.mode_set(mode='OBJECT')
# Uniformly resize the authored geometry; bake scale into the exported asset.
ob.scale = (.23, .23, .23)
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
assert all(abs(a-b)<.001 for a,b in zip(ob.dimensions,(6.9,6.9,9.2))),tuple(ob.dimensions)
ob['dimensions_m']='6.9 wide x 6.9 deep x 9.2 tall'
ob['front']='glTF +Z'; ob['origin']='ground center'
bpy.ops.export_scene.gltf(filepath=str(OUT),export_format='GLB',use_selection=True,export_yup=True,export_extras=True)
print('BUILDING',tuple(ob.dimensions),len(ob.data.polygons),'triangles')
bpy.data.objects.remove(ob,do_unlink=True)
bpy.ops.import_scene.gltf(filepath=str(OUT))
scene=bpy.context.scene
scene.render.engine='CYCLES'; scene.cycles.samples=24
scene.render.resolution_x=850; scene.render.resolution_y=950
scene.render.resolution_percentage=100
scene.world.color=(.7,.7,.7)
scene.view_settings.view_transform='Standard'
box('Preview ground',(0,0,-.2),(2000,2000,.3),material('Preview cream','E8E1D5'))
bpy.ops.object.light_add(type='AREA',location=(-35,-50,85))
bpy.context.object.data.energy=65000; bpy.context.object.data.size=45
bpy.ops.object.camera_add(location=(-14.95,-20.7,14.95))
cam=bpy.context.object
cam.rotation_euler=(Vector((0,0,4.37))-cam.location).to_track_quat('-Z','Y').to_euler()
cam.data.type='ORTHO'; cam.data.ortho_scale=14.49; scene.camera=cam
scene.render.filepath='/private/tmp/building1_preview.png'
bpy.ops.render.render(write_still=True)
