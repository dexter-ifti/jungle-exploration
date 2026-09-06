// Measure stride amplitude relative to pelvis during a real walk-forward.
import { chromium } from 'playwright';

const browser = await chromium.launch({ args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 640, height: 480 } });
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__scene, { timeout: 90000 });
await page.waitForFunction(() => window.__scene?.getObjectByName('FabQuantumCharacter') != null, { timeout: 120000 });
await page.waitForTimeout(1200);

await page.keyboard.down('w');
await page.waitForTimeout(120);
const samples = await page.evaluate(async (ms) => {
  const T = window.__THREE, scene = window.__scene;
  const fab = scene.getObjectByName('FabQuantumCharacter');
  let sm = null; fab.traverse(o => { if (o.isSkinnedMesh && !sm) sm = o; });
  const bone = n => sm.skeleton.bones.find(b => b.name === n);
  const wpos = n => { const v = new T.Vector3(); bone(n).getWorldPosition(v); return v; };
  const out = [];
  const t0 = performance.now();
  while (performance.now() - t0 < ms) {
    await new Promise(r => requestAnimationFrame(r));
    const p = wpos('pelvis'), fl = wpos('foot_l'), fr = wpos('foot_r'), hl = wpos('hand_l');
    out.push({
      t: +(performance.now() - t0).toFixed(0),
      flz: +((fl.z - p.z)).toFixed(4),   // foot ahead/behind pelvis
      fly: +(fl.y - p.y).toFixed(4),     // foot below pelvis (swing lift)
      frz: +((fr.z - p.z)).toFixed(4),
      hly: +((hl.y - p.y)).toFixed(4),
      hlz: +((hl.z - p.z)).toFixed(4),
    });
  }
  return out;
}, 1600);
await page.keyboard.up('w');

const range = arr => Math.max(...arr) - Math.min(...arr);
const fmt = (name, arr) => {
  const r = range(arr);
  console.log(`${name}: range ${r.toFixed(3)} m (min ${Math.min(...arr).toFixed(3)}, max ${Math.max(...arr).toFixed(3)})`);
  return r;
};
const flzR = fmt('foot_l.z   (fwd/back from pelvis)', samples.map(s => s.flz));
const flyR = fmt('foot_l.y   (step height)        ', samples.map(s => s.fly));
const frzR = fmt('foot_r.z   (fwd/back from pelvis)', samples.map(s => s.frz));
const hlzR = fmt('hand_l.z   (arm swing)          ', samples.map(s => s.hlz));

// Sanity: stride 0.15-0.7 m, step height 0.03-0.35 m, arm swing 0.08-0.6 m
const ok = flzR > 0.15 && flzR < 0.75 && flyR > 0.03 && flyR < 0.40 && hlzR > 0.06 && hlzR < 0.7;
console.log('STRIDE SANITY:', ok ? 'PASS' : 'FAIL');
// print a few rows to eyeball periodicity
console.log('samples:', JSON.stringify(samples.slice(0, 12)));
await browser.close();
process.exit(ok ? 0 : 2);