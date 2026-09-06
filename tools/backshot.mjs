// Back/three-quarter shot of the survival character + rifle.
// Renders rifle-on vs rifle-off synchronously inside ONE page frame and diffs raw
// WebGL pixels so the idle animation cannot leak into the comparison.
import { chromium } from 'playwright';

const browser = await chromium.launch({ args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 960, height: 720 } });
const logs = [];
page.on('pageerror', e => logs.push('[pageerror] ' + e.message));

await page.goto('http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__scene, { timeout: 90000 });
await page.waitForFunction(() => window.__scene?.getObjectByName('RifleSling') != null, { timeout: 120000 });
await page.waitForTimeout(1500);

const result = await page.evaluate(() => {
  const T = window.__THREE, scene = window.__scene;
  const g = window.__renderer.getContext();
  const W = g.drawingBufferWidth, H = g.drawingBufferHeight;
  const cam = window.__camera;
  const fab = scene.getObjectByName('FabQuantumCharacter');
  const p = fab.position, yaw = fab.rotation.y;
  const fwd = new T.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  cam.position.set(p.x - fwd.x * 2.4, p.y + 1.42, p.z - fwd.z * 2.4);
  cam.lookAt(p.x, p.y + 1.15, p.z);
  cam.updateMatrixWorld();

  const sling = scene.getObjectByName('RifleSling');
  const buf1 = new Uint8Array(W * H * 4), buf2 = new Uint8Array(W * H * 4);

  sling.visible = true;
  window.__renderer.render(scene, cam);
  g.readPixels(0, 0, W, H, g.RGBA, g.UNSIGNED_BYTE, buf1);

  sling.visible = false;
  window.__renderer.render(scene, cam);
  g.readPixels(0, 0, W, H, g.RGBA, g.UNSIGNED_BYTE, buf2);
  sling.visible = true;

  let n = 0, x0 = W, x1 = -1, y0 = H, y1 = -1;
  for (let i = 0; i < buf1.length; i += 4) {
    const d = Math.abs(buf1[i] - buf2[i]) + Math.abs(buf1[i + 1] - buf2[i + 1]) + Math.abs(buf1[i + 2] - buf2[i + 2]);
    if (d > 40) {
      const px = (i / 4) % W, py = Math.floor((i / 4) / W); // readPixels origin is bottom-left
      n++;
      if (px < x0) x0 = px; if (px > x1) x1 = px;
      if (py < y0) y0 = py; if (py > y1) y1 = py;
    }
  }
  return {
    n, W, H, x0, x1, y0: H - y1, y1: H - y0, // flip to top-left coords for humans
    meshRifleCount: (() => { let c = 0; sling.traverse(o => { if (o.isMesh) c++; }); return c; })(),
  };
});

console.log('RIFLE DIFF:', JSON.stringify(result, null, 2));
console.log(logs.length ? 'ERRORS:\n' + logs.join('\n') : 'NO_ERRORS');
await browser.close();

const w = result.x1 - result.x0, h = result.y1 - result.y0;
const ok = result.n > 60 && w > 40 && h > 30 && result.y0 < result.H * 0.8;
console.log('RIFLE VISIBLE HIGH-ON-BACK:', ok ? 'PASS' : 'FAIL');
process.exit(ok ? 0 : 2);