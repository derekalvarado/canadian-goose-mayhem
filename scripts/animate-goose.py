"""Author Blender actions on the existing goose; export the selected rig as GLB.

Run with Blender --background --python scripts/animate-goose.py.
The original goose.blend is preserved; goose-animated.blend is the new source.
Pass -- --export-only to export hand-edited actions without regenerating them.
"""
from pathlib import Path
import math
import sys
import subprocess
import tempfile
import bpy
from mathutils import Matrix, Vector, Euler

ROOT = Path(__file__).resolve().parents[1]
ASSET = ROOT / "assets/characters/goose"
SOURCE = ASSET / "goose-animated.blend"
OUTPUT = ASSET / "models/canada-goose.glb"
FPS = 60
# glTF Y-up -> Blender Z-up. All authored poses below use game coordinates.
C = Matrix.Rotation(math.pi / 2, 4, 'X')


def export():
    bpy.ops.object.select_all(action='DESELECT')
    armatures = [obj for obj in bpy.context.scene.objects if obj.type == 'ARMATURE']
    for obj in bpy.context.scene.objects:
        if obj in armatures or (obj.type == 'MESH' and any(
                modifier.type == 'ARMATURE' and modifier.object in armatures for modifier in obj.modifiers)):
            obj.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=str(OUTPUT), export_format='GLB', use_selection=True,
        export_animations=True, export_animation_mode='ACTIONS',
        export_force_sampling=True, export_frame_step=1,
        export_anim_slide_to_zero=True, export_skins=True, export_morph=True,
        export_extras=True, export_rest_position_armature=True,
    )


if '--export-only' in sys.argv:
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
    export()
    sys.exit(0)

bpy.ops.wm.read_factory_settings(use_empty=True)
# Regeneration starts from the geometry recipe, never a previously skinned export.
with tempfile.TemporaryDirectory(prefix='goose-animation-') as temp:
    seed = str(Path(temp) / 'seed.glb')
    subprocess.run(['node', str(ROOT / 'scripts/generate-goose-glb.mjs'), seed], check=True, cwd=ROOT)
    bpy.ops.import_scene.gltf(filepath=seed)
rig = next(o for o in bpy.context.scene.objects if o.type == 'ARMATURE')
rig.animation_data_clear()
for action in list(bpy.data.actions):
    bpy.data.actions.remove(action)
for bone in rig.pose.bones:
    bone.matrix_basis.identity()

# Separate ankles keep the broad webbing level while the shins swing.
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode='EDIT')
for side, x in [('left', -0.1), ('right', 0.1)]:
    name = side + '_foot'
    bone = rig.data.edit_bones.get(name) or rig.data.edit_bones.new(name)
    bone.head = C @ Vector((x, 0.045, 0.06))
    bone.tail = C @ Vector((x, 0.045, -0.09))
    # Root-space feet avoid shear inherited from the stretching shin.
    bone.parent = rig.data.edit_bones['root']
tail = rig.data.edit_bones.get('tail') or rig.data.edit_bones.new('tail')
tail.head = C @ Vector((0, 0.4, 0.43))
tail.tail = C @ Vector((0, 0.4, 0.7))
tail.parent = rig.data.edit_bones['body']
bpy.ops.object.mode_set(mode='OBJECT')

black = bpy.data.objects['goose-black']
for side in ['left', 'right']:
    leg = black.vertex_groups[side + '_leg']
    foot = black.vertex_groups.get(side + '_foot') or black.vertex_groups.new(name=side + '_foot')
    for vertex in black.data.vertices:
        weights = {g.group: g.weight for g in vertex.groups}
        if leg.index not in weights:
            continue
        # Mesh positions are in the original unscaled armature space.
        height = (C.inverted() @ vertex.co).y
        amount = max(0, min(1, (0.105 - height) / 0.045))
        if amount > 0:
            weight = weights[leg.index]
            foot.add([vertex.index], weight * amount, 'REPLACE')
            leg.add([vertex.index], weight * (1 - amount), 'REPLACE')
dark = bpy.data.objects['goose-brown-dark']
tail_group = dark.vertex_groups.get('tail') or dark.vertex_groups.new(name='tail')
for group in list(dark.vertex_groups):
    if group != tail_group:
        dark.vertex_groups.remove(group)
tail_group.add(list(range(len(dark.data.vertices))), 1, 'REPLACE')

# Build the continuous Blender-authored body/head/neck and tapered feather blades.
import importlib.util
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('sculpt_goose', ROOT / 'scripts/sculpt-goose.py')
sculpt = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sculpt)
sculpt.rebuild_goose(rig)

rest = {b.name: b.matrix_local.copy() for b in rig.data.bones}
for bone in rig.pose.bones:
    bone.rotation_mode = 'QUATERNION'
scene = bpy.context.scene
scene.render.fps = FPS
rig.animation_data_create()


def pose(name, angles=(0, 0, 0), offset=(0, 0, 0)):
    """Apply a game-axis local delta independent of Blender's bone roll."""
    basis = rest[name].to_3x3().to_4x4()
    delta = Matrix.Translation(C.to_3x3() @ Vector(offset))
    delta @= C @ Euler(angles, 'XYZ').to_matrix().to_4x4() @ C.inverted()
    rig.pose.bones[name].matrix_basis = basis.inverted() @ delta @ basis


def foot_target(side, z, lift, pitch=0):
    """Bake ankle targets in armature space; compensate body bob and roll."""
    foot_name = side + '_foot'
    leg_name = side + '_leg'
    bpy.context.view_layer.update()
    hip = C.inverted() @ rig.pose.bones[leg_name].head
    x = -0.1 if side == 'left' else 0.1
    ankle = Vector((x, 0.045 + lift, 0.06 + z))
    direction = ankle - hip
    # A short stylized shin stretches slightly at the ends of the stride.
    angle = math.atan2(-direction.z, -direction.y)
    desired = Matrix.Translation(C @ hip) @ C @ Euler((angle, 0, 0)).to_matrix().to_4x4()
    desired @= C.inverted() @ rest[leg_name].to_3x3().to_4x4()
    desired @= Matrix.Diagonal((1, direction.length / 0.185, 1, 1))
    rig.pose.bones[leg_name].matrix = desired
    bpy.context.view_layer.update()
    rig.pose.bones[foot_name].matrix = (Matrix.Translation(C @ ankle) @ C
        @ Euler((pitch, .09 if side == 'left' else -.09, 0)).to_matrix().to_4x4() @ C.inverted()
        @ rest[foot_name].to_3x3().to_4x4())


def ease(x):
    x = max(0, min(1, x))
    return x*x*(3-2*x)


def envelope(t, knots):
    for (a, av), (b, bv) in zip(knots, knots[1:]):
        if t <= b:
            return av + (bv-av)*ease((t-a)/(b-a))
    return knots[-1][1]


# Hurry and sneak keep the shared rocking; the walk waddles. Its rump swivels
# around the chest (yaw_pivot meters ahead of the hips) under a steady neck,
# and the tail swings wide a beat behind with a flick at each footfall.
# Tune variants in assets/characters/goose/anim-lab.html (src/dev/gooseLab).
SWAY = dict(body_yaw=0.015, body_roll=0.045, body_sway=0.012, yaw_pivot=0, chest_counter_yaw=0,
            tail_yaw=0.04, tail_lag=0.5, tail_roll=0, tail_flick=0)
WADDLE = dict(SWAY, body_yaw=0.08, body_roll=0.07, body_sway=0.02, yaw_pivot=0.26, chest_counter_yaw=1,
              tail_yaw=0.16, tail_lag=1.1, tail_roll=0.05, tail_flick=0.03)


def gait(t, duration, running=False, sneaking=False):
    phase = t / duration
    wave = math.tau * phase
    s = SWAY if running or sneaking else WADDLE
    bob = (0.012 if sneaking else 0.022 if running else 0.013) * (1-math.cos(2*wave))
    lean = -0.12 if running else -0.065 if sneaking else -0.025
    yaw = s['body_yaw']*math.sin(wave)
    pose('body', (lean, yaw, s['body_roll']*math.cos(wave)),
         (s['body_sway']*math.cos(wave) + s['yaw_pivot']*math.sin(yaw), bob - (0.026 if sneaking else 0), 0))
    pose('chest', (-lean*0.4, -yaw*s['chest_counter_yaw'], -0.014*math.cos(wave)))
    for i in range(1, 7):
        # The neck stabilizes the head; each joint follows a little later.
        pose('neck_' + str(i), ((0.008 if sneaking else 0.014)*math.sin(2*wave-i*0.32)
             + (-0.035 if running else -0.04 if sneaking and i < 4 else 0), 0,
             -0.006*math.cos(wave-i*0.2)))
    pose('head', (0.04 if running else 0.015, 0.015*math.sin(wave-0.5), 0))
    swing = math.sin(wave-s['tail_lag'])
    pose('tail', (0.035*math.sin(2*wave-0.7),
                  s['tail_yaw']*swing + s['tail_flick']*math.sin(2*wave-2*s['tail_lag']),
                  s['tail_roll']*swing))
    for side, sign, shift in [('left', -1, 0), ('right', 1, 0.5)]:
        p = (phase+shift) % 1
        stance = 0.56 if not running else 0.48
        reach = 0.23 if running else 0.17 if sneaking else 0.2
        if p <= stance:
            z = -reach + 2*reach*p/stance
            lift = 0
            pitch = 0
        else:
            swing = (p-stance)/(1-stance)
            # Hermite return: same rearward velocity on lift-off and touchdown.
            tangent = 2*reach*(1-stance)/stance
            z = ((2*swing**3-3*swing**2+1)*reach
                 + (swing**3-2*swing**2+swing)*tangent
                 + (-2*swing**3+3*swing**2)*-reach
                 + (swing**3-swing**2)*tangent)
            lift = (0.1 if running else 0.055 if sneaking else 0.075)*math.sin(math.pi*swing)**2
            pitch = -0.3*math.sin(math.tau*swing)*math.sin(math.pi*swing)
        foot_target(side, z, lift, pitch)
        pose(side+'_wing', (-0.035 + 0.018*math.sin(2*wave-0.6),
             sign*0.015*math.sin(wave-0.5), sign*(-0.025-0.014*math.sin(2*wave-0.7))))
        pose(side+'_wing_tip', (0.018*math.sin(2*wave-1.1), 0, sign*0.012*math.sin(wave-0.9)))


def idle(t):
    w = math.tau*t/4.8
    pose('body', (0.003*math.sin(w), 0, 0.006*math.sin(w)), (0, 0.004*(1-math.cos(w)), 0))
    pose('chest', (0.005*math.sin(w-0.2), 0, 0))
    pose('neck_4', (0.009*math.sin(w), 0.025*math.sin(w), 0))
    pose('head', (0.012*math.sin(w), 0.085*math.sin(w), 0.012*math.sin(w)))
    pose('tail', (0.012*math.sin(w-0.5), 0.02*math.sin(w), 0))
    foot_target('left', 0, 0)
    foot_target('right', 0, 0)


def gesture(name, t):
    if name in {'wing_flap', 'wing_flutter'}:
        duration = 1.6 if name == 'wing_flap' else .65
        phase = t / duration
        # A quick downstroke, a delayed tip, then a soft recovery and pause.
        # Flutter adds a second small stroke during the usual recovery.
        flap = envelope(phase, [(0,0),(.16,.22),(.29,-.3),(.53,.13),(.78,0),(1,0)])
        tip = envelope(phase, [(0,0),(.23,.15),(.38,-.24),(.65,.1),(.92,0),(1,0)])
        if name == 'wing_flutter':
            flap += .12*math.sin(phase*math.tau*2)*math.sin(phase*math.pi)**2
        for side, sign in [('left', -1), ('right', 1)]:
            asymmetry = 1 if side == 'left' else .87
            pose(side+'_wing', (flap*.65*asymmetry,sign*flap*asymmetry,sign*flap*.3))
            pose(side+'_wing_tip', (tip*.5,sign*tip,sign*tip*.2))
    elif name == 'honk':
        a = envelope(t, [(0,0),(.1,-.23),(.21,1),(.42,.8),(.62,.3),(.86,0)])
        pose('lower_bill', (max(0,a)*0.42,0,0))
        pose('head', (-a*.13,0,0))
        pose('neck_3', (-a*.035,0,0))
        pose('neck_5', (-a*.05,0,0))
    elif name == 'grab':
        a = envelope(t, [(0,0),(.08,-.08),(.24,1),(.32,.9),(.62,0)])
        for i, angle in enumerate([-.32,-.2,-.06,.22,.22,.16], 1):
            pose('neck_'+str(i), (angle*a,0,0))
        pose('head', (.18*a,0,0))
        pose('lower_bill', (.18*envelope(t, [(0,0),(.12,1),(.25,1),(.34,0),(.62,0)]),0,0))
    elif name == 'aggressive':
        a = envelope(t, [(0,0),(.12,-.08),(.48,1.06),(.7,1),(.85,1)])
        for i, angle in enumerate([-.8,-.5,-.1,.55,.55,.4], 1):
            pose('neck_'+str(i), (angle*a,0,0))
        pose('head', (.35*a,0,0))
        for side, sign in [('left', -1), ('right', 1)]:
            pose(side+'_wing', (-.06*a,sign*.11*a,-sign*.06*a))
    elif name == 'wings_spread':
        a = envelope(t, [(0,0),(.1,-.07),(.48,1.04),(.72,.97),(.94,1)])
        b = envelope(t, [(0,0),(.2,0),(.6,1.07),(.8,.98),(.94,1)])
        for side, sign in [('left', -1), ('right', 1)]:
            pose(side+'_wing', (-.66*a,sign*1.5*a,sign*.15*a))
            pose(side+'_wing_tip', (-.19*b,sign*.24*b,sign*.09*b))
        pose('neck_1', (-.04*a,0,0))
    elif name == 'spooked':
        a = envelope(t, [(0,0),(.1,1),(.27,.6),(.5,.18),(.95,0)])
        flutter = math.sin(t*math.tau*5)*a
        pose('chest', (.12*a,0,.045*flutter))
        pose('neck_1', (.3*a,0,0))
        pose('neck_2', (-.23*a,0,0))
        pose('head', (-.16*a,.14*flutter,0))
        for side, sign in [('left', -1), ('right', 1)]:
            pose(side+'_wing', (-.3*a+.04*flutter,sign*.58*a,sign*.12*a))
            pose(side+'_wing_tip', (-.1*flutter,sign*.14*a,0))
        pose('tail', (.12*a,0,0))


clips = [('idle',4.8),('walk',.72),('hurry',.5),('sneak',.96),
         ('honk',.86),('grab',.62),('aggressive',.85),('wings_spread',.94),('spooked',.95),
         ('wing_flap',1.6),('wing_flutter',.65)]
for name, duration in clips:
    action = bpy.data.actions.new(name)
    action.use_fake_user = True
    rig.animation_data.action = action
    frames = round(duration*FPS)
    for frame in range(frames+1):
        scene.frame_set(frame)
        for bone in rig.pose.bones:
            bone.matrix_basis.identity()
        t = frame/frames*duration
        if name == 'idle':
            idle(t)
        elif name in {'walk','hurry','sneak'}:
            gait(t,duration,name=='hurry',name=='sneak')
        else:
            gesture(name,t)
        for bone in rig.pose.bones:
            for prop in ['location','rotation_quaternion','scale']:
                bone.keyframe_insert(data_path=prop,frame=frame,group=bone.name)
    # Dense smooth sampled poses retain the authored trajectories through glTF.
    for layer in action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                for curve in bag.fcurves:
                    for key in curve.keyframe_points:
                        key.interpolation = 'LINEAR'

rig.animation_data.action = None
for bone in rig.pose.bones:
    bone.matrix_basis.identity()
scene.frame_set(0)
scene['animation_workflow'] = 'Blender authored, 60 Hz baked poses; in-place gameplay animation'
scene['runtime_export'] = 'models/canada-goose.glb'
rig['source'] = 'assets/characters/goose/goose-animated.blend'
scene.unit_settings.system = 'METRIC'
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE))
export()
print('Saved authored goose source and runtime clips')
