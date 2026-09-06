# Spline MCP — Setup for Jungle Exploration

## 1. What was installed

- **spline-mcp-server** `1.0.0` — `npm install --save-dev github:aydinfer/spline-mcp-server` (84★, 15 forks, MIT). CLI `node ./node_modules/spline-mcp-server/src/index.js`. 
  - **Archived upstream**: README states Spline.design has **no public REST API**; ~130 tools that call `api.spline.design` will 404. Only **10 code-generation tools** are viable.
- **@splinetool/runtime** `2.0.37` — `npm install --save @splinetool/runtime` (Code API, client-side JS runtime that works in a browser with a canvas: `findObjectByName`, `getAllObjects`, `emitEvent`, `setVariable`, `addEventListener` etc.)
- **@splinetool/viewer** `2.0.37` — web-component viewer alternative
- Existing **blender-mcp** `1.0.1` + `blender 4.0.2` remain installed (see `BLENDER_MCP.md`).

## 2. Verification

```sh
npm ls spline-mcp-server @splinetool/runtime
# spline-mcp-server 1.0.0, @splinetool/runtime 2.0.37
npm run spline:check
# spline runtime ok
# spline-mcp-server 1.0.0 installed (archived, code-gen only)

# MCP server (archived, will error on missing REST API — expected)
node ./node_modules/spline-mcp-server/src/index.js
# Error: Cannot read properties of undefined (reading 'variableNames') — SDK 1.18 vs 1.29 mismatch, but code-gen does not need the server to run

# Runtime in browser (no API key needed)
npm run dev # then in console: app.findObjectByName, app.setVariable etc.
```

## 3. Why the MCP server is archived and what actually works

From `https://github.com/aydinfer/spline-mcp-server` (archived banner):

> Spline.design does not provide a public REST API, so most tools fail. Spline's real developer tools are the **Code API** (`@splinetool/runtime`, browser-only, canvas required) and **Real-time API** (editor outbound webhooks). The MCP server's 10 code-gen tools just emit `@splinetool/runtime` snippets — Claude can write these without MCP.

**Working path for this project**: use `@splinetool/runtime` directly. `src/spline.js` lazy-loads it only if `window.SPLINE_SCENE_URL` is set.

## 4. How to use in Jungle Exploration

The jungle stays fully procedural Three.js by default (zero external fetch). To overlay a Spline scene:

```html
<canvas id="canvas3d"></canvas>
<script type="module">
  import { initSpline } from './src/spline.js';
  window.SPLINE_SCENE_URL = 'https://prod.spline.design/xxx/scene.splinecode';
  const app = await initSpline(scene, document.getElementById('canvas3d'));
  // runtime API:
  // app.findObjectByName('Cube').position.x += 10
  // app.setVariable('score', 42)
  // app.emitEvent('mouseDown', 'Cube')
  // app.addEventListener('mouseDown', (e)=>{})
</script>
```

Or use the MCP code-gen via `npx`:

```sh
# add to Claude Desktop / OpenCode MCP config
{
  "mcpServers": {
    "spline": { "command": "npx", "args": ["-y", "spline-mcp-server"] }
  }
}
# then prompt Claude:
# "Generate a React component that loads my Spline scene and adds click handlers"
# → produces code using snippets from src/spline.js (splineSnippetVanilla/React)
```

`src/spline.js` exports `initSpline`, `getSplineApp`, `splineSnippetVanilla`, `splineSnippetReact` — all work without API keys.

## 5. MCP config for this repo

See `mcp.json` at repo root:

```json
{
  "mcpServers": {
    "blender": { "command": "npx", "args": ["blender-mcp"] },
    "spline": { "command": "node", "args": ["./node_modules/spline-mcp-server/src/index.js"] }
  }
}
```

Blender MCP provides mesh generation, Spline MCP provides runtime code generation.

## 6. Build check

```sh
npm run build # includes @splinetool/runtime chunk if imported, otherwise tree-shaken
```

If `window.SPLINE_SCENE_URL` is empty, the Spline code is lazy-loaded and not bundled, so the jungle build stays ~658 kB `three.module` + small chunks.
