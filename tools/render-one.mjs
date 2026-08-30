// Take a single screenshot at the ruins approach
import { chromium } from 'playwright';
import fs from 'fs';

const outDir = process.argv[2] || 'renders_s4';
const stop = Number(process.argv[3] || 0.94);
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => console.log('PAGEERROR:', e.message));
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
await page.waitForTimeout(3500);
await page.waitForFunction(() => !!window.__scene, { timeout: 5000 }).catch(() => {});
await page.evaluate(t => window.__setT(t), stop);
await page.waitForTimeout(2000);
const name = `${outDir}/single_${stop.toFixed(2)}.png`;
await page.screenshot({ path: name });
console.log('saved', name);
await browser.close();
