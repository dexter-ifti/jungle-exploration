// Verify the walker state evolves over time
import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(35000);
  const r = await page.evaluate(() => !!window.__scene ? 'ready' : 'not ready');
  if (r !== 'ready') { console.log('not ready'); await browser.close(); return; }

  // sample camera position at t=0.04, then at t=0.06, with W held
  await page.evaluate(() => window.__setT(0.04));
  await page.waitForTimeout(1000);
  // simulate W press
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(100);
  const samples = [];
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(200);
    const pos = await page.evaluate(() => {
      const c = window.__camera;
      return c.position.toArray().map(x => +x.toFixed(3));
    });
    samples.push({ t: i * 0.2, pos });
  }
  await page.keyboard.up('KeyW');
  await page.waitForTimeout(500);
  // after releasing W, sample again to see decel
  const afterStop = [];
  for (let i = 0; i < 4; i++) {
    await page.waitForTimeout(200);
    const pos = await page.evaluate(() => {
      const c = window.__camera;
      return c.position.toArray().map(x => +x.toFixed(3));
    });
    afterStop.push({ t: i * 0.2, pos });
  }
  console.log('walking (W held):');
  samples.forEach(s => console.log(`  +${s.t.toFixed(1)}s:`, s.pos));
  console.log('after stop:');
  afterStop.forEach(s => console.log(`  +${s.t.toFixed(1)}s:`, s.pos));
  await browser.close();
}
main();
