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

// render at a fixed t close to the ruins approach
await page.evaluate(() => window.__setT(0.9));
await page.waitForTimeout(800);
await page.evaluate(() => { window.__setT = () => {}; });
await page.waitForTimeout(1500);
await page.screenshot({ path: outName });
console.log('saved', outName);
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO_ERRORS');
await browser.close();
