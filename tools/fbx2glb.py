# Blender headless FBX -> GLB converter (UE cm scale -> metres, height ~1.78m).
# Optionally decimates meshes to keep the web asset small.
# Usage:
#   blender --background --python tools/fbx2glb.py -- public/models/survival_character.fbx public/models/survival_character.glb 0.3 2000
#   (ratio 0.3 = keep 30% of triangles on meshes >2000 verts; omit ratio for full-res)
# Note: if your distro Blender is broken (missing libMaterialX v1.39.46 symbols),
# bootstrap the runtime first, e.g.:
#   LD_PRELOAD=/tmp/libmx_shim.so blender --background --python tools/fbx2glb.py -- ...
import sys, pathlib, bpy

argv = sys.argv
argv = argv[argv.index("--") + 1:] if "--" in argv else []
src = pathlib.Path(argv[0]) if len(argv) > 0 else pathlib.Path("public/models/survival_character.fbx")
dst = pathlib.Path(argv[1]) if len(argv) > 1 else pathlib.Path("public/models/survival_character.glb")
ratio = float(argv[2]) if len(argv) > 2 else 0.0      # decimation ratio (0 = no decimate)
keep_verts = int(argv[3]) if len(argv) > 3 else 2000  # meshes under this stay untouched
dst.parent.mkdir(parents=True, exist_ok=True)

# Make sure the bundled FBX importer / glTF exporter addons are registered.
try:
    import addon_utils
    addon_utils.enable("io_scene_fbx", default_set=True)
    addon_utils.enable("io_scene_gltf2", default_set=True)
except Exception as e:
    print("[fbx2glb] addon enable warning:", e)

bpy.ops.wm.read_factory_settings(use_empty=True)

# FBX from Unreal/Fab is authored in cm; Three.js units are metres.
print("[fbx2glb] importing", src)
try:
    bpy.ops.import_scene.fbx(filepath=str(src))
except Exception as e:
    print("[fbx2glb] FBX import FAILED:", e)
    raise SystemExit(1)

print(f"[fbx2glb] imported {len(bpy.data.objects)} objects, ",
      f"{len(bpy.data.meshes)} meshes, {len(bpy.data.materials)} materials")
print("[fbx2glb] object names:", [o.name for o in bpy.data.objects][:40])

# Scale EVERYTHING (armature + meshes) uniformly at the OBJECT level — never
# transform_apply. Baking transforms into meshes/armature desynchronises the
# bone rest pose from the mesh bind pose (skin bindings then render at the
# wrong scale). Object-level scaling keeps them consistent, and the glTF
# exporter writes node scales out fine.
import mathutils

def world_bbox_meshes():
    mins = [float("inf")] * 3
    maxs = [-float("inf")] * 3
    for o in bpy.data.objects:
        if o.type != "MESH":
            continue
        m = o.matrix_world
        for v in o.data.vertices:  # real vertex coords (bound_box cache is stale after data edits)
            p = m @ v.co
            for i in range(3):
                mins[i] = min(mins[i], p[i])
                maxs[i] = max(maxs[i], p[i])
    if mins[0] == float("inf"):
        return None
    return mins, maxs

def dump_mesh_heights(tag):
    hs = []
    for o in bpy.data.objects:
        if o.type == "MESH":
            zs = [v.co.z for v in o.data.vertices]
            hs.append(f"{o.name}:{(max(zs)-min(zs)):.2f}")
    print(f"[fbx2glb] mesh data Z-heights [{tag}]:", " ".join(hs))

dump_mesh_heights("after-import")

box = world_bbox_meshes()

# ---------------------------------------------------------------------------
# Normalise by baking ONE transform matrix into the DATA of everything
# (armature bone rest positions AND mesh vertices). Object-level scaling
# leaves the armature/mesh object transforms in play, which the glTF exporter
# then represents as node scales — a scheme three.js skinned rendering is
# fragile about (bind vs rest space mismatches). Baked data + identity node
# transforms is the bullet-proof layout.
#
# After import from UE FBX: armature object carries scale 0.01 (cm->m), mesh
# objects scale 1 parented under the armature, all data in cm. We flatten to:
#   - every object: identity location/rotation/scale, identity parent inverse
#   - bone rest data and mesh vertex data: in shared metres, feet at y=0,
#     total height ~1.78 m
# ---------------------------------------------------------------------------
armatures = [o for o in bpy.data.objects if o.type == "ARMATURE"]
meshes = [o for o in bpy.data.objects if o.type == "MESH"]

if box and armatures:
    mins, maxs = box
    h = maxs[2] - mins[2]
    s = (1.78 / h) if h > 1e-6 else 1.0
    world_zmin = mins[2]  # metres, world space
    # World-space normaliser: scale about origin + feet-to-zero translation.
    S_world = mathutils.Matrix.Diagonal((s, s, s, 1.0))
    S_world[2][3] = -s * world_zmin

    def bake(o):
        """Bake S_world @ o.matrix_world into o's mesh data, identity the object."""
        T = S_world @ o.matrix_world.copy()
        o.data.transform(T)
        o.scale = (1.0, 1.0, 1.0)
        o.location = (0.0, 0.0, 0.0)
        o.rotation_euler = (0.0, 0.0, 0.0)
        o.matrix_parent_inverse.identity()

    # 1) meshes: bake their full world transform after the normaliser
    for o in meshes:
        bake(o)
    # 2) armature bone rest data: bones live in armature data space; world
    #    bone rest = arm.matrix_world @ p, so the data-space normaliser is
    #    S_world @ arm.matrix_world (same math as bake()).
    for a in armatures:
        T = S_world @ a.matrix_world.copy()
        a.data.transform(T)
        a.scale = (1.0, 1.0, 1.0)
        a.location = (0.0, 0.0, 0.0)
        a.rotation_euler = (0.0, 0.0, 0.0)
    bpy.context.view_layer.update()

    # refresh bbox + report
    box2 = world_bbox_meshes()
    if box2:
        mins2, maxs2 = box2
        print(f"[fbx2glb] baked data (scale x{s:.5f}), height now {maxs2[2]-mins2[2]:.3f} m, feet at y={mins2[2]:.4f}")
    dump_mesh_heights("after-bake")
else:
    print("[fbx2glb] WARNING: no mesh/armature objects found; exporting as-is")

# Drop facial shape keys on ALL meshes (we don't use the morph targets; they
# also block modifier application and bloat the GLB as morph-target data).
for o in bpy.data.objects:
    if o.type == "MESH" and o.data.shape_keys:
        bpy.context.view_layer.objects.active = o
        try:
            for kb in reversed(list(o.data.shape_keys.key_blocks)):
                o.shape_key_remove(kb)
            print("[fbx2glb] shape keys removed:", o.name)
        except Exception as e:
            print(f"[fbx2glb] shape key removal failed for {o.name}: {e}")

# Optional decimation (maintains skinning weights; small detailed meshes kept).
# The DECIMATE modifier is applied manually and moved to the TOP of the stack so
# that applying it does not bake the armature deformation (we are at rest pose,
# so baking armature would be harmless, but moving it up is the safe path).
if ratio > 0:
    before = 0
    for o in bpy.data.objects:
        if o.type == "MESH": before += len(o.data.vertices)
    for o in list(bpy.data.objects):
        if o.type == "MESH" and len(o.data.vertices) > keep_verts:
            bpy.context.view_layer.objects.active = o
            try:
                bpy.ops.object.modifier_add(type="DECIMATE")
                o.modifiers[-1].decimate_type = "COLLAPSE"
                o.modifiers[-1].ratio = ratio
                # Decimate must NOT see the armature modifier: applying a
                # modifier bakes every modifier below it, and baking the
                # armature bind transform into the mesh data makes the
                # exported skin apply that transform a SECOND time. So detach
                # the armature modifier, decimate alone, then re-attach it.
                arm = [(m.name, m.object) for m in o.modifiers if m.type == "ARMATURE"]
                for name, _ in arm:
                    o.modifiers.remove(o.modifiers[name])
                bpy.ops.object.modifier_apply(modifier=o.modifiers[-1].name)
                for name, obj in arm:
                    md = o.modifiers.new(name, "ARMATURE")
                    md.object = obj
                print(f"[fbx2glb] decimated {o.name}: {len(o.data.vertices)} verts")
            except Exception as e:
                print(f"[fbx2glb] decimate skipped for {o.name}: {e}")
    bpy.context.view_layer.update()
    after = sum(len(o.data.vertices) for o in bpy.data.objects if o.type == "MESH")
    print(f"[fbx2glb] decimate {ratio}: {before} -> {after} verts")

print("[fbx2glb] exporting", dst)
dump_mesh_heights("before-export")
# export_apply MUST stay False: applying modifiers at export time bakes the
# armature modifier into the meshes, which DESTROYS the skin bindings
# (clothing meshes would become static geometry frozen in the bind pose).
# All transforms are already frozen via transform_apply() above, and the
# DECIMATE modifier was applied manually, so there is nothing left to bake
# except the armature modifier — which the exporter converts to glTF skins.
bpy.ops.export_scene.gltf(filepath=str(dst), export_format="GLB", export_apply=False)
print("[fbx2glb] done:", dst)