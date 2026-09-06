# Fab Character — Quantum Modular Character Free Sample

**Link**: https://www.fab.com/listings/8e200050-3158-4762-b297-f785b5b1533d

> **UPDATE**: a real Fab asset IS integrated — `public/models/sm_rifle.fbx`
> (Bonus Weapon Static Mesh, 7849 verts, gray 'Rifle' material) converted
> headless via Blender to `public/models/sm_rifle.glb` (688KB) and slung
> diagonally on the soldier's back (`src/character.js`, `[fab] rifle attached`,
> 62 meshes). The human body itself remains procedural (below) — the full
> character FBX was never uploaded, only the rifle.

This project now uses a **tactical modular soldier** inspired by the Fab listing instead of the previous jungle explorer.

## What the listing is

- **Quantum Modular Character Free Sample** by Quantum Assets — 4.5★ (51 ratings), **Free**
- Tagline: *Try before you buy. Modular character from 1000+ modules, 72 presets, fully compatible bundles.*
- Bundles: Modular Mega/Casual/Survival/Police/Workers/Protective Suit/Medic + Basemesh; all share one **UE5 skeleton**, MetaHuman compatible, tall/masculine, renders in UE5, includes weapon statics.
- **Included formats**: Unreal Engine / Maya / **FBX** — not GLB. Requires Epic/Fab account to download (Add to My Library → Download). License allows AI usage, not AI-generated.

## What this repo does

The previous `src/character.js` jungle guide (khaki shirt/shorts, safari hat) is **replaced** by a procedural tactical recreation (`src/character.js:1`) that matches the Fab sample's look while keeping **zero external binary assets** so `npm run build` and SwiftShader headless stay reliable.

Changes:
- `src/character.js` now builds a multicam tactical soldier: plate carrier with mag pouches, multicam shirt/pants (canvas camo), tactical helmet with NVG mount, knee pads, boots. Keeps the same 1.78 m rig, hips 0.90, 69 meshes, walk 1.6 Hz / run 2.4 Hz gait with heel→toe phases, counter-rotation, head stabilization.
- `public/models/` is the slot for the real Fab asset. If `public/models/quantum-character.glb` (or FBX) exists, `src/character.js` auto-detects via `fetch HEAD` and swaps the procedural mesh for the Fab GLB at the same world position/yaw (locomotion still driven by `world.js`/`main.js`).

## How to use the exact Fab asset (optional, not required for build)

Because Fab requires authentication, the repo cannot auto-download it via MCP alone. The **Spline MCP** pattern does not apply (Fab has no public API like Spline's 130-tool failure). Do this once:

1. Open the link above while logged into Epic/Fab, click **Free → Add to My Library → Download** (choose FBX).
2. Save as `public/models/quantum-character.fbx`
3. Convert FBX → GLB (UE cm → m, preserves skeleton):
   ```sh
   blender --background --python tools/fab_convert.py -- public/models/quantum-character.fbx public/models/quantum-character.glb
   # or via Blender MCP: npx blender-mcp, then "import FBX … and export GLB"
   ```
4. `npm run dev` — the character will now be the Fab mesh (check console `[fab] loaded …`). Walk/strafe/joystick still work; the mesh is slaved to `group.position/rotation` from `main.js`.

If the file is missing, the procedural tactical fallback is shown and no error is thrown.

## Verification

```sh
npm run build
# three.module 658kB, character chunk ~4-5kB, FBX/GLB not bundled (lazy)
```

Headless harness still finds `ExplorerGuide` (now tactical) and walk/strafe remain `groundOff 0` via `terrainHeight` (see `src/main.js`).

## MCPs installed

- **Blender MCP** `1.0.1` + `blender 4.0.2` — for FBX→GLB conversion (see `BLENDER_MCP.md`)
- **Spline MCP** `1.0.0` + `@splinetool/runtime 2.0.37` — code-gen only, Spline has no REST API (see `SPLINE_MCP.md`)
- **Fab** has no official MCP; `spline-mcp-server` pattern was attempted but Fab is auth-gated. The `tools/fab_convert.py` headless path is the MCP-like automation.
