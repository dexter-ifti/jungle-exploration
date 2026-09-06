// Verify the survival character actually WALKS: holds W, samples the rig's
// foot/hand bones over time, and asserts the limbs oscillate (stride + swing)
// rather than staying frozen.
import { chromium } from 'playwright';

const browser = await chromium.launch({ args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 640, height: 480 } });
const logs = [];
page.on('console', m => logs.push('[' + m.type() + '] ' + m.text()));
page.on('pageerror', e => logs.push('[pageerror] ' + e.message));

await page.goto('http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__scene, { timeout: 90000 });
await page.waitForFunction(() => window.__scene?.getObjectByName('FabQuantumCharacter') != null, { timeout: 120000 });
await page.waitForFunction(() => window.__scene?.getObjectByName('RifleSling') != null, { timeout: 120000 });
await page.waitForTimeout(1200);

// sample rig bone world positions on the rAF loop
const samplePoses = durationMs => page.evaluate(async (ms) => {
  const T = window.__THREE, scene = window.__scene;
  const fab = scene.getObjectByName('FabQuantumCharacter');
  let sm = null; fab.traverse(o => { if (o.isSkinnedMesh && !sm) sm = o; });
  const bone = n => sm.skeleton.bones.find(b => b.name === n);
  const wpos = n => { const v = new T.Vector3(); bone(n).getWorldPosition(v); return v; };
  const out = [];
  const t0 = performance.now();
  while (performance.now() - t0 < ms) {
    await new Promise(r => requestAnimationFrame(r));
    const fl = wpos('foot_l'), fr = wpos('foot_r'), hl = wpos('hand_l');
    out.push({ t: +(performance.now() - t0).toFixed(1), flz: +fl.z.toFixed(3), fly: +fl.y.toFixed(3),
               frz: +fr.z.toFixed(3), hly: +hl.y.toFixed(3), hlz: +hl.z.toFixed(3) });
  }
  return out;
}, 700);

const idleSamples = await samplePoses(700);
// idle should be near-still
const idleRange = arr => Math.max(...arr) - Math.min(...arr);
const idleLimb = idleRange(idleSamples.map(s => s.flz));
console.log('IDLE foot_range_z:', +idleLimb.toFixed(3));

// now walk forward
await page.keyboard.down('w');
await page.waitForTimeout(120);
const walkSamples = await samplePoses(1600);
await page.keyboard.up('w');

const range = arr => Math.max(...arr) - Math.min(...arr);
const stats = (name, arr) => {
  const r = +range(arr).toFixed(3);
  console.log(`${name}: ${r} m (min ${Math.min(...arr).toFixed(3)}, max ${Math.max(...arr).toFixed(3)})`);
  return r;
};
const fzRange = stats('WALK foot_l.z  ', walkSamples.map(s => s.flz));
const fyRange = stats('WALK foot_l.y  ', walkSamples.map(s => s.fly));
const hzRange = stats('WALK hand_l.z  ', walkSamples.map(s => s.hlz));

const rigLog = logs.find(l => l.includes('rig set for gait'));
console.log('RIG LOG:', rigLog || 'MISSING');
const ok = !!rigLog && fzRange > 0.05 && hzRange > 0.03 && idleLimb < 0.02;
console.log('WALK ANIMATION:', ok ? 'PASS' : 'FAIL');
console.log(logs.filter(l => l.includes('[pageerror]')).join('\n') || 'no pageerrors');
await browser.close();
process.exit(ok ? 0 : 2);