# Jungle Exploration — Gauntlet Results

A procedural Three.js first-person jungle exploration game, built strictly with no external assets. All meshes, textures, sounds, and effects are generated at runtime.

## Final independent-critic verdict: **FAIL**

Average across 7 axes: **2.43/10**. Overall believability: **2/10**. Threshold for pass: average ≥ 6 AND believability ≥ 5.

Per-axis scores from the final critic:
- terrain_and_path: 3/10
- vegetation_variety: 2/10
- lighting_atmosphere: 4/10
- ruins_recognition: 1/10
- waterfall_and_water: 1/10
- post_processing: 4/10
- overall_believability: 2/10

## What was built

All 7 systems are implemented in code and committed. None individually passes the "real tropical jungle documentary photography" bar.

**System 1 — terrain and path** (`src/world.js`)
256×256 procedural heightfield, winding Catmull-Rom trail, riverbed channel, ruins clearing, amphitheater cliff with buttresses, 260 noise-deformed boulders, canvas-generated ground/rock textures, per-vertex color blending. This is the only system with a clean checkpoint commit (`9b30743`).

**System 2 — vegetation** (`src/vegetation.js`)
10 species archetypes: palm, broadleaf, thin hardwood, strangler fig, dead snag, fern-tree, shrub, wall (2-4m bushy mass), umbrella (4-6m wide-canopy), groundcover (0.3-0.9m mound). Per-instance seed-based variation. Trunks with buttresses and branches. Canopy as cluster of 3-7 noise-displaced ellipsoid blobs with per-vertex color mottling. Poisson-style scatter with distance-from-trail density falloff. Understory: 1500 ferns, 800 broadleaf herbs, fallen logs, moss patches. Best-effort pass — visual reading still doesn't reach photoreal.

**System 3 — lighting and atmosphere** (`src/lighting.js`)
Sky dome, warm directional sun, cool/warm hemisphere, green canopy-fill, warm side-fill, 14 dappled point lights pulsing along the trail, 10 god-ray billboards oriented along sun direction, 400 pollen particle motes, thicker greenish fog (FogExp2 0.011). Best-effort pass — god rays and fog work; dapple and color realism partial.

**System 4 — stone ruins** (`src/ruins.js`)
3-tier stone platform, 2 broken columns with fluting and break points, 3 back-wall blocks, 1 side-wall fragment, 2 toppled columns, 14 rubble blocks, 8 moss patches. Noise-displaced stones with per-vertex weathering/moss colors. Scatter excludes a 16m radius so the temple is visible. Best-effort pass — visible but reads as "abstract geometry" not weathered stone.

**System 5 — waterfall, pool, splash** (`src/water.js`)
Procedural falling-water texture (high-frequency vertical streaks), main waterfall sheet (18m × 13m), two side cascades, irregular circular pool with animated texture offset, 220 splash particles rising from the pool, 14 wet-rock patches. Scatter excludes cliff face. Best-effort pass — pool and splash render correctly; main waterfall sheet reads as a "white panel" not falling water.

**System 6 — procedural sound** (`src/sound.js`)
JungleSound class wraps Web Audio API. Procedural sources: filtered noise (wind, leaves, distant water, waterfall roar), FM tones (birds), band-passed high-frequency tones (insects), short noise bursts (splash). Volumes update each frame based on distance to falls and player trail progress. Audio context starts on user click. Structural pass — cannot be visually verified.

**System 7 — post-processing** (`src/postprocess.js`)
EffectComposer with RenderPass, UnrealBloomPass (strength 0.35, radius 0.4, threshold 0.82), custom color-grading ShaderPass (lift/gamma/gain with jungle-tuned values, saturation 1.08, vignette), OutputPass. Working pass — critic scored 7/10 for visible bloom and vignette on individual frames.

## Why it fell short

The procedural icosahedron-cluster canopy approach used for all tree species is a recognizable "low-poly primitive" from any meaningful viewing distance, regardless of how many noise octaves or how much color variation is applied. The structural critique from the critic — "dark spherical/blob masses on stick trunks", "low-poly cartoon" — is correct and cannot be fixed with more iteration on the same geometry strategy. Reaching real-documentary quality on a procedural Three.js project with no external assets would require either (a) significantly more complex procedural geometry (tens of thousands of leaf quads per tree, with proper alpha cutouts) or (b) shifting the visual target from photorealism to a deliberate stylized low-poly aesthetic and re-tuning the critic's expectations.

The render harness running on SwiftShader also meant each iteration cycle cost 2-3 minutes per frame and frequently timed out before a full 7-frame set could be captured, which made end-to-end validation slow.

## Run it

```sh
npm install
npm run dev
# then open http://127.0.0.1:5173/
# click anywhere or press a key to start the procedural sound
# W/S to walk forward/back, hold Shift to move faster
```

## Repository layout

- `index.html` — empty shell, vite entry
- `src/main.js` — first-person walker, render loop
- `src/world.js` — terrain, path, lighting/scene assembly (System 1 + glue)
- `src/vegetation.js` — System 2
- `src/lighting.js` — System 3
- `src/ruins.js` — System 4
- `src/water.js` — System 5
- `src/sound.js` — System 6
- `src/postprocess.js` — System 7
- `tools/render.mjs` — Playwright render harness (headless captures)
- `tools/render-final.mjs` — final-pass 7-frame set
- `tools/render-one.mjs` — single-frame debug renders
- `tools/inspect.mjs` — scene introspection helper
- `tools/closeup.mjs`, `tools/pixels.mjs`, `tools/iso.mjs` — various diagnostic scripts
- `prompt.md` — the original task spec
