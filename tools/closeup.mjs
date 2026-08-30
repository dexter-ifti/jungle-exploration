// Force the trunk material to MeshBasicMaterial and re-render to see if it shows
import { chromium } from 'playwright';

const browser = await chromium.launch({ args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => console.log('PAGEERROR:', e.message));
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
await page.waitForTimeout(3500);

const result = await page.evaluate(() => {
  const scene = window.__scene;
  let tree = null;
  for (const c of scene.children) {
    if (c.isGroup && c.children.length >= 2) { tree = c; break; }
  }
  if (!tree) return { err: 'no tree' };
  for (const c of scene.children) c.visible = false;
  tree.visible = true;
  const trunk = tree.children[0];
  // replace with bright red basic
  trunk.material = new window.__THREE.MeshBasicMaterial({ color: 0xff0000 });
  return { ok: true, pos: tree.position.toArray() };
});

console.log(result);

await page.evaluate((pos) => {
  const cam = window.__camera;
  cam.position.set(pos[0] + 4, pos[1] + 5, pos[2] + 4);
  cam.lookAt(pos[0], pos[1] + 5, pos[2]);
}, result.pos);
await page.waitForTimeout(500);
await page.screenshot({ path: 'renders_s2/closeup/basic_trunk.png' });
console.log('saved');

await browser.close();
