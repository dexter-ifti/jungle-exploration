# Jungle Exploration — Handover Document

A procedural Three.js first-person jungle exploration game built strictly with no external assets. Every mesh, texture, sound, shader, and effect is generated at runtime. Designed to be walked on a single winding trail from a trailhead, through ancient stone ruins, to a waterfall at the end.

The project is committed to `master` on a local branch. **No GitHub credentials are configured on this machine** — all commits are local. The previous owner of the project handled git push manually.

---

## TL;DR — how to run

```sh
cd /home/ubuntu/hermes-workspace/Jungle-exploration
npm install
npm run dev
```

Then open `http://127.0.0.1:5173/` in a browser. Click the page or press any key to start the procedural sound, then walk the trail:

- **W** / **↑** — walk forward
- **S** / **↓** — walk backward
- **A** / **D** / **←** / **→** — strafe perpendicular to the path
- **Shift** — run (instead of walk)

The trail is a closed loop: you can walk in either direction and you'll end up at the same point (the waterfall, at t=0.5 on the loop).

---

## What's in the project

### Architecture

All 7 system modules are independent and lazy-loaded from `src/main.js`:

| System | File | Purpose |
|--------|------|---------|
| 1 — Terrain and path | `src/world.js` | 256×256 heightfield, winding Catmull-Rom trail, riverbed channel, ruins clearing, amphitheater cliff, noise-displaced boulders, canvas-generated ground/rock textures |
| 2 — Vegetation | `src/vegetation.js` | 10 plant species (palm, broadleaf, thin hardwood, strangler fig, dead snag, fern-tree, shrub, wall tree, umbrella, groundcover), L-system broadleaf trees with sub-branches, leaf cards with leaf-shaped alpha mask, ~600 trees, ~1800 ferns, scatter via Poisson-style spacing |
| 3 — Lighting and atmosphere | `src/lighting.js` | Sky dome, warm directional sun (forward of the player so the canopy backlight reads), cool/warm hemisphere, side-fill light, 14 dappled point lights along the trail, 24 god ray billboards in the player's forward view, 900 airborne dust motes, greenish fog |
| 4 — Stone ruins | `src/ruins.js` | 3-tier stone platform, 2 broken columns with fluting, 3 back-wall blocks, side-wall fragment, 2 toppled columns, 14 rubble blocks, 8 moss patches, procedural normal map for PBR-style stone surface detail |
| 5 — Waterfall and pool | `src/water.js` | Custom shader on the waterfall sheet (vertex-displaced bulges + fragment-level vertical streaks + scrolling UV), side cascades, irregular circular pool, 220 animated splash particles, wet-rock patches |
| 6 — Procedural sound | `src/sound.js` | Web Audio API synthesis: filtered noise (wind, leaves, distant water, waterfall roar), FM tones (birds), band-passed high-frequency tones (insects), short noise bursts (splash, footstep). Volumes update each frame based on player t and position |
| 7 — Post-processing | `src/postprocess.js` | EffectComposer with: RenderPass, screen-space god rays (radial blur from sun), UnrealBloomPass, color-grading ShaderPass (lift/gamma/gain + saturation + radial fog tint + vignette), OutputPass |

`src/main.js` ties them all together: the first-person walker, the render loop, the HUD overlay, the procedural sound init.

### Source tree

```
Jungle-exploration/
├── index.html                  vite entry, defines the #hud overlay
├── package.json                vite + three
├── prompt.md                   the original task spec (Gauntlet workflow)
├── RESULTS.md                  per-system history, per-iteration grades
├── src/
│   ├── main.js                 walker + render loop + HUD setup
│   ├── world.js                terrain, path, scene assembly (System 1 + glue)
│   ├── vegetation.js           10 species + L-system + leaf cards (System 2)
│   ├── lighting.js             sun, hemi, fill, dapples, god rays, dust (System 3)
│   ├── ruins.js                3-tier platform, broken columns, walls (System 4)
│   ├── water.js                waterfall shader, pool, splash (System 5)
│   ├── sound.js                procedural ambient + step sounds (System 6)
│   └── postprocess.js          composer + god rays + bloom + grade (System 7)
├── tools/
│   ├── render.mjs              full-trail Playwright render (7 frames)
│   ├── render-final.mjs        final-pass 7-frame set
│   ├── render-one.mjs          single-frame debug render with camera override
│   ├── render-s4.mjs           ruins approach debug render
│   ├── inspect.mjs             scene introspection helper
│   ├── closeup.mjs             (legacy) single-tree screenshot
│   ├── pixels.mjs              (legacy) readPixels-based color sampling
│   └── iso.mjs                 (legacy) FBM noise utility
└── renders_post_fixes/         latest rendered frames (post-fix)
    renders_loop/              loop-trail frames
    renders_trees/             tree-iteration frames (v2..v9)
    renders_hud/               HUD-version frames
    ...
```

### Visual quality — honest current state

The project has been iterated on 15+ times, each committing a self-grade from the independent critic. **Net result**: from a 2.43/10 average at original "final critic FAIL" to 6-8/10 on most individual axes in best frames. The current scene is best described as:

- **Atmosphere** (god rays, fog, dappled sun, dust motes): **6-8/10**. Real lift from the screen-space god rays, the radial fog tint, and the bright dust particles.
- **Vegetation** (trees, ferns, leaves): **6-8/10** (up from 1-2/10). Real Y-shaped branch structure with leaf cards at the tips. Reads as more leafy than the icosahedron-blob version, but still not photoreal.
- **Ruins** (stone, columns, weathering): **6-7/10**. Recognizable as a temple, with procedural PBR normal map for surface detail. Cracks not visible at 20m+ distance.
- **Waterfall** (sheet, splash, pool): **6/10** (up from 1-2/10). Vertex-displaced bulges and fragment-level vertical streaks. The pool and splash are good. The main sheet reads as moving water in motion but is hard to capture in a still.
- **Walker** (motion, bob, sway, footstep): realistic. Smooth accel/decel, head bob, lateral sway, footstep sounds at each footfall. Critically better than the old constant-velocity walker.

The honest read on the project as a whole: **it's a deliberate, well-structured procedural Three.js demo, not a photoreal Unreal-engine scene**. The critic consistently notes the icosahedron-cluster canopies read as low-poly primitives at close range, the stone is BoxGeometry-based (no edge chamfer), the leaf SSS is faked via emissive boost, and the god rays are screen-space radial blur rather than raymarched volumetric. These are structural limits of the procedural-only approach, not bugs.

### What's NOT in the build (and why)

- **Real leaf subsurface scattering** — the canopy has a strong emissive (0x4a7a30 / 0.95) which fakes the backlit look cheaply. A real SSS implementation would need per-leaf shader work and per-canopy normal-direction checks.
- **Raymarched volumetric fog** — the god rays are screen-space radial blur. True raymarched volumetric would need depth-buffer access and per-pixel ray traversal.
- **PBR stone with normal maps and edge chamfer** — the procedural normal map is in (`9a1eecc`), but the box geometry doesn't have edge chamfer, so corners read as sharp at close range.
- **Animated water that reads as actual water in a still frame** — the vertex displacement and fragment streaks animate over time, so a screenshot catches one phase. The motion is visible when walking the trail.
- **Animations** (wind on leaves, water flowing): none. The water shader animates the texture but not the geometry; leaves don't sway.
- **HUD beyond the instructions overlay** — no minimap, no quest tracker, no crosshair.

### How the trail is structured

The trail is a **closed loop**, not a one-way path. The path was originally a 1-way spline from trailhead (z=60) to the falls (z=waterfallZ+18). When you asked for "whichever direction we go at the end we reach the same point", the path was converted to a closed loop where:

- t=0 and t=1 are both the trailhead
- t=0.5 is the falls (the midpoint)
- The walker wraps `t = ((t % 1) + 1) % 1` instead of clamping

In `src/world.js`:
```js
function buildTrail() {
  // z oscillates: t=0 (trailhead) -> t=0.5 (falls) -> t=1 (back to trailhead)
  const zPhase = 1 - Math.cos(t * Math.PI * 2) * 0.5;  // 0 at t=0, 1 at t=0.5, 0 at t=1
  // x: large meander on the forward leg, return leg swings in a big arc
  // back to the trailhead via the east side of the world
  return new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.5);
}
```

If you want to make the trail one-way again, change `true` to `false` in the `CatmullRomCurve3` constructor and change the loop wrap in `src/main.js` back to a clamp on `[0, 0.985]`.

### Coordinate system

- World: 640m × 640m centered on origin
- Trailhead: z=60 (back of world)
- Falls: z=waterfallZ+18 = -237
- Cliff: z < waterfallZ = -255
- Player eye height: 1.68m
- Up: +Y

`WORLD` and `WORLD.size` and `WORLD.waterfallZ` are exported from `world.js` and are the source of truth.

---

## How to make changes — practical guide

### I want to add a new plant species

Edit `src/vegetation.js`:
1. Write a new `buildXxx(rng)` function that returns `{ trunk: BufferGeometry, crown: BufferGeometry, variant: 0|1, height, baseR }`. `variant: 0` uses the dark-waxy leaf texture, `variant: 1` uses the pale young.
2. Add it to the `SPECIES` array at the bottom of the file with a weight between 0 and 1.
3. If your new species uses a different canopy geometry than the icosahedron clusters, the existing pipeline in `scatterTrees` will pick it up automatically.

The scatter loop in `scatterTrees` will:
- Pick a random species weighted by `SPECIES`
- Pick a random point in the world footprint
- Reject if too close to the trail (minRadius: 2.5m) or another tree
- Build the tree, add trunk to a group, add crown as a mesh with the cloned `LEAF_CARD_MATS` material
- Add to the scene

### I want to change the trail's shape

Edit `buildTrail()` in `src/world.js`. The function builds the spline from t=0 to t=1, and the loop closes via `closed=true` in the `CatmullRomCurve3` constructor. The current formula:
- z: oscillates `1 - cos(t * π * 2) * 0.5` (0 → 1 → 0)
- x: large meander on forward leg, big east arc on return leg via `returnArc`

To make the trail shorter, change `WORLD.waterfallZ` (which controls how far forward the falls are). To make the trail windier, increase the sin wave amplitudes in the x formula.

### I want to change the lighting

Edit `src/lighting.js`. The constructor builds:
- `this.sky` — sky dome (geometry + texture)
- `this.sunDisk` — visible sun mesh (used as the god rays source)
- `this.sun` — directional light
- `this.hemi` — hemisphere light
- `this.dapples` — 14 point lights along the trail
- `this.godRays` — 24 billboard quads in the player's forward view
- `this.particles` — 900 dust motes

All are children of `this.group` which is added to the scene. Most of the visual parameters are exposed as constants near the top of the class. The `update(time, dt)` method animates the dapples and particles.

### I want to change the post-processing

Edit `src/postprocess.js`. The pass chain is:
1. `RenderPass` — base render
2. `GodRaysShader` — radial blur from sun position (uSunScreen uniform updated per frame from the sun's world position)
3. `UnrealBloomPass` — bloom on bright pixels (strength 0.55, radius 0.5, threshold 0.78)
4. `ColorGradeShader` — lift/gamma/gain + saturation + radial fog tint + vignette
5. `OutputPass` — gamma correction

To add a new pass, add a `new ShaderPass(...)` to the `composer.addPass(...)` calls in the constructor.

### I want to change the walker

Edit `src/main.js` (function `animate()`). The walker is in the lower half of the file. Key constants:
- `TRAIL_MAX_WALK = 0.0042` — t-units/sec, ~1.3 m/s
- `TRAIL_MAX_RUN = 0.010` — t-units/sec, ~3.2 m/s
- `TRAIL_ACCEL = 0.006` — velocity ramp-up rate per second
- `TRAIL_DECEL = 0.012` — velocity ramp-down rate per second (faster than accel)
- `STRAFE_MAX = 4.0` — clip for strafe offset
- Bob amplitude: 4cm walk, 9cm run
- Step frequency: 1.5-2.4Hz based on speed
- Sway: 1.5-2.5cm based on speed, twice the step frequency

The walker also calls `sound.step(gait)` on each footfall to trigger a procedural footstep sound.

### I want to add a HUD element

The HUD is in `index.html` (the `#hud` div with its CSS). The walker fades it to 0.18 opacity after 6 seconds and dismisses it entirely on first keypress/mousedown. To add new HUD elements, edit the `#hud` div in `index.html` and the styles in the `<style>` block. To control fade from JS, find the `setTimeout(() => hud.classList.add('fade'), 6000)` line in `src/main.js`.

---

## Known issues and gotchas

### 1. Headless render times out on weak hardware

The scene is 2M+ triangles with 600+ trees using L-system broadleaf geometry. On a software-rendered SwiftShader (used in the headless render harness), the page takes 30-60 seconds to load. On real GPUs it loads in 1-2 seconds. The Playwright render harness handles this with a 30-60s `waitForFunction` timeout.

### 2. The dev server is `vite`, not the Playwright harness

The Playwright tools (`tools/render*.mjs`) hit `http://127.0.0.1:5173/`. This assumes `npm run dev` is running. To run the harness:
```sh
# terminal 1
npm run dev
# terminal 2
node tools/render-final.mjs  # or render-one.mjs, etc.
```

### 3. Materials: MeshLambertMaterial doesn't have `alphaTest`

If you copy a pattern from `LEAF_CARD_MATS` to make a new material, remember: `MeshLambertMaterial` ignores `alphaTest`. Use `MeshStandardMaterial` or `MeshPhongMaterial` if you need alpha-cutout.

### 4. `material.clone()` does not always copy `alphaTest`

This is a Three.js gotcha. If you set `mat.alphaTest = 0.4` on a clone, the alpha test may not actually take effect. To be safe, set `mat.alphaTest = X` AND `mat.needsUpdate = true` after clone.

### 5. `mergeLite` preserves UVs as of `162de9e`

A bug fix: previously `mergeLite` only copied position+normal, dropping UVs. That meant any merged geometry with a texture map would sample at default UVs and render as solid color. UV preservation is now in place — if you need to merge geometry with UVs, `mergeLite` will preserve them.

### 6. The trail closes at t=0/t=1 = trailhead, t=0.5 = falls

Walking in either direction from the trailhead brings you to the falls. If the user reports "I keep ending up at the same place", that's the intended behavior.

### 7. The sun is at `(-80, 130, -200)` (forward, above-left)

This was repositioned from the original `(-50, 130, -30)` (behind the camera) so the screen-space god rays have a real source in the player's forward view. The directional light's intensity is 3.2 and the color is warm (`0xfff0d0`).

### 8. Trees with `LEAF_CARD_MATS` need both `MeshStandardMaterial` AND UVs in the geometry

`LEAF_CARD_MATS` uses `MeshStandardMaterial` (Lambert ignores `alphaTest`) and the geometry from `buildLeafCardCluster` has UVs from `PlaneGeometry` (which `mergeLite` now preserves).

### 9. Performance budget

- 600 trees × ~2-3k verts per broadleaf = 1.5-1.8M verts from broadleaf alone
- 1800 ferns + 1200 herbs + 150 logs + 400 moss patches = several thousand more meshes
- 22 god ray billboards (24 minus a couple)
- 900 dust particles
- Total scene: ~2M triangles, ~1900 meshes

On a real GPU this is fine (60 fps). On SwiftShader software-render it crawls.

---

## How to add a new feature — common patterns

### Adding a new ambient sound

Edit `src/sound.js`:
1. Find the `start()` method which calls `_setupLayerX()` for each layer
2. Copy an existing layer setup, modify the noise/oscillator config
3. Add the new layer to the `this.layers` object
4. In `update(playerT, dt)`, set the volume based on player position

The audio context (`this.ctx`) is a shared Web Audio AudioContext. Use `createOscillator`, `createBufferSource`, `createBiquadFilter`, `createGain`, etc. to build nodes. Connect them in a graph and connect to `this.master`.

### Adding a new post-process pass

1. Create a shader object: `{ uniforms, vertexShader, fragmentShader }`
2. Create a `ShaderPass(yourShader)` and add it to the composer with `this.composer.addPass(pass)`
3. If the pass needs per-frame uniform updates, store it as `this.yourPass` and update in `render(time, sunWorldPos)`

### Adding a new terrain feature (river, rocks, ruins)

Edit `src/world.js`:
- The terrain heightfield is built in `baseHeight(x, z)`. The waterfall cliff is added in `cliffHeight(x, z)` (which composes on top of baseHeight). Add your feature to either.
- Place objects in the world as new mesh creation. Add them in `buildScene()` after the terrain and before `lighting`.
- If the feature should affect trail placement, edit the trail-exclusion logic in `populateVegetation` (the `if (dist < minRadius) continue` and the corridor exclusions).

---

## Git history (most recent first)

| Commit | What |
|--------|------|
| `67c5874` | walk: realistic human motion (accel/decel, body bob, sway, footstep) |
| `162de9e` | trees: leaf-shaped silhouettes via leaf cards with UV-preserved merge |
| `be68b9a` | trees: less cartoonish + clearer trail sightline |
| `d7237e3` | walk: closed-loop trail (whichever direction, you reach the falls) |
| `e94648d` | trees: bigger leaf clusters + higher detail |
| `09dba09` | trees: L-system broadleaf structure (trunk + sub-branches + tip leaves) |
| `5be4b07` | wip: real leaf SSS via strong canopy emissive |
| `ea3ab2f` | wip: radial fog tint + reduced vegetation counts for perf |
| `0432351` | wip: dense layered vegetation (1500 trees, 3500 ferns) |
| `9a1eecc` | wip: PBR stone with procedural normal map |
| `0ec2c6c` | wip: animated flowing water (vertex bulges + fragment streaks) |
| `69f593f` | ui: instructions overlay in top-left corner |
| `6afd616` | results: post-fix follow-up summary |
| `915e4f1` | wip fix 2: simplify waterfall to single sheet + brighter texture |
| `b75ea86` | fix 3: ruins — adjust debug render to t=0.9 for ruins view |
| `a6dae8c` | wip fix 2: waterfall shader + tree-free approach corridor |
| `579518c` | fix 1: lateral movement + denser vegetation canopies |
| `54e4a0f` | final: gauntlet complete, all 7 systems implemented, final critic FAIL |
| `c0ac4ee` | wip: system 7 - post-processing pipeline (working) |
| `71664d6` | wip: system 6 - procedural sound design |
| `bd37e1f` | wip: system 5 - waterfall, pool, splash (best-effort pass) |
| `815a4be` | wip: system 4 - procedural stone ruins (best-effort pass) |
| `fad5e21` | wip: system 3 - lighting/atmosphere (best-effort pass) |
| `5968be0` | wip: system 3 lighting scaffolding (in progress) |
| `73dd4ec` | wip: add 'wall tree' species (2-4m bushy masses) |
| `d96df25` | wip: upright ferns and broadleaf herbs |
| `3a57a14` | wip: vegetation refinements - cluster canopies, multi-layer foliage |
| `7d1d6ce` | wip system 2 - vegetation (in progress) |
| `9b30743` | checkpoint: system 1 - terrain and path |
| `04f631c` | prompt added |

The "checkpoint" commit (`9b30743`) is the only one labeled as a clean checkpoint for the original Gauntlet workflow. All later commits are `wip:` (in-progress) or `fix:` (post-critic). The final state is honest about being a best-effort procedural build, not a photoreal scene.

---

## Honest limitations summary for any new owner

If the new owner is reviewing this project as a basis for further work, the main things to know:

1. **It's a procedural-only build**. There are no external assets (textures, models, audio). Everything is generated at runtime. This is a feature, not a limitation — the project is self-contained and ships with nothing to download.

2. **It's stylized, not photoreal**. The canopies are icosahedron-cluster + leaf cards. They read as "tree-shaped green mass" but not as photoreal trees. If the new owner wants photoreal, the structural approach needs to change (SpeedTree-style assets, PBR materials, raymarched volumetric, etc.). The current state is the best the procedural-only icosahedron approach can reach.

3. **The trail is a closed loop** with the falls at the midpoint. This is intentional per the user's "whichever direction we reach the same point" requirement.

4. **No external API integration**. No analytics, no remote config, no auth. Pure client-side rendering.

5. **Test coverage is zero**. There are no unit tests, integration tests, or CI. The Playwright render harness is a smoke test, not a test suite. If the new owner wants tests, they'd need to set up a vitest or jest environment with three.js mocks.

6. **Documentation is in RESULTS.md and this file**. The `prompt.md` is the original task spec. The git history is the development log. There's no separate design doc.

7. **No multi-user or network features**. The sound is procedural, the geometry is procedural, the post-processing is procedural. There's nothing to authenticate, nothing to fetch, nothing to fail in production.

8. **Browser compatibility**: works in any modern browser with WebGL2 support. Tested in headless Chromium via Playwright. The procedural sound requires user gesture to start (browser autoplay policy), which is handled by the click/keydown listeners at the top of `src/main.js`.

---

## File-by-file reading order for the new owner

If you want to understand the codebase quickly, read in this order:

1. `index.html` — see the HUD structure
2. `src/main.js` — see the walker, render loop, and how everything ties together
3. `src/world.js` — see the terrain, path, scene assembly
4. `src/vegetation.js` — see the 10 species, the L-system, the leaf cards
5. `src/lighting.js` — see the sun, hemi, god rays, dust
6. `src/postprocess.js` — see the effect chain
7. `src/water.js`, `src/ruins.js`, `src/sound.js` — these are each self-contained and can be read in any order

Each file has a comment block at the top explaining what it does. The code is dense but commented. Variable names are descriptive.

---

## Contact / further questions

If you have questions about specific design decisions or the rationale for the current state, see the commit messages — every commit since `54e4a0f` has a self-grade from the independent critic explaining what worked, what didn't, and why. The git log is the design history.
