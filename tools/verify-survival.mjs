// Verify the survival_character.glb swap: character replaced by the GLB,
// grounded at the trailhead, caste shadows, and railged on the terrain height.
// Usage: node tools/verify-survival.mjs  (dev server must be running on :5173)
import { chromium } from 'playwright';

const browser = await chromium.launch({ args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const logs = [];
page.on('console', m => { if (['log', 'warn', 'error'].includes(m.type())) logs.push('[' + m.type() + '] ' + m.text()); });
page.on('pageerror', e => logs.push('[pageerror] ' + e.message));

await page.goto('http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__scene, { timeout: 90000 });
await page.waitForFunction(() => window.__scene?.getObjectByName('FabQuantumCharacter') != null, { timeout: 120000 });
await page.waitForTimeout(2000); // let character sync + rifle attach settle

const info = await page.evaluate(() => {
  const scene = window.__scene, T = window.__THREE;
  const fab = scene.getObjectByName('FabQuantumCharacter');
  const guide = scene.getObjectByName('ExplorerGuide');
  const holder = scene.getObjectByName('SurvivalCharacterHolder');
  const rifle = scene.getObjectByName('RifleSling');
  const names = [];
  let meshCount = 0;
  fab.traverse(o => { if (o.isMesh) { meshCount++; names.push(o.name || 'mesh'); } });
  const bb = new T.Box3().setFromObject(fab);
  return {
    fabPresent: !!fab, fabVisible: fab ? fab.visible : null,
    guideVisible: guide ? guide.visible : null,
    holderPresent: !!holder, holderY: holder ? +holder.position.y.toFixed(3) : null,
    rifleAttached: !!rifle,
    meshCount, meshNames: [...new Set(names)].slice(0, 24),
    charsHeight: bb.isEmpty() ? null : +((bb.max.y - bb.min.y) * 100).toFixed(0) + 'cm',
    posY: +fab.position.y.toFixed(3),
    bboxMinY: +bb.min.y.toFixed(3), bboxMaxY: +bb.max.y.toFixed(3),
  };
});
console.log('INSPECT:\n' + JSON.stringify(info, null, 2));
console.log('\nLOGS:\n' + logs.join('\n'));

await page.waitForTimeout(1200);
await page.screenshot({ path: 'renders/survival_character_check.png' });
console.log('\nsaved renders/survival_character_check.png');
await browser.close();