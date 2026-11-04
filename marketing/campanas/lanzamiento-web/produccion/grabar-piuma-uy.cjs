// Toma corta de https://piuma.uy en el teléfono para «Ya está pronto»: abre el inicio y baja despacio hasta
// «Nuestra colección». Sin interacción con la tienda (en piuma.uy el comercio sigue apagado).
// Uso: PLAYWRIGHT_MODULE=<ruta a node_modules/playwright> node grabar-piuma-uy.cjs
const path = require('node:path');
const { abrir, Grabador } = require('./grabador.cjs');

const SALIDA = path.join(__dirname, '..', 'fuentes', 'grabaciones', 'piuma-uy-inicio');
const URL = process.env.PIUMA_URL ?? 'https://piuma.uy/';

(async () => {
  const { browser, page } = await abrir();
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForTimeout(2000);
  // Carga las imágenes diferidas del catálogo antes de grabar, así no aparecen en blanco al bajar.
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 400) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 120));
    }
    window.scrollTo(0, 0);
    await Promise.all([...document.images].map((i) => (i.complete ? null : new Promise((r) => (i.onload = i.onerror = r)))));
  });
  await page.waitForTimeout(800);
  const g = new Grabador(page);
  await g.empezar();
  g.marca('inicio');
  await g.esperar(900);
  const coleccion = page.getByRole('heading', { name: 'Nuestra colección' });
  await g.desplazarA(coleccion, 90, 1600);
  g.marca('coleccion');
  await g.esperar(1200);
  g.marca('fin');
  await g.terminar(SALIDA);
  await browser.close();
})();
