// Spline MCP integration — Jungle Exploration
// Uses @splinetool/runtime (Code API) as the viable path. The npm package
// `spline-mcp-server` (aydinfer) is archived: Spline.design has no public
// REST API, so 130/140 tools targeting api.spline.design fail. The 10 code-gen
// tools remain useful and are documented in SPLINE_MCP.md.
//
// This module provides:
//  - lazy Spline runtime loader (browser-only, needs canvas)
//  - helper to attach a Spline scene as an overlay or to drive objects via runtime
//  - MCP code-gen snippets (via spline-mcp-server) are available via npx
//
// Zero external fetch by default: if SPLINE_SCENE_URL is empty, the jungle
// stays fully procedural Three.js. Set `window.SPLINE_SCENE_URL` to a public
// Spline export (e.g. https://prod.spline.design/xxx/scene.splinecode) to load.

let splineApp = null;

export async function initSpline(scene, canvas) {
  const url = window.SPLINE_SCENE_URL || '';
  if (!url) return null;
  try {
    const { Application } = await import('@splinetool/runtime');
    const app = new Application(canvas || document.createElement('canvas'));
    await app.load(url);
    splineApp = app;
    console.log('[spline] loaded', url);
    return app;
  } catch (e) {
    console.warn('[spline] load failed, staying procedural', e);
    return null;
  }
}

export function getSplineApp() { return splineApp; }

// --- Code-gen helpers (mirror 10 working tools from spline-mcp-server) ---
// Example: generate vanilla JS snippet to load a scene and bind an event
export function splineSnippetVanilla(sceneUrl) {
  return `import { Application } from '@splinetool/runtime';\nconst canvas = document.getElementById('canvas3d');\nconst app = new Application(canvas);\napp.load('${sceneUrl}').then(()=>{\n  const obj = app.findObjectByName('Cube');\n  if(obj) obj.position.x += 10;\n});`;
}
export function splineSnippetReact(sceneUrl) {
  return `import Spline from '@splinetool/react-spline';\nexport default function App(){\n  return <Spline scene="${sceneUrl}" onLoad={(app)=>{\n    const obj = app.findObjectByName('Cube');\n    // app.setVariable, app.emitEvent, app.addEventListener\n  }} />\n}`;
}
