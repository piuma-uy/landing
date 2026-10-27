// Captura la implementación real de la nueva web (entorno dev, rama tienda-local) en viewport de teléfono.
// No modifica la página: sólo usa un viewport alto para que hero y catálogo entren sin desplazar,
// espera fuentes e imágenes y guarda la captura completa. El recorte (sin rótulo de prueba, sin
// botón flotante, sin precios, sin encabezado con carrito) se hace después, en la composición.
// Uso: node capturar-web.cjs [url]   (ver README: hace falta el paquete playwright)
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const URL = process.argv[2] || 'https://d1tm58a521hftd.cloudfront.net/';
const OUT = path.join(__dirname, '..', 'fuentes', 'capturas');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 390, height: 2000 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    locale: 'es-UY',
  });
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      [...document.images].filter((i) => !i.complete).map((i) => new Promise((r) => (i.onload = i.onerror = r))),
    );
  });
  await page.waitForTimeout(1500); // animaciones de entrada del sitio
  const marks = await page.evaluate(() => {
    const top = (sel) => {
      const el = document.querySelector(sel);
      return el ? Math.round(el.getBoundingClientRect().top + scrollY) : null;
    };
    return { header: document.querySelector('header')?.getBoundingClientRect().height, catalogo: top('#catalogo') };
  });
  console.log('marcas (px CSS):', JSON.stringify(marks));
  await page.screenshot({ path: path.join(OUT, 'web-inicio-catalogo.png') });
  await browser.close();
})();
