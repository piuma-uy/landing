// Espera fuentes (incluidos acentos) e imágenes decodificadas; falla si algo no cargó.
async function listo(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map((i) => (i.complete ? i.decode().catch(() => {}) : new Promise((r) => (i.onload = i.onerror = r)))));
    const rotas = [...document.images].filter((i) => !i.naturalWidth).map((i) => i.src);
    if (rotas.length) throw new Error('Imágenes sin cargar: ' + rotas.join(', '));
    const fuentes = ['500 1em "Playfair Display"', 'italic 500 1em "Playfair Display"', '400 1em Inter', '500 1em Inter'];
    await Promise.all(fuentes.map((f) => document.fonts.load(f, 'áéíóúñ¿')));
    const faltan = fuentes.filter((f) => !document.fonts.check(f, 'áéíóúñ¿'));
    if (faltan.length) throw new Error('Fuentes sin cargar: ' + faltan.join(', '));
  });
}

module.exports = { listo };
