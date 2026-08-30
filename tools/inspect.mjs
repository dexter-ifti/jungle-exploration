// Look at the scene from a closer angle to verify ferns/herbs exist
import { chromium } from 'playwright';

const browser = await chromium.launch({ args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
page.on('pageerror', e => console.log('PAGEERROR:', e.message));
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
await page.waitForTimeout(5000);
await page.waitForFunction(() => !!window.__scene, { timeout: 5000 }).catch(() => {});

// Walk to t=0.18
await page.evaluate(() => window.__setT(0.18));
await page.waitForTimeout(800);

// Find a fern near the trail at the current t
const camAndFern = await page.evaluate(() => {
  const scene = window.__scene;
  // Find a small mesh (likely fern/herb) near the trail at the camera position
  // First get camera position from a known t
  // Actually we just look for any small mesh close to the trail at z=6
  const cam = window.__camera;
  const cp = cam.position;
  // look for ferns
  const ferns = [];
  scene.traverse(o => {
    if (!o.isMesh) return;
    if (o.material?.type !== 'MeshLambertMaterial') return;
    const bb = o.geometry.boundingBox;
    if (!bb) return;
    const sz = bb.max.y - bb.min.y;
    if (sz < 2 && o.position.y < 1.5) {
      const dist = Math.hypot(o.position.x - cp.x, o.position.z - cp.z);
      ferns.push({ pos: o.position.toArray().map(v => +v.toFixed(1)), size: +sz.toFixed(2), dist: +dist.toFixed(1) });
    }
  });
  ferns.sort((a, b) => a.dist - b.dist);
  return { camPos: cp.toArray().map(v => +v.toFixed(1)), nearbyFerns: ferns.slice(0, 5) };
});
console.log(JSON.stringify(camAndFern, null, 2));

// Move camera near a fern and screenshot
const fern = camAndFern.nearbyFerns[0];
if (fern) {
  await page.evaluate((f) => {
    const cam = window.__camera;
    cam.position.set(f.pos[0], 1.7, f.pos[2] - 1.5);
    cam.lookAt(f.pos[0], 0.4, f.pos[2]);
  }, fern);
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'renders_s2/fern_closeup.png' });
  console.log('saved fern_closeup.png');
}

await browser.close();
