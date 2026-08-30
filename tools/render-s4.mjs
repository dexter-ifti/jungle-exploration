// Render only the ruins approach frames (0.72, 0.85, 0.95) to save time
import { chromium } from 'playwright';
import fs from 'fs';

const outDir = process.argv[2] || 'renders_s4';
const stops = [0.88, 0.93, 0.97];
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);

const hasT = await page.evaluate(() => typeof window.__setT === 'function');

for (let i = 0; i < stops.length; i++) {
  if (hasT) await page.evaluate(t => window.__setT(t), stops[i]);
  await page.waitForTimeout(1500);
  const name = `${outDir}/frame_${i}_${stops[i].toFixed(2)}.png`;
  await page.screenshot({ path: name });
  console.log('saved', name);
}
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO_PAGE_ERRORS');
await browser.close();
