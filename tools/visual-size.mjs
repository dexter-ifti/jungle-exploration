// Dump composer-rendered frames (char off/on) to PNGs for inspection.
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 960, height: 720 } });
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__scene, { timeout: 90000 });
await page.waitForFunction(() => window.__scene?.getObjectByName('FabQuantumCharacter') != null, { timeout: 120000 });
await page.waitForTimeout(1200);
const shots = await page.evaluate(() => {
  const T = window.__THREE, scene = window.__scene, cam = window.__camera;
  const g = window.__renderer.getContext();
  const W = g.drawingBufferWidth, H = g.drawingBufferHeight;
  const fab = scene.getObjectByName('FabQuantumCharacter');
  const p = fab.position;
  cam.position.set(p.x, p.y + 1.1, p.z + 3.2);
  cam.lookAt(p.x, p.y + 0.95, p.z);
  cam.updateMatrixWorld();
  // god rays radial-blur the whole screen around the sun; the character
  // occluding the sun changes shafts everywhere — disable for a clean diff.
  window.__postprocess.godRaysPass.enabled = false;
  const snap = () => {
    window.__postprocess.render(1.0, new T.Vector3(-50, 130, -30));    const b = new Uint8Array(W * H * 4);
    g.readPixels(0, 0, W, H, g.RGBA, g.UNSIGNED_BYTE, b);
    return b;
  };
  fab.visible = false;
  const A = snap();
  fab.visible = true;
  const B = snap();
  const toPng = (buf) => {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(W, H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const s = ((H - 1 - y) * W + x) * 4, d = (y * W + x) * 4;
      img.data[d] = buf[s]; img.data[d+1] = buf[s+1]; img.data[d+2] = buf[s+2]; img.data[d+3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return c.toDataURL('image/png');
  };
  return { A: toPng(A), B: toPng(B), W, H };
});
writeFileSync('/tmp/frame_off.png', Buffer.from(shots.A.split(',')[1], 'base64'));
writeFileSync('/tmp/frame_on.png', Buffer.from(shots.B.split(',')[1], 'base64'));
console.log('saved', shots.W, 'x', shots.H);
await browser.close();


