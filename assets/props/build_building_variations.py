"""Build four companion storefronts. Run with Blender --background --python.
Palette matches building1; exterior-only GLBs in meters, Y-up, front +Z.
"""
from pathlib import Path
import math
import bpy
from mathutils import Vector

OUT = Path(__file__).resolve().parent
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
parts = []

def material(name, color):
    rgb = [int(color[i:i+2], 16)/255 for i in (0,2,4)]
    rgb = [v/12.92 if v <= .04045 else ((v+.055)/1.055)**2.4 for v in rgb]
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*rgb, 1)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*rgb, 1)
    bsdf.inputs['Roughness'].default_value = 1
    return m

brick = material('Building brick', 'B77961')
accent = material('Building brick accent', 'C28B72')
stone = material('Building limestone', 'D6C9B5')
glass = material('Building glass', '455D61')
frame = material('Building frames', '866E57')
green = material('Building awning', '648A78')
darkgreen = material('Building awning seams', '567868')
roof = material('Building roof', '85827C')

def mesh(name, verts, faces, mat):
    data = bpy.data.meshes.new(name)
    data.from_pydata(verts, [], faces)
    data.materials.append(mat)
    data.update()
    ob = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(ob)
    parts.append(ob)
    return ob

def box(name, loc, size, mat):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    ob = bpy.context.object
    ob.name = name
    ob.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    ob.data.materials.append(mat)
    parts.append(ob)
    return ob

def normals(ob):
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode='OBJECT')

def arch(name, x, y, bottom, spring, radius, depth, mat):
    outline = [(x-radius,bottom), (x+radius,bottom)]
    outline += [(x+radius*math.cos(i*math.pi/16), spring+radius*math.sin(i*math.pi/16)) for i in range(17)]
    n = len(outline)
    return mesh(name, [(a,y+d,b) for d in (0,depth) for a,b in outline],
        [tuple(reversed(range(n))),tuple(range(n,2*n))] + [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)], mat)

def window(body, x, bottom, spring, r, mullion=False):
    cutter = arch('Temporary recess', x, -3.3, bottom, spring, r, .6, glass)
    normals(cutter)
    bpy.context.view_layer.objects.active = body
    mod = body.modifiers.new('Arched recess', 'BOOLEAN')
    mod.operation = 'DIFFERENCE'; mod.object = cutter
    bpy.ops.object.modifier_apply(modifier=mod.name)
    parts.remove(cutter); bpy.data.objects.remove(cutter, do_unlink=True)
    arch('Recessed arched glazing',x,-2.72,bottom+.015,spring,r-.02,.025,glass)
    for side in (-1,1):
        box('Window stone jamb',(x+side*(r+.05),-3.14,(bottom+spring)/2),(.1,.16,spring-bottom),stone)
    for k in range(12):
        a=k*math.pi/12; b=(k+1)*math.pi/12
        verts=[(x+rr*math.cos(t),y,spring+rr*math.sin(t)) for y in (-3.24,-3.06) for rr,t in [(r,a),(r+.14,a),(r+.14,b),(r,b)]]
        mesh('Cream curved lintel',verts,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],stone)
    box('Projecting sill',(x,-3.17,bottom),(2*r+.2,.32,.12),stone)
    if mullion:
        box('Window mullion',(x,-2.81,(bottom+spring)/2),(.07,.09,spring-bottom),frame)
        box('Window transom',(x,-2.81,spring-.45),(2*r,.09,.07),frame)

def canopy(x, width, height=3.8, striped=False):
    n=10
    for i in range(n):
        left=x-width/2+width*i/n; right=left+width/n
        mat=stone if striped and i%2 else green
        mesh('Canvas canopy panel',[(left,-3.2,height),(right,-3.2,height),(right,-3.72,height-.55),(left,-3.72,height-.55),
             (left,-3.72,height-.72),(right,-3.72,height-.72)],[(0,1,2,3),(3,2,5,4),(0,3,4),(1,5,2)],mat)

def shop(x, width, door=False):
    box('Shop frame',(x,-3.16,1.7),(width,.16,2.9),darkgreen if door else frame)
    box('Shop glass',(x,-3.26,1.85),(width-.18,.04,2.38),glass)
    box('Shop transom',(x,-3.3,2.65),(width-.12,.06,.09),frame)
    if door:
        box('Door kickplate',(x,-3.3,.4),(width-.12,.06,.38),darkgreen)
        box('Brass handle',(x+width*.3,-3.34,1.4),(.05,.07,.22),stone)

def build(number, width, height, style):
    parts.clear()
    body=box('Brick shell',(0,0,(height-.55)/2),(width,6.2,height-.55),green if style=='townhouse' else (accent if style=='paired' else brick))
    box('Limestone foundation',(0,0,.16),(width+.12,6.32,.32),stone)
    box('Inset flat roof',(0,0,height-.52),(width-.25,5.95,.12),roof)
    for y in (-3.04,3.04):
        box('Parapet wall',(0,y,height-.36),(width,.2,.48),brick)
        box('Cream coping',(0,y,height-.06),(width+.3,.35,.12),stone)
    for x in (-width/2,width/2):
        box('Side parapet',(x,0,height-.36),(.18,5.88,.48),brick)
        box('Side coping',(x,0,height-.06),(.3,5.73,.12),stone)
        box('Side belt',(x,0,4),(.18,6.25,.16),stone)
        for y in (-1.8, .6, 2.1):
            box('Side window frame',(x,y,5.6),(.16,.78,1.65),frame)
            box('Side glazing',(x+(.095 if x>0 else -.095),y,5.6),(.04,.65,1.48),glass)
    box('Floor belt',(0,-3.14,4),(width+.18,.24,.17),stone)
    for x in (-width/2+.16,width/2-.16):
        box('Corner pilaster',(x,-3.14,1.95),(.3,.2,3.9),accent)
        box('Corner stone base',(x,-3.18,.28),(.38,.25,.56),stone)
    if style=='cafe':
        for x in (-2,0,2): window(body,x,4.75,6.65,.62,True)
        shop(-2.05,1.4,True); shop(-.25,1.8); shop(1.95,1.8)
        canopy(.25,5.8,striped=True)
        # Small central stepped crest and inset sign panel.
        box('Raised parapet crest',(0,-3.02,height+.15),(2.8,.26,.65),brick)
        box('Crest cap',(0,-3.02,height+.49),(3,.4,.12),stone)
        box('Crest inset',(0,-3.19,height+.12),(1.65,.05,.28),stone)
    elif style=='paired':
        for center in (-2,0,2):
            for offset in (-.42,.42): window(body,center+offset,4.7,6.95,.3)
        for x in (-2,2): shop(x,2.5)
        box('Shop signboard',(0,-3.22,3.58),(5.6,.15,.52),darkgreen)
        box('Signboard inset',(0,-3.31,3.58),(5.25,.04,.3),stone)
        shop(0,1.05,True)
        box('Door lintel',(0,-3.2,3.25),(1.4,.28,.2),stone)
        for x in (-2,0,2):
            box('Cornice panel',(x,-3.14,height-.8),(1.3,.13,.25),accent)
    elif style=='arcade':
        for x in (-2.25,0,2.25): window(body,x,4.7,6.45,.65,True)
        # Broad masonry arcade on the ground floor, with a centered glazed door.
        for x in (-2.25,0,2.25):
            window(body,x,.35,2.45,.83,True)
        box('Entrance bottom',(0,-2.86,.52),(1.5,.08,.32),darkgreen)
        box('Entrance handle',(.48,-2.92,1.35),(.05,.07,.22),stone)
        canopy(0,2.02,3.65)
        box('Upper cornice',(0,-3.22,height-.55),(width+.2,.3,.18),stone)
        for x in (-2.9,-1.8,-.6,.6,1.8,2.9):
            box('Cornice corbel',(x,-3.21,height-.78),(.2,.25,.38),stone)
    else:
        for bottom,spring in ((4.6,5.55),(6.8,7.75)):
            for x in (-1.8,0,1.8): window(body,x,bottom,spring,.47)
        box('Second floor belt',(0,-3.15,6.35),(width+.15,.23,.12),stone)
        for x in (-1.8,1.8):
            window(body,x,.95,2.6,.55,True)
            for side in (-1,1):
                box('Wooden shutter',(x+side*.82,-3.2,1.95),(.36,.12,1.95),darkgreen)
        shop(0,1.35,True)
        box('Stone door lintel',(0,-3.22,3.24),(1.65,.3,.2),stone)
        box('Doorstep',(0,-3.4,.1),(1.7,.6,.2),stone)
        for x in (-width/2+.35,width/2-.35):
            box('Parapet end post',(x,-3.05,height+.12),(.55,.4,.35),brick)
            box('Post cap',(x,-3.05,height+.32),(.7,.52,.12),stone)
    # Sparse broad brick accents, not a noisy tiled texture.
    for x in [-width/2+.65+i*.7 for i in range(int((width-1)/.7))]:
        box('Cornice brick accent',(x,-3.12,height-.65),(.4,.07,.13),accent)
    bpy.ops.object.select_all(action='DESELECT')
    for ob in parts: ob.select_set(True)
    bpy.context.view_layer.objects.active=body
    bpy.ops.object.join()
    ob=bpy.context.object; ob.name=f'Building{number}'
    bpy.context.scene.cursor.location=(0,0,0)
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    normals(ob)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.quads_convert_to_tris(quad_method='BEAUTY',ngon_method='BEAUTY')
    bpy.ops.object.mode_set(mode='OBJECT')
    ob['style']=style; ob['front']='glTF +Z'; ob['origin']='ground center; meters'
    ob['dimensions_m']=list(ob.dimensions)
    bpy.ops.export_scene.gltf(filepath=str(OUT/f'building{number}.glb'),export_format='GLB',use_selection=True,export_yup=True,export_extras=True)
    print('EXPORTED',number,tuple(ob.dimensions),len(ob.data.polygons),'triangles')
    bpy.data.objects.remove(ob,do_unlink=True)

for args in [(2,6.6,8.2,'cafe'),(3,6.6,8.8,'paired'),(4,7.4,8.4,'arcade'),(5,6,9,'townhouse')]:
    build(*args)

# Inspect the actual exports together, rather than rendering pre-export meshes.
for number,x in [(2,-12),(3,-4),(4,4),(5,12)]:
    bpy.ops.import_scene.gltf(filepath=str(OUT/f'building{number}.glb'))
    for ob in bpy.context.selected_objects:
        if ob.parent is None: ob.location.x+=x
scene=bpy.context.scene
scene.render.engine='CYCLES'; scene.cycles.samples=32
scene.render.resolution_x=2000; scene.render.resolution_y=850
scene.render.resolution_percentage=100
scene.world.color=(.7,.7,.7)
scene.view_settings.view_transform='Standard'
box('Preview ground',(0,0,-.12),(2000,2000,.2),material('Preview cream','E8E1D5'))
bpy.ops.object.light_add(type='AREA',location=(-20,-35,55))
bpy.context.object.data.energy=40000; bpy.context.object.data.size=35
bpy.ops.object.camera_add(location=(-12,-50,24))
cam=bpy.context.object
cam.rotation_euler=(Vector((0,0,4))-cam.location).to_track_quat('-Z','Y').to_euler()
cam.data.type='ORTHO'; cam.data.ortho_scale=36; scene.camera=cam
scene.render.filepath='/private/tmp/building_variations_preview.png'
bpy.ops.render.render(write_still=True)
