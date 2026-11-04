// Portadas 1080 × 1920 PNG. La de «Comprá en 3 pasos» usa un cuadro real de la grabación (ficha del Cubrecama
// Chiara, 1 s después de abrirla). Uso: node render-portadas.cjs
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE ? path.resolve(process.env.PLAYWRIGHT_MODULE) : 'playwright');
const { listo } = require('./listo.cjs');

const RAIZ = path.join(__dirname, '..');

(async () => {
  const base = path.join(RAIZ, 'fuentes', 'grabaciones', 'compra-3-pasos');
  const meta = JSON.parse(fs.readFileSync(base + '.json', 'utf8'));
  const jpg = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'piuma-portada-')), 'cuadro.jpg');
  const r = spawnSync('ffmpeg', ['-v', 'error', '-ss', String(meta.marcas.producto + 1.0), '-i', base + '.mp4', '-frames:v', '1', '-q:v', '1', jpg]);
  if (r.status !== 0) throw new Error('ffmpeg no pudo sacar el cuadro');

  const browser = await chromium.launch({ args: ['--allow-file-access-from-files'] });
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  for (const pieza of ['portada-ya-esta-pronto', 'portada-compra-3-pasos']) {
    await page.goto('file://' + path.join(RAIZ, 'fuentes', pieza + '.html'));
    const img = await page.$('#cuadro');
    if (img) await img.evaluate((e, src) => { e.src = src; return e.decode(); }, 'file://' + jpg);
    await listo(page);
    await page.screenshot({ path: path.join(RAIZ, pieza + '.png') });
    console.log('ok', pieza + '.png');
  }
  await browser.close();
  fs.rmSync(path.dirname(jpg), { recursive: true, force: true });
})();
