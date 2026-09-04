// Check the actual LEAF_CARD_MATS material type
import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(35000);
  const r = await page.evaluate(() => !!window.__scene ? 'ready' : 'not ready');
  if (r !== 'ready') { console.log('not ready'); await browser.close(); return; }

  // Sample 5 specific leaf-card meshes and report all their material props
  const info = await page.evaluate(() => {
    const scene = window.__scene;
    const samples = [];
    scene.traverse(o => {
      if (!o.isMesh || !o.material) return;
      const m = o.material;
      // focus on materials with map AND alphaTest
      if (m.map && m.alphaTest !== undefined) {
        if (samples.length < 3) {
          samples.push({
            type: m.type,
            map: !!m.map,
            alphaTest: m.alphaTest,
            transparent: m.transparent,
            color: m.color ? m.color.getHexString() : 'no color',
            posCount: o.geometry.attributes.position.count,
            pos: o.position.toArray().map(x => +x.toFixed(1)),
          });
        }
      }
    });
    return samples;
  });
  console.log(JSON.stringify(info, null, 2));
  await browser.close();
}
main();
