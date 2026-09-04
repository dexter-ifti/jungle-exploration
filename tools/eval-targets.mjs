// Evaluates current procedural render against the 3 target images
import { chromium } from 'playwright';
import fs from 'fs';
import { execSync } from 'child_process';

const outDir = 'eval_renders';
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
await page.waitForFunction(() => typeof window.__setT === 'function', { timeout: 60000 });

const targets = [
  { t: 0.00, file: `${outDir}/01-trailhead.png`, target: 'target-images/01-trailhead.jpg' },
  { t: 0.47, file: `${outDir}/03-ruins.png`, target: 'target-images/03-ruins.jpg' },
  { t: 0.49, file: `${outDir}/04-temple-clearing.png`, target: 'target-images/04-temple-clearing.jpg' },
];

for (const item of targets) {
  await page.evaluate(t => window.__setT(t), item.t);
  await page.waitForTimeout(1400);
  await page.screenshot({ path: item.file });
  console.log(`Rendered t=${item.t} -> ${item.file}`);
}

await browser.close();

// Run python comparison
execSync(`python3 tools/compare.py`, { stdio: 'inherit' });
