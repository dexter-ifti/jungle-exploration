// Render harness: loads the game headless, walks the trail, captures frames.
// Usage: node tools/render.mjs outdir [pauseMs]
import { chromium } from 'playwright';
import fs from 'fs';

const outDir = process.argv[2] || 'renders';
const pause = Number(process.argv[3] || 1200);
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
await page.waitForFunction(() => typeof window.__setT === 'function', { timeout: 60000 });

const stops = [0.0, 0.18, 0.38, 0.55, 0.72, 0.85, 0.95];
for (let i = 0; i < stops.length; i++) {
  await page.evaluate(t => window.__setT(t), stops[i]);
  await page.waitForTimeout(pause);
  const name = `${outDir}/frame_${i}_${stops[i].toFixed(2)}.png`;
  await page.screenshot({ path: name });
  console.log('saved', name);
}

// FPS probe at mid-trail
await page.evaluate(() => window.__setT(0.4));
await page.waitForTimeout(800);
const fps = await page.evaluate(() => new Promise(res => {
  let n = 0; const t0 = performance.now();
  const tick = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(tick); else res(n / 2); };
  requestAnimationFrame(tick);
}));
console.log('FPS:', fps.toFixed(1));

console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO_PAGE_ERRORS');
await browser.close();
