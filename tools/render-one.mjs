// Render a single frame at a given trail t value
import { chromium } from 'playwright';

const outName = process.argv[2] || 'renders_s5/view.png';
const stop = Number(process.argv[3] || 0.99);

const browser = await chromium.launch({ args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
await page.waitForTimeout(3500);
await page.waitForFunction(() => !!window.__scene, { timeout: 5000 }).catch(() => {});

// set the player to the end of the trail so the walker places the camera
// near the falls; the camera tweak below is then just a small offset
await page.evaluate(() => window.__setT(0.985));
await page.waitForTimeout(800);
await page.evaluate(() => {
  const cam = window.__camera;
  // strafed slightly to the right to clear the centre of the falls
  cam.position.set(2, 1.7, -242);
  cam.lookAt(2, 6, -255);
});
// log camera + waterfall sheet positions
const positions = await page.evaluate(() => {
  const cam = window.__camera;
  const scene = window.__scene;
  const result = { cam: cam.position.toArray() };
  const sheets = [];
  scene.traverse(o => {
    if (!o.isMesh) return;
    if (o.material && o.material.type === 'ShaderMaterial' && o.material.uniforms && o.material.uniforms.uTime) {
      const wp = new (window.__THREE.Vector3)();
      o.getWorldPosition(wp);
      sheets.push(wp.toArray().map(x => +x.toFixed(2)));
    }
  });
  result.sheets = sheets;
  return result;
});
console.log('positions:', JSON.stringify(positions));
// disable the walker for this debug render so the camera stays put
await page.evaluate(() => { window.__setT = () => {}; });
await page.waitForTimeout(1500);
await page.screenshot({ path: outName });
console.log('saved', outName);
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO_ERRORS');
await browser.close();
