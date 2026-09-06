# Blender MCP — Fab FBX → GLB converter
# Usage: blender --background --python tools/fab_convert.py -- public/models/quantum-character.fbx public/models/quantum-character.glb
import sys, bpy, pathlib
argv = sys.argv
if "--" in argv: argv = argv[argv.index("--")+1:]
else: argv=[]
src = pathlib.Path(argv[0]) if len(argv)>0 else pathlib.Path("public/models/quantum-character.fbx")
dst = pathlib.Path(argv[1]) if len(argv)>1 else pathlib.Path("public/models/quantum-character.glb")
src = pathlib.Path(src); dst = pathlib.Path(dst)
if not src.exists():
    print(f"[fab] missing {src} — download Fab FBX first (see FAB_CHARACTER.md)")
    sys.exit(0)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=str(src))
# normalize scale: UE cm -> m
for o in bpy.context.scene.objects:
    if o.type=='MESH':
        o.scale = (0.01,0.01,0.01)
bpy.ops.export_scene.gltf(filepath=str(dst), export_format='GLB', export_apply=True)
print(f"[fab] exported {dst}")
