// Render a single frame at a given trail t value, with optional camera override
import { chromium } from 'playwright';

const outName = process.argv[2] || 'renders_s5/view.png';
const stop = Number(process.argv[3] || 0.99);
const camX = Number(process.argv[4] ?? '0');
const camY = Number(process.argv[5] ?? '1.7');
const camZ = Number(process.argv[6] ?? '-242');
const lookX = Number(process.argv[7] ?? '0');
const lookY = Number(process.argv[8] ?? '6');
const lookZ = Number(process.argv[9] ?? '-255');

const browser = await chromium.launch({ args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
await page.waitForTimeout(3500);
await page.waitForFunction(() => !!window.__scene, { timeout: 5000 }).catch(() => {});

await page.evaluate(t => window.__setT(t), stop);
await page.waitForTimeout(800);
await page.evaluate(({ x, y, z, lx, ly, lz }) => {
  const cam = window.__camera;
  cam.position.set(x, y, z);
  cam.lookAt(lx, ly, lz);
}, { x: camX, y: camY, z: camZ, lx: lookX, ly: lookY, lz: lookZ });
await page.evaluate(() => { window.__setT = () => {}; });
await page.waitForTimeout(1500);
await page.screenshot({ path: outName });
console.log('saved', outName);
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO_ERRORS');
await browser.close();
