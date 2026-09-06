# Fab Character — Quantum Modular Character Free Sample

**Link**: https://www.fab.com/listings/8e200050-3158-4762-b297-f785b5b1533d

> **UPDATE**: the full character IS integrated AND walks — `public/models/survival_character.fbx`
> (9.4 MB, Modular-Survival bundle: rigged head/neck/spine/limbs/hands/fingers plus
> Jacket, Jeans, Hair, Shoes, Gloves, Backpack, Eye/Mouth/Eyelash/Brows) converted
> headless via Blender 5.1 (`tools/fbx2glb.py`) to `public/models/survival_character.glb`
> (**1.6 MB — decimated 84.6k → 32.9k verts**, 172 nodes / 11 meshes / 12 materials,
> normalised to ~1.78 m with feet on ground). `src/character.js` auto-detects the GLB,
> grounds it to `terrainHeight`, and **drives the rig's bones with the same procedural
> gait** (thigh/calf stride, arm counter-swing, pelvis bob, spine/head stabilisation —
> `tools/verify-walk.mjs`, `tools/verify-stride.mjs`). Since the character FBX ships no
> weapon mesh, the `sm_rifle.glb` bonus weapon is re-attached on the back. The procedural
> tactical soldier remains only as the fallback when the GLB is missing.

This project now uses a **tactical modular soldier** inspired by the Fab listing instead of the previous jungle explorer.

## What the listing is

- **Quantum Modular Character Free Sample** by Quantum Assets — 4.5★ (51 ratings), **Free**
- Tagline: *Try before you buy. Modular character from 1000+ modules, 72 presets, fully compatible bundles.*
- Bundles: Modular Mega/Casual/Survival/Police/Workers/Protective Suit/Medic + Basemesh; all share one **UE5 skeleton**, MetaHuman compatible, tall/masculine, renders in UE5, includes weapon statics.
- **Included formats**: Unreal Engine / Maya / **FBX** — not GLB. Requires Epic/Fab account to download (Add to My Library → Download). License allows AI usage, not AI-generated.

## What this repo does

The previous `src/character.js` jungle guide (khaki shirt/shorts, safari hat) is **replaced** by a procedural tactical recreation (`src/character.js:1`) that matches the Fab sample's look while keeping **zero external binary assets** so `npm run build` and SwiftShader headless stay reliable.

Changes:
- `src/character.js` keeps a procedural multicam tactical soldier **as the offline fallback**: plate carrier with mag pouches, multicam shirt/pants (canvas camo), helmet, knee pads, boots. 1.78 m rig, hips 0.90, walk 1.6 Hz / run 2.4 Hz gait with heel→toe phases, counter-rotation, head stabilization.
- `public/models/` is the slot for the real Fab asset. If `public/models/survival_character.glb` exists, `src/character.js` auto-detects it via `fetch HEAD` and swaps the procedural mesh for the Rigged GLB at the same world position/yaw (locomotion still driven by `world.js`/`main.js`), grounds it to `terrainHeight`, normalises to ~1.78 m and re-attaches `sm_rifle.glb` on the back.

## How the exact Fab asset was converted (already done; re-run only to regenerate)

Because Fab requires authentication, the repo cannot auto-download it via MCP alone. Do this once:

1. Open the link above while logged into Epic/Fab, click **Free → Add to My Library → Download** (choose FBX).
2. Save as `public/models/survival_character.fbx` (9.4 MB — already in this repo).
3. Convert FBX → GLB (UE cm → m, skeleton preserved, ~1.78 m, feet at y=0, **decimates to ~1.6 MB**):
   ```sh
   blender --background --python tools/fbx2glb.py -- public/models/survival_character.fbx public/models/survival_character.glb 0.3 2000
   # ratio 0.3 = keep 30% of triangles on meshes >2000 verts; omit for full-res output
   ```
4. `npm run dev` — the character will now be the Fab mesh and **walks** (legs/arms animate via rig bones; check console `[fab] loaded …` + `[fab] rig set for gait`). Walk/strafe/joystick still work; the mesh is slaved to `group.position/rotation` from `main.js`.

If the file is missing, the procedural tactical fallback is shown and no error is thrown.

## Verification

```sh
npm run build
# three.module 658kB, character chunk ~9-10kB, FBX/GLB not bundled (lazy)
node tools/verify-survival.mjs   # 178 cm, grounded, procedural hidden
node tools/verify-walk.mjs       # rig bones animate while W held, still idle
node tools/verify-stride.mjs     # stride ~0.33 m, step lift ~0.11 m, arm swing ~0.29 m
node tools/backshot.mjs          # rifle visible on the back
```

Headless harness still finds `ExplorerGuide` (now hidden behind the GLB) and walk/strafe remain `groundOff 0` via `terrainHeight` (see `src/main.js`).

## MCPs installed

- **Blender MCP** `1.0.1` + `blender 4.0.2` — for FBX→GLB conversion (see `BLENDER_MCP.md`)
- **Spline MCP** `1.0.0` + `@splinetool/runtime 2.0.37` — code-gen only, Spline has no REST API (see `SPLINE_MCP.md`)
- **Fab** has no official MCP; `spline-mcp-server` pattern was attempted but Fab is auth-gated. The `tools/fab_convert.py` headless path is the MCP-like automation.
