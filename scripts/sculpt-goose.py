"""Continuous Blender surface authoring for the Canada goose, in rig coordinates.

The organic shell is one connected, closed quad surface from tail to bill.
Material boundaries are markings on that surface, never overlapping chest/head
spheres. The two wings and articulated lower bill remain independent skins.
"""
import math
import bpy
import bmesh
from mathutils import Matrix, Vector

C = Matrix.Rotation(math.pi / 2, 4, 'X')


def rebuild_goose(rig):
    reference = bpy.data.objects['goose-black']
    transform = reference.matrix_world.copy()
    materials = {name: bpy.data.materials[name] for name in
                 ['goose-brown', 'goose-brown-light', 'goose-brown-dark', 'goose-black', 'goose-white', 'goose-highlight']}
    # Replace prototype geometry, including the fork-shaped feet. This only
    # operates on the fresh bootstrap import, never on the saved hand-edit file.
    for obj in list(bpy.context.scene.objects):
        if obj.type == 'MESH':
            bpy.data.objects.remove(obj, do_unlink=True)

    def mesh(name, points, faces, weights, slots, face_slots=None):
        data = bpy.data.meshes.new(name)
        data.from_pydata([C @ Vector(p) for p in points], [], faces)
        data.update()
        obj = bpy.data.objects.new(name, data)
        bpy.context.collection.objects.link(obj)
        obj.parent = rig
        obj.matrix_world = transform
        for slot in slots:
            data.materials.append(materials[slot])
        for polygon in data.polygons:
            polygon.use_smooth = True
            if face_slots:
                polygon.material_index = face_slots[polygon.index]
        groups = {bone: obj.vertex_groups.new(name=bone) for bone in {key for row in weights for key in row}}
        for index, row in enumerate(weights):
            total = sum(row.values())
            for bone, weight in row.items():
                if weight > .000001:
                    groups[bone].add([index], weight / total, 'REPLACE')
        modifier = obj.modifiers.new('Goose armature', 'ARMATURE')
        modifier.object = rig
        obj['surface_design'] = 'continuous-loft' if name == 'goose-shell' else 'tapered-surface'
        return obj

    def cubic(a, b, c, d, t):
        return .5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t)

    def sample(profile, u):
        i = min(int(u), len(profile)-2)
        t = min(1, u-i)
        a,b,c,d = [profile[max(0,min(len(profile)-1,j))] for j in [i-1,i,i+1,i+2]]
        return [cubic(a[k],b[k],c[k],d[k],t) for k in range(4)]

    # A shallow three-lobed fan, with webbing almost to the rounded toe tips.
    # Each foot and shin is one closed skin: no rods intersecting flat cutouts.
    outline = [(0,.032),(.025,.019),(.034,-.035),(.075,-.125),
               (.077,-.145),(.061,-.150),(.040,-.139),(.018,-.165),
               (0,-.176),(-.018,-.163),(-.040,-.139),(-.063,-.150),
               (-.079,-.140),(-.075,-.124),(-.031,-.030),(-.023,.017)]
    perimeter = []
    for i in range(len(outline)):
        for step in range(4):
            knots = [outline[j % len(outline)] for j in [i-1,i,i+1,i+2]]
            perimeter.append(tuple(cubic(*(p[k] for p in knots), step/4) for k in range(2)))
    # height, fan scale, round ankle radius, fore/aft center. Rounded edge rings
    # retain a flat sole; the upper rings narrow then gently swell into the leg.
    foot_profile = [(.025,.84,0,.060),(.030,1,0,.060),(.043,1,0,.060),
                    (.056,.78,.004,.061),(.073,.23,.013,.071),
                    (.096,0,.016,.077),(.135,0,.014,.072),
                    (.183,0,.019,.060),(.238,0,.026,.060)]
    for side,sign in [('left',-1),('right',1)]:
        verts,faces,weights = [],[],[]
        rows = (len(foot_profile)-1)*5+1
        sides = len(perimeter)
        for row in range(rows):
            y,fan,radius,z = sample(foot_profile,row/(rows-1)*(len(foot_profile)-1))
            fan,radius = max(0,fan),max(0,radius)
            leg = max(0,min(1,(y-.063)/.070)); leg = leg*leg*(3-2*leg)
            for px,pz in perimeter:
                length = math.hypot(px,pz)
                verts.append((sign*.1+px*fan+radius*px/length,y,z+pz*fan+radius*pz/length))
                weights.append({side+'_foot':1-leg,side+'_leg':leg})
        for row in range(rows-1):
            for j in range(sides):
                faces.append((row*sides+j,row*sides+(j+1)%sides,
                              (row+1)*sides+(j+1)%sides,(row+1)*sides+j))
        faces.extend([tuple(reversed(range(sides))),tuple((rows-1)*sides+j for j in range(sides))])
        foot = mesh('goose-'+side+'-foot',verts,faces,weights,['goose-black'])
        foot['surface_design'] = 'continuous-webbed-foot-and-ankle'
        bm = bmesh.new(); bm.from_mesh(foot.data)
        assert all(edge.is_manifold for edge in bm.edges), 'Foot must remain a closed skin'
        bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
        bm.to_mesh(foot.data); bm.free()

    # center Y/Z, lateral radius, perpendicular radius, deformation weights.
    profile = [
        (.405,.84,.005,.003, {'tail':1}),
        (.402,.73,.07,.019, {'tail':.9,'body':.1}),
        (.385,.54,.18,.088, {'tail':.35,'body':.65}),
        (.363,.32,.276,.174, {'body':1}),
        (.355,.085,.287,.204, {'body':1}),
        (.39,-.135,.234,.205, {'body':.65,'chest':.35}),
        (.478,-.235,.15,.135, {'body':.15,'chest':.65,'neck_1':.2}),
        (.594,-.295,.088,.078, {'chest':.25,'neck_1':.55,'neck_2':.2}),
        (.735,-.327,.061,.063, {'neck_2':.5,'neck_3':.5}),
        (.865,-.359,.056,.059, {'neck_3':.35,'neck_4':.65}),
        (.974,-.425,.059,.063, {'neck_4':.25,'neck_5':.75}),
        (1.06,-.505,.072,.071, {'neck_5':.3,'neck_6':.7}),
        (1.116,-.583,.091,.086, {'neck_6':.45,'head':.55}),
        (1.14,-.65,.101,.099, {'head':1}),
        (1.124,-.72,.078,.057, {'head':1}),
        (1.115,-.765,.065,.026, {'head':1}),
        (1.11,-.831,.058,.022, {'head':1}),
        (1.107,-.882,.023,.014, {'head':1}),
        (1.107,-.894,.001,.002, {'head':1}),
    ]
    radial = 48
    count = (len(profile)-1)*10+1
    vertices, weights, faces, face_slots = [],[],[],[]
    for ring in range(count):
        u = ring/(count-1)*(len(profile)-1)
        y,z,rx,rn = sample(profile,u)
        before = sample(profile,max(0,u-.001))
        after = sample(profile,min(len(profile)-1,u+.001))
        dy,dz = after[0]-before[0],after[1]-before[1]
        length = math.hypot(dy,dz)
        ny,nz = -dz/length,dy/length
        i = min(int(u),len(profile)-2)
        t = min(1,u-i)
        w = {key:profile[i][4].get(key,0)*(1-t)+profile[i+1][4].get(key,0)*t
             for key in profile[i][4].keys() | profile[i+1][4].keys()}
        for j in range(radial):
            angle = math.tau*j/radial
            vertices.append((rx*math.cos(angle),y+rn*math.sin(angle)*ny,z+rn*math.sin(angle)*nz))
            weights.append(w)
    # Retain the authored height envelope so cameras and existing rig scale agree.
    high = max(p[1] for p in vertices)
    vertices = [(x, y+(1.245-high)*max(0,(y-1.03)/(high-1.03)), z) for x,y,z in vertices]
    for ring in range(count-1):
        for j in range(radial):
            face = (ring*radial+j,ring*radial+(j+1)%radial,(ring+1)*radial+(j+1)%radial,(ring+1)*radial+j)
            faces.append(face)
            x,y,z = [sum(vertices[k][axis] for k in face)/4 for axis in range(3)]
            slot = 0
            if ring >= 75: slot = 1  # clean black neck marking, no raised collar
            face_slots.append(slot)
    faces.extend([tuple(reversed(range(radial))), tuple((count-1)*radial+j for j in range(radial))])
    face_slots.extend([0,1])
    # Cut the curved chinstrap boundary into the actual surface rather than
    # assigning whole quads (which gives the marking a visible stair-step edge).
    def cheek(p):
        return 1-((p[2]+.62)/.105)**2-((p[1]-1.085)/.060)**2
    cut_edges = {}
    def crossing(a,b):
        key = tuple(sorted((a,b)))
        if key not in cut_edges:
            va,vb = cheek(vertices[a]),cheek(vertices[b])
            t = va/(va-vb)
            cut_edges[key] = len(vertices)
            vertices.append(tuple(vertices[a][k]*(1-t)+vertices[b][k]*t for k in range(3)))
            weights.append({key:weights[a].get(key,0)*(1-t)+weights[b].get(key,0)*t
                            for key in weights[a].keys() | weights[b].keys()})
        return cut_edges[key]
    clipped,colors = [],[]
    for face,slot in zip(faces,face_slots):
        if slot != 1 or not any(cheek(vertices[k])>0 for k in face):
            clipped.append(face); colors.append(slot); continue
        for inside,color in [(True,2),(False,1)]:
            polygon = []
            for a,b in zip(face,face[1:]+face[:1]):
                aa,bb = cheek(vertices[a])>0,cheek(vertices[b])>0
                if aa == inside: polygon.append(a)
                if aa != bb: polygon.append(crossing(a,b))
            if len(polygon)>=3: clipped.append(tuple(polygon)); colors.append(color)
    faces,face_slots = clipped,colors
    shell = mesh('goose-shell',vertices,faces,weights,['goose-brown','goose-black','goose-white'],face_slots)
    # Correct orientation once, keeping a closed connected surface in the .blend.
    bm = bmesh.new(); bm.from_mesh(shell.data)
    assert all(edge.is_manifold for edge in bm.edges), 'Shell must remain one closed skin'
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(shell.data); bm.free()

    # Folded feather blades: thin at the root and pointed at the tip, with three
    # small edge lobes. Their planes unfold with the existing wing/wing-tip rig.
    for side,sign in [('left',-1),('right',1)]:
        verts,faces,weights = [],[],[]
        sections = 49
        for i in range(sections):
            t = i/(sections-1)
            z = -.19 + .87*t
            span = max(.002,.133*math.sin(math.pi*t)**.8*(1-.35*t))
            y = .415-.032*t
            x = sign*(.226+.055*math.sin(math.pi*t)-.055*t*t)
            for j in range(24):
                a = math.tau*j/24
                edge = 1+.055*math.sin(t*math.pi*7)**2 if t>.55 else 1
                verts.append((x+sign*.024*math.sin(math.pi*t)**.6*math.cos(a), y+span*math.sin(a)*edge, z))
                tip = max(0,min(1,(t-.38)/.48)); tip = tip*tip*(3-2*tip)
                weights.append({side+'_wing':1-tip,side+'_wing_tip':tip})
        for i in range(sections-1):
            for j in range(24):
                faces.append((i*24+j,i*24+(j+1)%24,(i+1)*24+(j+1)%24,(i+1)*24+j))
        faces.extend([tuple(reversed(range(24))),tuple((sections-1)*24+j for j in range(24))])
        wing = mesh('goose-'+side+'-wing',verts,faces,weights,['goose-brown'])
        bm = bmesh.new(); bm.from_mesh(wing.data)
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces)); bm.to_mesh(wing.data); bm.free()

    # Small independent jaw and eyes. Nothing overlays the neck/body transitions.
    def ellipsoid(name, center, scale, bone, slot):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12)
        obj = bpy.context.object
        points = [(center[0]+v.co.x*scale[0],center[1]+v.co.y*scale[1],center[2]+v.co.z*scale[2]) for v in obj.data.vertices]
        faces = [tuple(poly.vertices) for poly in obj.data.polygons]
        bpy.data.objects.remove(obj,do_unlink=True)
        return mesh(name,points,faces,[{bone:1} for _ in points],[slot])
    ellipsoid('goose-lower-bill',(0,1.082,-.789),(.064,.013,.1),'lower_bill','goose-black')
    for sign in [-1,1]:
        ellipsoid('goose-eye', (sign*.095,1.161,-.673),(.007,.011,.007),'head','goose-highlight')
    bpy.context.view_layer.objects.active = rig
