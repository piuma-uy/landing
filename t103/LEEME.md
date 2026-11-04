# Capturas T103 · QA de la demo (tienda de prueba dev, 2026-11-04)

- `antes/`, `despues/`: Productos y stock en el celular (tabla con «Editar» fuera de pantalla → tarjetas) y pedido de una
  cuenta sin nombre (400 «Solicitud inválida» → pedido creado). «Después» es dev con el build del PR publicado.
- `recorrido/<ancho>-*`: home, catálogo, ficha, carrito, entrega, pago y panel (Resumen, Productos y stock,
  Transferencias por confirmar, Configuración) a 360, 390, 414, 768 y 1280 px.
- `recorrido/t-*`: compra con transferencia (instrucciones y referencia por teléfono). `cs-390-*` y `c-1280-*`: compra con
  tarjeta en el sandbox de Mercado Pago (APRO) hasta «¡Pago aprobado!». `a-390-*`: editar precio y stock, confirmar una
  transferencia. `g-390-*`: «Continuar con Google» llega a la pantalla de Google (el ingreso no se automatiza).
- `piuma-uy/`: la web real, sólo mirada.
