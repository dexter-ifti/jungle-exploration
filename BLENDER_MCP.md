# Blender MCP — Setup for Jungle Exploration

This project uses **Blender MCP** (Model Context Protocol) for Blender integration
and a **procedural walkable character** in the Three.js jungle scene.

## 1. Installed versions (verified Sep 5 2026, arm64 Ubuntu 24.04)

- **Blender** `4.0.2` — `apt` (`blender` package from `noble/universe`)
  - check: `blender --version`
  - binary: `/usr/bin/blender`
- **blender-mcp** `1.0.1` — npm package `blender-mcp` (MIT)
  - installed globally: `npm install -g blender-mcp`
  - installed locally as devDependency: `npm install --save-dev blender-mcp`
  - entry: `node node_modules/blender-mcp/dist/index.js` (stdio MCP server)
  - tools: `create_complex_model`, `modify_model`, `apply_texture`, `search_models`, `search_textures`, `get_scene_info`, `import_from_url`
  - config dir: `~/Desktop/BLENDER-MCP` (`.temp/`, `output/`, `textures/`, `logs/`)

## 2. Verification

```sh
blender --version
# Blender 4.0.2
npx blender-mcp --help   # headless MCP server on stdio
npm run blender:check
npm run blender:mcp      # starts MCP server (Ctrl-C to exit)
```

The server was tested headless — it starts on stdio and reports
`[server] Starting Blender MCP Server v1.0.0` / `Server running on stdio`.

## 3. OpenCode / Claude integration

Add to your MCP client config (example for OpenCode / Claude Code):

```json
{
  "mcpServers": {
    "blender": {
      "command": "npx",
      "args": ["blender-mcp"]
    }
  }
}
```

Or use the local script:

```json
{
  "mcpServers": {
    "blender": {
      "command": "node",
      "args": ["node_modules/blender-mcp/dist/index.js"]
    }
  }
}
```

Environment overrides (optional):

- `BLENDER_EXECUTABLE=blender`
- `BLENDER_MCP_DIR=~/Desktop/BLENDER-MCP`
- `BLENDER_TIMEOUT=120`

## 4. Walkable character — how it was added

The jungle already had a first-person trail walker (WASD + mobile dual-zone joystick).
The static NPC at the trailhead (`src/character.js` — procedural primitives) was
converted into the **player avatar**:

- `src/character.js`
  - Keeps zero-external-assets (Capsule/Box/Sphere + MeshStandardMaterial)
  - Exports `placeCharacter(scene)` → `{ group, hips, update(time,dt,state), setPosition }`
  - `group.name = 'ExplorerGuide'` (23 meshes)
  - Animations: idle breathe + head scan, walk (1.65 Hz) and run (2.45 Hz) with
    counter-swing legs/arms, hip bob and sway
  - Blender-MCP alternative: primitives were kept for headless safety, but a
    `blender --background --python` script can export a GLTF to `public/models/`
    and be loaded via `GLTFLoader` if desired — no binary is checked in.

- `src/world.js`
  - `placeCharacter(scene)` is instantiated and snap-placed at `t=0.02`
    (trailhead) via `terrainHeight(p.x,p.z)` and `TRAIL.getTangentAt(t)` yaw
  - `main.js` takes over positioning each frame for terrain collision.

- `src/main.js`
  - Trail spline still drives motion (`t` + `strafe` with accel/decel)
  - Each frame: `character.group.position.set(sx, groundY, sz)` (ground collision via `terrainHeight`)
  - `character.update(time,dt,{speed,isMoving,isRunning,yaw: targetCharYaw})`
  - **Third-person chase camera**: offset `3.0–3.6m` behind the character,
    height `~1.55m`, orbital yaw = `characterYaw + lookYaw`, pitch = `lookPitch`
  - Re-uses existing desktop (WASD + Shift + mouse/arrow look + pointer lock)
    and mobile (left joystick move/strafe + right drag look + auto-recenter)
    inputs — now driving the avatar instead of the camera.
  - Footstep sounds (`sound.step`) still triggered from `stepPhase`.
  - `window.__setT` also re-snaps the avatar for deterministic renders.

## 5. Build check

```sh
npm run build
```

All chunks build without error; `character` chunk ~3 kB.
Headless Playwright sanity:

```js
// 23 meshes, grounded (groundOff 0.00), at trailhead spawn
scene.getObjectByName('ExplorerGuide') // found
```

Screenshot from `t=0.02` after the conversion shows the avatar centered in
third-person on the trail (see `renders/` and `/tmp/opencode/walkable_check.png`
from the build harness).
