// Read pixels from the canvas to inspect actual rendered colors
import { chromium } from 'playwright';

const browser = await chromium.launch({ args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => console.log('PAGEERROR:', e.message));
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
await page.waitForTimeout(3500);
await page.evaluate(() => window.__setT(0.05));
await page.waitForTimeout(500);
const px = await page.evaluate(() => {
  const cv = document.querySelector('canvas');
  if (!cv) return { err: 'no canvas' };
  const gl = cv.getContext('webgl2') || cv.getContext('webgl');
  const w = cv.width, h = cv.height;
  const pix = new Uint8Array(4);
  const pts = [];
  for (let yy = 0.1; yy < 0.95; yy += 0.2) for (let xx = 0.05; xx < 0.95; xx += 0.2) {
    const x = Math.floor(xx * w), y = Math.floor((1 - yy) * h);
    gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pix);
    pts.push({ x, y, rgb: Array.from(pix) });
  }
  return { w, h, pts };
});
console.log(JSON.stringify(px, null, 2));
await browser.close();
