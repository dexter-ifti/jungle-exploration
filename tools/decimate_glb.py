# Blender headless decimator for survival_character.glb.
# Loads the converted GLB, heavily decimates the clothing/body meshes (keeps
# small high-detail meshes like the face parts), then re-exports at the target:
#   LD_PRELOAD=/tmp/libmx_shim.so blender --background --python tools/decimate_glb.py \
#     -- public/models/survival_character.glb public/models/survival_character_low.glb 0.3
import sys, pathlib, bpy, addon_utils

argv = sys.argv
argv = argv[argv.index("--") + 1:] if "--" in argv else []
src = pathlib.Path(argv[0]) if len(argv) > 0 else pathlib.Path("public/models/survival_character.glb")
dst = pathlib.Path(argv[1]) if len(argv) > 1 else pathlib.Path("public/models/survival_character_low.glb")
ratio = float(argv[2]) if len(argv) > 2 else 0.30
keep_verts = int(argv[3]) if len(argv) > 3 else 2000  # meshes under this size stay untouched

addon_utils.enable("io_scene_gltf2", default_set=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
print(f"[decimate] importing {src}")
bpy.ops.import_scene.gltf(filepath=str(src))

def active_mesh():
    for o in bpy.data.objects:
        if o.type == "MESH":
            bpy.context.view_layer.objects.active = o
            return o
    return None

before = total = 0
for o in bpy.data.objects:
    if o.type == "MESH":
        total += len(o.data.vertices)
before = total
decimated = 0
for o in list(bpy.data.objects):
    if o.type != "MESH":
        continue
    vc = len(o.data.vertices)
    if vc > keep_verts:
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.modifier_add(type="DECIMATE")
        o.modifiers[-1].name = "dec"
        o.modifiers["dec"].decimate_type = "COLLAPSE"
        o.modifiers["dec"].ratio = ratio
        decimated += 1

# Apply modifiers (also refreshes evaluated geometry) and export with apply=True.
bpy.context.view_layer.update()
print(f"[decimate] {decimated} meshes decimated to {ratio}, "
      f"{before} -> {total} verts before apply")

# Apply is handled by glTF export_apply; still call transform_apply safety.
for o in bpy.data.objects:
    if o.type == "MESH" and o.modifiers:
        bpy.context.view_layer.objects.active = o
        try:
            bpy.ops.object.modifier_apply(modifier=o.modifiers[0].name)
        except Exception as e:
            print("[decimate] apply warn:", o.name, e)

after = sum(len(o.data.vertices) for o in bpy.data.objects if o.type == "MESH")
print(f"[decimate] after apply: {after} verts ({after / max(1, before):.2%})")
bpy.ops.export_scene.gltf(filepath=str(dst), export_format="GLB", export_apply=True)
print(f"[decimate] exported {dst}")