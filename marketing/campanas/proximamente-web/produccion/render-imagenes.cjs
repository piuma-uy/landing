// Renderiza las piezas fijas (posts, portada del reel) desde fuentes/*.html con Chromium.
// Espera fuentes e imágenes antes de cada captura. Uso: node render-imagenes.cjs [pieza...]
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE ? path.resolve(process.env.PLAYWRIGHT_MODULE) : 'playwright');
const { listo } = require('./listo.cjs');

const RAIZ = path.join(__dirname, '..');
const PIEZAS = {
  'post-01': { html: 'post-01-marca.html', out: 'post-01-marca.png', w: 1080, h: 1350 },
  'post-02': { html: 'post-02-proximamente-web.html', out: 'post-02-proximamente-web.png', w: 1080, h: 1350 },
  portada: { html: 'reel-portada.html', out: 'reel-portada.png', w: 1080, h: 1920 },
};


(async () => {
  const pedidas = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(PIEZAS);
  const browser = await chromium.launch();
  for (const id of pedidas) {
    const p = PIEZAS[id];
    const page = await browser.newPage({ viewport: { width: p.w, height: p.h }, deviceScaleFactor: 1 });
    await page.goto('file://' + path.join(RAIZ, 'fuentes', p.html));
    await listo(page);
    await page.screenshot({ path: path.join(RAIZ, p.out) });
    console.log('ok', p.out);
    await page.close();
  }
  await browser.close();
})();
