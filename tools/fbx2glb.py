# Blender headless FBX -> GLB converter (UE cm scale -> metres, height ~1.78m).
# Usage:
#   blender --background --python tools/fbx2glb.py -- public/models/survival_character.fbx public/models/survival_character.glb
# Note: if your distro Blender is broken (missing libMaterialX v1.39.46 symbols),
# bootstrap the runtime first, e.g.:
#   LD_PRELOAD=/tmp/libmx_shim.so blender --background --python tools/fbx2glb.py -- ...
import sys, pathlib, bpy

argv = sys.argv
argv = argv[argv.index("--") + 1:] if "--" in argv else []
src = pathlib.Path(argv[0]) if len(argv) > 0 else pathlib.Path("public/models/survival_character.fbx")
dst = pathlib.Path(argv[1]) if len(argv) > 1 else pathlib.Path("public/models/survival_character.glb")
dst.parent.mkdir(parents=True, exist_ok=True)

# Make sure the bundled FBX importer / glTF exporter addons are registered.
try:
    import addon_utils
    addon_utils.enable("io_scene_fbx", default_set=True)
    addon_utils.enable("io_scene_gltf2", default_set=True)
except Exception as e:
    print("[fbx2glb] addon enable warning:", e)

bpy.ops.wm.read_factory_settings(use_empty=True)

def set_active(obj=None):
    """Ensure there is an active object so object-level operators work."""
    obj = obj or next((o for o in bpy.data.objects if o.type == "MESH"), None)
    if obj:
        bpy.context.view_layer.objects.active = obj
        bpy.context.view_layer.update()

def apply_selected():
    bpy.ops.object.select_all(action="SELECT")
    set_active()
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.ops.object.select_all(action="DESELECT")

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

# Scale rigged/parented objects uniformly (objects incl. armature), then freeze.
for o in bpy.data.objects:
    o.scale = (0.01, 0.01, 0.01)
apply_selected()

# World bounding-box of all mesh objects (min/max corners per axis).
def world_bbox_meshes():
    mins = [float("inf")] * 3
    maxs = [-float("inf")] * 3
    import mathutils
    for o in bpy.data.objects:
        if o.type != "MESH":
            continue
        m = o.matrix_world
        for c in o.bound_box:
            p = m @ mathutils.Vector(c)
            for i in range(3):
                mins[i] = min(mins[i], p[i])
                maxs[i] = max(maxs[i], p[i])
    if mins[0] == float("inf"):
        return None
    return mins, maxs

# Normalise: feet at y=0 and overall height ~1.78 m (standing adult male) so the
# Three.js loader's auto-fit (1.2-2.5 m) does not re-scale it again.
box = world_bbox_meshes()
if box:
    mins, maxs = box
    h = maxs[2] - mins[2]
    s = (1.78 / h) if (h > 1e-4 and abs(h - 1.78) / 1.78 > 0.05) else 1.0
    for o in bpy.data.objects:
        o.scale = (s, s, s)
    apply_selected()
    mins, maxs = world_bbox_meshes()
    ymin = mins[2]
    if abs(ymin) > 1e-4:
        for o in bpy.data.objects:
            o.location.z -= ymin
    print(f"[fbx2glb] scaled {s:.4f}, height now {maxs[2]-mins[2]:.3f} m")
else:
    print("[fbx2glb] WARNING: no mesh objects found; exporting as-is")

print("[fbx2glb] exporting", dst)
bpy.ops.export_scene.gltf(filepath=str(dst), export_format="GLB", export_apply=True)
print("[fbx2glb] done:", dst)