// Hard-reload the page to bust Vite's HMR cache
import { chromium } from 'playwright';

const browser = await chromium.launch({ args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => console.log('PAGEERROR:', e.message));
// bypass cache
await page.route('**/*', (route) => {
  const headers = { ...route.request().headers(), 'Cache-Control': 'no-cache' };
  route.continue({ headers });
});
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
await page.waitForTimeout(5000);
await page.waitForFunction(() => !!window.__scene, { timeout: 5000 }).catch(() => {});

const info = await page.evaluate(() => {
  if (!window.__scene) return { err: 'no scene' };
  const scene = window.__scene;
  const samples = [];
  for (const c of scene.children) {
    if (c.isGroup && c.children.length >= 2) {
      const crown = c.children[1];
      const p = crown.geometry.attributes.position;
      let xmin=Infinity, xmax=-Infinity, ymin=Infinity, ymax=-Infinity, zmin=Infinity, zmax=-Infinity;
      for (let i = 0; i < p.count; i++) {
        const x=p.getX(i), y=p.getY(i), z=p.getZ(i);
        if(x<xmin)xmin=x; if(x>xmax)xmax=x;
        if(y<ymin)ymin=y; if(y>ymax)ymax=y;
        if(z<zmin)zmin=z; if(z>zmax)zmax=z;
      }
      samples.push({
        size: { x:(xmax-xmin).toFixed(2), y:(ymax-ymin).toFixed(2), z:(zmax-zmin).toFixed(2) },
      });
      if (samples.length >= 5) break;
    }
  }
  return { total: 340, first5: samples };
});
console.log(JSON.stringify(info, null, 2));
await browser.close();
