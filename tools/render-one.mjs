// Render a single frame at a given trail t value
import { chromium } from 'playwright';

const outName = process.argv[2] || 'renders_s5/view.png';
const stop = Number(process.argv[3] || 0.99);

const browser = await chromium.launch({ args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
await page.waitForTimeout(3500);
await page.waitForFunction(() => !!window.__scene, { timeout: 5000 }).catch(() => {});
await page.evaluate(t => window.__setT(t), stop);
await page.waitForTimeout(1500);
await page.screenshot({ path: outName });
console.log('saved', outName);
await browser.close();
