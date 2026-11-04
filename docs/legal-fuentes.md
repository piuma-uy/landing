# Textos legales: normas y fuentes (T105)

Qué exige la ley a la tienda y dónde quedó cada cosa en [`src/app/core/legal.ts`](../src/app/core/legal.ts)
(`/privacidad/`, `/terminos/`, `/cambios-y-devoluciones/`). Las páginas no citan artículos; las citas están acá.
Criterio: **sólo lo que la ley exige**; nada de marketing ni promesas extra. Lo que sólo puede definir Piuma queda
marcado `[A CONFIRMAR …]` y `LEGAL_DRAFT = true` impide publicarlo (ver [seo.md](seo.md)).

**No es asesoramiento legal**: conviene que un abogado o el contador de Distrifoto SRL lo revise antes de publicar.

Todas las fuentes se abrieron y leyeron el **2026-11-04** (texto actualizado de IMPO a esa fecha).

## Fuentes

| Norma / página                                                                 | Enlace                                                                                                                                                         |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ley 17.250, Relaciones de consumo (texto actualizado)                           | <https://www.impo.com.uy/bases/leyes/17250-2000>                                                                                                               |
| Decreto 244/000, reglamento de la Ley 17.250                                    | <https://www.impo.com.uy/bases/decretos/244-2000>                                                                                                              |
| Ley 20.531, Rendición de Cuentas 2025 (art. 2 vigencia, art. 108 nuevo art. 16) | <https://www.impo.com.uy/bases/leyes/20531-2026> · art. 108: <https://www.impo.com.uy/bases/leyes/20531-2026/108>                                               |
| Ley 17.250 art. 16 (texto actualizado, notas de vigencia y reglamentación; T109) | <https://www.impo.com.uy/bases/leyes/17250-2000/16>                                                                                                            |
| Decreto 167/021 (incorpora la Res. GMC 37/19, comercio electrónico)             | <https://www.impo.com.uy/bases/decretos/167-2021> · anexo: <https://www.impo.com.uy/bases/decretos-internacional/167-2021/1>                                    |
| Decreto 51/026 (comercio electrónico con intermediarios; no aplica a Piuma)     | <https://www.impo.com.uy/bases/decretos/51-2026>                                                                                                               |
| Ley 18.331, Protección de datos personales (texto actualizado)                  | <https://www.impo.com.uy/bases/leyes/18331-2008>                                                                                                               |
| Decreto 414/009, reglamento de la Ley 18.331                                    | <https://www.impo.com.uy/bases/decretos/414-2009>                                                                                                              |
| Ley 19.670, arts. 37 a 40 (alcance, vulneraciones de seguridad, delegado)       | <https://www.impo.com.uy/bases/leyes/19670-2018>                                                                                                               |
| URCDP, Resolución 63/023 (países adecuados; EE.UU. sólo con Data Privacy Framework) | <https://www.gub.uy/unidad-reguladora-control-datos-personales/institucional/normativa/resolucion-n-63023>                                                 |
| URCDP, Resolución 23/021 (EE.UU. deja de ser adecuado)                          | <https://www.gub.uy/unidad-reguladora-control-datos-personales/comunicacion/noticias/cambios-regimen-transferencias-internacionales-datos-uruguay>              |
| MEF, ¿puede el consumidor dejar sin efecto una compra web? (22/11/2024)         | <https://www.gub.uy/ministerio-economia-finanzas/comunicacion/publicaciones/consumidor-tiene-derecho-dejar-sin-efecto-compraventa-hecha-web-haciendo>          |
| MEF, «puse 10 días en mis términos» (28/11/2024)                               | <https://www.gub.uy/ministerio-economia-finanzas/comunicacion/publicaciones/terminos-condiciones-mi-portal-puse-consumidor-tiene-10-dias-para>                  |
| Trámite de reclamo ante Defensa del Consumidor (0800 7005; act. 31/07/2026)     | <https://www.gub.uy/tramites/consulta-reclamo-yo-denuncia-materia-defensa-consumidor>                                                                          |
| Mercado Pago Uruguay, declaración de privacidad (MercadoPago Uruguay S.R.L.)    | <https://www.mercadopago.com.uy/privacidad/declaracion-privacidad/current> · términos: <https://www.mercadopago.com.uy/ayuda/terminos-y-politicas_194>         |
| Datos técnicos de la tienda (AWS us-east-2, PostHog US, logs 14 días)           | `piuma-backend/docs/monitoreo.md`, `README.md`, `data/shipping.piuma.json`                                                                                     |

## Defensa del consumidor (términos y cambios)

| Obligación                                                                                                                                                  | Norma                                                         | Dónde                                                    |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------- |
| Mostrar, antes de comprar y fácil de ver: nombre comercial y razón social, **domicilio físico**, mail de atención y RUT                                     | Dec. 167/021, Res. 37/19 art. 2 I–IV; Ley 17.250 art. 16 inc. «domicilio» (no basta un casillero) | Términos › Quién vende; Privacidad › Responsable          |
| Información en español; si hay dos contradictorias, vale la más favorable al consumidor                                                                     | Ley 17.250 art. 13                                            | Todo el sitio                                            |
| Precio con impuestos incluidos, y todo gasto adicional (envío) discriminado antes de confirmar                                                             | Ley 17.250 art. 15 A; Dec. 244/000 arts. 2–3; Res. 37/19 art. 2 VIII | Términos › Precios                                       |
| Informar si pagar con tarjeta tiene cargo adicional (no lo tiene: el API cobra el mismo total)                                                             | Dec. 244/000 art. 3                                           | Términos › Precios                                       |
| Financiación de terceros: decir quién la da; cuotas, interés y total                                                                                        | Ley 17.250 art. 15 B; Dec. 244/000 arts. 4–5; Res. 37/19 art. 2 IX | Términos › Formas de pago (las cuotas son de Mercado Pago o del emisor) |
| Condiciones y límites de la oferta (reserva y vencimiento del pedido)                                                                                       | Res. 37/19 art. 2 X; Ley 17.250 art. 12                       | Términos › Cómo se compra                                |
| Resumen del pedido, corrección de errores y confirmación expresa                                                                                            | Res. 37/19 arts. 4–5                                          | Términos › Cómo se compra (y el checkout ya lo hace)     |
| Términos accesibles y que se puedan guardar                                                                                                                 | Res. 37/19 art. 3                                             | Páginas públicas, prerenderizadas e imprimibles          |
| Derecho de arrepentimiento informado por escrito, claro y sin condiciones; si no se informa, el plazo no corre                                             | Ley 17.250 art. 16 (incs. 6–7, Ley 19.355); MEF 22 y 28/11/2024 | Términos y Cambios                                       |
| Plazo **hasta el 31/12/2026**: 5 días hábiles desde el contrato o la entrega, a opción del consumidor; aviso por medio fehaciente                          | Ley 17.250 art. 16 inc. 1                                     | Términos y Cambios                                       |
| Plazo **desde el 1/1/2027**: 10 días corridos desde el contrato o la entrega                                                                                | Ley 20.531 arts. 2 y 108                                      | Términos y Cambios                                       |
| Producto sin uso y en el estado recibido (se puede abrir para revisarlo); la tienda devuelve todo lo pagado de inmediato, al mismo tiempo que recibe el producto | Ley 17.250 art. 16 inc. 3; Dec. 244/000 art. 6; MEF 22/11/2024 | Términos y Cambios                                       |
| **Cada parte paga el costo de su restitución**: el envío de vuelta es del consumidor; la tienda devuelve lo pagado (incluido el envío original)            | Ley 17.250 art. 16 inc. 3; MEF 22/11/2024 («gastos de retorno… de cargo del consumidor») | Términos y Cambios                                       |
| Pago con tarjeta: quedan sin efecto las cuotas; desde 2027 el proveedor hace la gestión ante el emisor                                                      | Ley 17.250 art. 16 inc. 3; Ley 20.531 art. 108                | Términos y Cambios                                       |
| Excepciones al arrepentimiento (productos personalizados, precintados por higiene, etc.): ninguna aplica a la ropa de cama de Piuma, no se mencionan       | Ley 17.250 art. 16-BIS (Ley 19.924)                           | —                                                        |
| Incumplimiento o defecto: el consumidor elige cumplimiento, otro producto o devolución de lo pagado                                                          | Ley 17.250 arts. 32–33                                        | Términos › Productos con defectos; Cambios               |
| Plazos de reclamo: vicios aparentes 90 días (bienes duraderos; 30 si no duraderos) desde la entrega; vicios ocultos que aparezcan en 6 meses, 3 meses para reclamar | Ley 17.250 art. 37                                            | Términos y Cambios (se usa 90 días: la ropa de cama se trata como bien duradero, y ante la duda vale lo más favorable, art. 13) |
| Garantía contractual: sólo si se ofrece, por escrito y con contenido mínimo. **Piuma no ofrece una**, así que no se publica                                 | Ley 17.250 art. 23                                            | —                                                        |
| Atención de consultas y reclamos                                                                                                                             | Res. 37/19 art. 7; Ley 17.250 art. 6 G                        | Términos › Consultas y reclamos                          |

### «Botón de arrepentimiento» (T109)

Releído el **2026-11-04** en IMPO: la Ley 20.531 (art. 108, que sustituye el art. 16 de la Ley 17.250; vigencia
1/1/2027 por su art. 2) dice que, en las ventas por medios informáticos, el proveedor tiene que mostrar **un vínculo
visible, en un lugar destacado y desde el primer acceso, llamado «Botón de arrepentimiento»**, y que usarlo **vale como
medio fehaciente** para comunicar el arrepentimiento. No pide campos, plazo de respuesta, acuse por mail ni registro
de datos. **Reglamentación**: el art. 16 en el texto actualizado de IMPO no tiene nota «Reglamentado por» propia (sólo
«Ver vigencia: Ley 20.531 arts. 2 y 108»); la ley entera sigue reglamentada por el Decreto 244/000 (su art. 6 trata la
devolución de lo pagado) y a esa fecha no se encontró un decreto del Poder Ejecutivo sobre el botón. Si sale uno,
revisar esto.

| Lo que pide la norma                                         | Cómo quedó                                                                                                                                                                                                                 |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vínculo llamado «Botón de arrepentimiento»                    | Ese texto exacto (`WITHDRAWAL_LABEL` en `src/app/core/withdrawal.ts`; un test lo fija)                                                                                                                                    |
| Visible, destacado, desde el primer acceso                    | Botón contorneado en el pie de **todas** las páginas (también en el HTML prerenderizado y con el borrador legal en prod) y en cada pedido pagado de «Mis pedidos»; abre `/arrepentimiento/`                                |
| Que sirva para ejercer el derecho (medio fehaciente)          | Formulario mínimo: número de pedido, mail o teléfono de la compra y motivo **opcional** (la ley dice «sin responsabilidad alguna» y no pide motivo). Sin sesión. Constancia en pantalla con número de solicitud y fecha      |
| (Operativo) que la tienda se entere                           | `POST /withdrawal-requests` lo guarda en DynamoDB; mail al mail de avisos si las notificaciones están desplegadas, y siempre en el panel, «Resumen» › «Pedidos de arrepentimiento» (`piuma-backend` docs/architecture.md, invariante 20) |
| Plazo: 10 días corridos desde la compra o la entrega (2027)   | La página lo dice, con el de hoy (5 días hábiles hasta el 31/12/2026). La API no rechaza pedidos fuera de plazo: lo evalúa la tienda                                                                                         |

También quedan los otros medios: la página ofrece mail y WhatsApp (y el HTML sin JavaScript sólo eso), y
`/terminos/` y `/cambios-y-devoluciones/` remiten al botón con un enlace. Interpretación abierta: «desde el primer
acceso» se cumple con el pie, que está en la primera página que se abre; si un reglamento pidiera el vínculo en la
parte visible sin bajar, habría que sumarlo al encabezado.

## Datos personales (privacidad)

| Obligación                                                                                                                       | Norma                                                         | Dónde                                         |
| -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | --------------------------------------------- |
| Al recabar datos, informar: finalidad y destinatarios; existencia de la base, identidad y **domicilio** del responsable          | Ley 18.331 art. 13 A–B (red. Ley 20.075)                      | Responsable; Qué datos tratamos; Quién accede |
| Carácter obligatorio o facultativo de los datos y consecuencias de no darlos o darlos mal                                       | Ley 18.331 art. 13 C–D                                         | Si no nos das tus datos                       |
| Derechos de acceso, rectificación, actualización, inclusión y supresión; cómo ejercerlos                                         | Ley 18.331 arts. 13 E, 14, 15; Dec. 414/009 arts. 9–13        | Tus derechos                                  |
| Existencia o no de transferencias internacionales                                                                                | Ley 18.331 art. 13 F                                           | Transferencia internacional                   |
| Respuesta en 5 días hábiles, gratis; acceso gratuito cada 6 meses salvo interés legítimo; acreditar identidad                    | Ley 18.331 arts. 14–15; Dec. 414/009 art. 9                   | Tus derechos                                  |
| Finalidad: no usar los datos para otros fines; borrarlos cuando dejan de ser necesarios                                         | Ley 18.331 art. 8                                              | Qué datos tratamos; Cuánto tiempo             |
| Consentimiento: no hace falta para datos que derivan del contrato y son necesarios para cumplirlo                               | Ley 18.331 art. 9 D                                            | No se pide casilla aparte                     |
| Proveedores que acceden para prestar el servicio (AWS, Mercado Pago) no son «comunicación» de datos                              | Dec. 414/009 art. 14                                           | Quién accede                                  |
| Transferencia a EE.UU. (AWS us-east-2): EE.UU. no es adecuado salvo empresas del Data Privacy Framework; se apoya en que es **necesaria para cumplir el contrato** | Ley 18.331 art. 23 B; Res. URCDP 23/021 y 63/023 | Transferencia internacional                   |
| **Inscribir la base** en el Registro de la URCDP (persona jurídica, sin excepción), dentro de 90 días de empezar a operar, y **exhibir número y fecha de la resolución** | Ley 18.331 arts. 28–29; Dec. 414/009 arts. 15 B, 16, 17 y 19 | Responsable (`[A CONFIRMAR]`)                 |
| Avisar a los titulares y a la URCDP si hay una vulneración de seguridad (obligación operativa, no va en la página)              | Ley 19.670 art. 38; Dec. 64/020                                | —                                             |
| Delegado de protección de datos: no aplica (no hay datos sensibles ni grandes volúmenes)                                         | Ley 19.670 art. 40                                             | —                                             |
| Reclamo ante la URCDP                                                                                                            | Ley 18.331 arts. 14–15 (vencido el plazo, acción de habeas data) | Tus derechos                                  |

Notas:

- **PostHog** (EE.UU.): eventos anónimos, sin cookies, sin PII, IP descartada (`monitoreo.md`). No se describe como
  transferencia de datos personales; igual se informa en la página.
- **Twilio** (WhatsApp automático) está diferido y apagado: si se prende, sumarlo en «Quién más accede».
- **Promociones**: hoy no se mandan. Si Piuma quiere mandarlas, hace falta consentimiento aparte (Ley 18.331 art. 9;
  Dec. 414/009 art. 6: dos opciones sin premarcar) y agregarlo a la política.
- **Plazo contable**: la página remite «al plazo que exigen las normas contables y tributarias» sin dar un número; la
  ley no obliga a publicarlo (art. 13 no lo pide), pero conviene que el contador lo fije para el registro de la base
  (Dec. 414/009 art. 16 F).

## Cómo lo resuelven tiendas online chicas de Uruguay (referencia de tono y alcance)

Pedido de Guillermo (2026-11-04): tomar como referencia a tiendas uruguayas con web propia, **sin copiar textos**. Se
abrieron estas páginas el 2026-11-04; de ellas se tomó la estructura y el tono, no la redacción. Lo que decide el
contenido sigue siendo la ley (tablas de arriba).

| Tienda                                    | Páginas abiertas                                                                                                                                                                            | Qué se tomó / qué no                                                                                                                                                                                                                                                                                         |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Mintt** (ropa de cama, marca chica)     | <https://mintt.com.uy/terminos-y-condiciones> · <https://mintt.com.uy/condiciones-de-compra> · <https://mintt.com.uy/envios-y-devoluciones>                                                 | Mismo rubro y mismo esquema de tres páginas cortas. No muestra razón social, RUT ni domicilio, no nombra el art. 16 y da un plazo de cambio distinto en dos páginas (15 y 20 días): por eso acá un mismo texto alimenta las dos páginas (`withdrawal*` y `defects` en `legal.ts`) y van los datos del Dec. 167/021. |
| **Tiendas Montevideo** (blanquería y hogar) | <https://www.tiendasmontevideo.com.uy/como-comprar/>                                                                                                                                      | Separa la entrega (plazos en días hábiles) del cambio comercial en local (15 días con ticket). Ese cambio es una política propia, no una obligación: Piuma no la tiene y no se inventa.                                                                                                                       |
| **Mira** (mira.uy, Masdelar S.A.)         | <https://mira.uy/terminos-condiciones>                                                                                                                                                      | Arrepentimiento con el art. 16, aviso por mail como medio fehaciente y reintegro por el mismo medio de pago, con domicilio y mail del proveedor: mismo alcance que el nuestro. No se tomaron sus cláusulas de exoneración o límite de responsabilidad, ni el consentimiento publicitario: la ley no las pide.            |
| **Mi Uruguay** (miuruguay.com.uy, Mvdeo S.A.) | <https://miuruguay.com.uy/terminos-de-compra-online/>                                                                                                                                   | Razón social, RUT y domicilio a la vista; sección propia de arrepentimiento (plazo, producto sin uso, reintegro total por el mismo medio) y privacidad remitida a la Ley 18.331, la 19.670 y sus decretos. Es el modelo más cercano al de Piuma.                                                         |

Conclusión: las tiendas chicas publican textos cortos, en segunda persona y en tres páginas (compra, privacidad,
cambios); las que cumplen muestran razón social, RUT y domicilio y explican el art. 16 sin condiciones. Los textos de
Piuma siguen ese tono y ese alcance, sin las cláusulas extra que algunas agregan (exoneraciones, precios «sujetos a
cambios sin aviso», consentimiento publicitario) porque la ley no las exige y algunas chocan con los arts. 12 y 14 de
la Ley 17.250.

## Qué se sacó del borrador de T89 y por qué

- Garantía propia con plazo a definir, aviso de daño «en 48 horas», fotos/colores, error de precio, menores, cambios
  de la política, medidas de seguridad, política propia de cambios de talle o color: la ley no los exige; algunos
  podían restringir derechos (un plazo de aviso menor que el del art. 37, o cancelar por error de precio contra los
  arts. 12 y 14). Si Piuma quiere ofrecer algo más, se agrega como mejora y nunca recorta lo legal.

## Pendiente de Piuma (`[A CONFIRMAR]`)

1. Domicilio de Distrifoto SRL (Dec. 167/021; Ley 17.250 art. 16; Ley 18.331 art. 13 B).
2. Número y fecha de la resolución de inscripción de la base en la URCDP (Dec. 414/009 art. 19), o inscribirla.
3. Fecha de publicación.

Además se eligió `distrifotosrl@gmail.com` como mail de atención (es el del sitio y el del catálogo; `piumainfra@gmail.com`
es la cuenta técnica de AWS y alertas). Un test exige que coincida con `SITE_CONFIG.email`.
