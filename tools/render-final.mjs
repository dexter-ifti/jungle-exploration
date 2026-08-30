// Render a set of frames covering the trail for the final critic
import { chromium } from 'playwright';
import fs from 'fs';

const outDir = 'renders_post_fixes';
const stops = [0.02, 0.18, 0.38, 0.55, 0.72, 0.88, 0.985];
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
await page.waitForTimeout(3500);
await page.waitForFunction(() => !!window.__scene, { timeout: 5000 }).catch(() => {});

for (let i = 0; i < stops.length; i++) {
  await page.evaluate(t => window.__setT(t), stops[i]);
  await page.waitForTimeout(1500);
  const name = `${outDir}/frame_${i}_${stops[i].toFixed(2)}.png`;
  await page.screenshot({ path: name });
  console.log('saved', name);
}
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO_PAGE_ERRORS');
await browser.close();
