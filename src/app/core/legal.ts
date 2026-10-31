/**
 * Páginas legales (T89): /privacidad/, /terminos/ y /cambios-y-devoluciones/. Un solo texto para la
 * página en Angular (LegalPageComponent, en un chunk diferido) y para el prerender (scripts/seo.ts).
 * Sin Angular y sin imports de valores (scripts/seo.ts lo corre Node tal cual): rutas, nombres y el
 * WhatsApp llegan como argumentos de legalDocs(); ver legalDocsFor en core/legal-pages.ts.
 *
 * BORRADOR para aprobar por Guillermo y por Piuma; no es asesoramiento legal. Todo lo que depende de
 * la tienda va marcado con [A CONFIRMAR …]: la página lo resalta y tests/legal.test.ts impide
 * publicarlo como definitivo (LEGAL_DRAFT = false, en core/legal-pages.ts) mientras quede alguna
 * marca. Mientras sea borrador, el build de producción no lo publica (T99).
 */

import type { LegalId, LegalPage } from "./legal-pages";

/** Marca de lo que tiene que confirmar Piuma; con o sin detalle: "[A CONFIRMAR: plazo]". */
export const PENDING = /\[A CONFIRMAR[^\]]*\]/g;

export const LEGAL_OWNER = {
  name: "Distrifoto SRL",
  rut: "213 376 180 018",
  email: "piumainfra@gmail.com",
  address: "[A CONFIRMAR: domicilio legal de Distrifoto SRL]",
} as const;

export interface LegalSection {
  title: string;
  paragraphs: string[];
  items?: string[];
}

export interface LegalDoc extends LegalPage {
  title: string;
  /** Meta description de la página. */
  description: string;
  updated: string;
  sections: LegalSection[];
}

/**
 * Las tres páginas en el orden de `pages`. `whatsapp` es el número legible de SITE_CONFIG
 * ("+598 …"): el único lugar del front con el número es site-config.ts.
 */
export function legalDocs(
  pages: readonly LegalPage[],
  whatsapp: string,
): LegalDoc[] {
  const page = (id: LegalId): LegalPage => pages.find((p) => p.id === id)!;
  const contact =
    `Escribinos a ${LEGAL_OWNER.email} o por WhatsApp al ${whatsapp}. ` +
    `Responsable: ${LEGAL_OWNER.name}, RUT ${LEGAL_OWNER.rut}, ${LEGAL_OWNER.address}.`;

  const updated = "[A CONFIRMAR: fecha de publicación]";

  const privacy: LegalDoc = {
    ...page("privacidad"),
    title: "Política de privacidad",
    description:
      "Qué datos personales recoge Piuma al comprar, para qué los usa, dónde se guardan y cómo ejercer tus derechos según la Ley 18.331.",
    updated,
    sections: [
      {
        title: "Quién es responsable de tus datos",
        paragraphs: [
          `Piuma es una marca de ${LEGAL_OWNER.name} (RUT ${LEGAL_OWNER.rut}), responsable de la base de datos de clientes de la tienda. Tratamos tus datos según la Ley 18.331 de Protección de Datos Personales, su decreto reglamentario 414/009 y las normas que los modifican.`,
          "Base de datos inscripta ante la Unidad Reguladora y de Control de Datos Personales (URCDP): [A CONFIRMAR: número de inscripción o trámite en curso].",
          contact,
        ],
      },
      {
        title: "Qué datos recogemos",
        paragraphs: [
          "Sólo los que hacen falta para venderte y entregarte el pedido:",
        ],
        items: [
          "Nombre y mail, al crear tu cuenta (o los que comparte Google, si entrás con Google).",
          "Celular, para coordinar la entrega por WhatsApp.",
          "Dirección de entrega, si elegís envío.",
          "Tus pedidos: productos, importes, forma de pago, estado y fechas.",
          "Si pagás con tarjeta, el resultado y el número de operación que informa Mercado Pago. Los datos de la tarjeta los cargás en Mercado Pago y nunca pasan por Piuma.",
        ],
      },
      {
        title: "Para qué los usamos",
        paragraphs: [
          "Para gestionar tu cuenta, armar y cobrar tus pedidos, avisarte por mail cuando se confirma un pago, coordinar la entrega por WhatsApp, atender consultas, cambios y devoluciones, y cumplir obligaciones legales y contables.",
          "Tratamos tus datos con tu consentimiento, que das al crear la cuenta y al confirmar la compra, y porque son necesarios para cumplir el contrato de compra. No los usamos para publicidad ni te mandamos promociones sin que lo pidas. [A CONFIRMAR: si Piuma quiere enviar novedades por mail o WhatsApp, agregar el consentimiento aparte].",
        ],
      },
      {
        title: "Dónde se guardan",
        paragraphs: [
          "La tienda y sus datos están alojados en Amazon Web Services (AWS), en la región us-east-2 (Ohio, Estados Unidos). Es una transferencia internacional de datos: Estados Unidos no figura entre los países con nivel de protección adecuado para Uruguay, por eso se hace con tu consentimiento y con las garantías contractuales del proveedor. [A CONFIRMAR: base legal de la transferencia con el asesor].",
          "Protegemos los datos con conexiones cifradas (HTTPS), acceso restringido por permisos y contraseñas que nunca se guardan en texto claro.",
        ],
      },
      {
        title: "Con quién los compartimos",
        paragraphs: [
          "No vendemos ni alquilamos tus datos. Sólo los ven los proveedores que hacen funcionar la tienda, cada uno para su tarea:",
        ],
        items: [
          "Amazon Web Services: alojamiento, cuentas (Amazon Cognito) y mails de la tienda (Amazon SES).",
          "Mercado Pago: el cobro con tarjeta. Al pagar aceptás también su política de privacidad.",
          "Google: sólo si elegís entrar con Google; nos comparte tu nombre y tu mail.",
          "WhatsApp: los mensajes con los que coordinamos la entrega.",
          "PostHog (servidores en la Unión Europea): estadísticas de uso sin datos personales; ver más abajo.",
          "Autoridades, cuando una ley o una orden judicial lo exija.",
        ],
      },
      {
        title: "Cuánto tiempo los conservamos",
        paragraphs: [
          "Tu cuenta, mientras la tengas abierta. Los pedidos y sus datos de facturación, el tiempo que exigen las normas contables y tributarias: [A CONFIRMAR: plazo con el contador]. Los registros técnicos del servidor, 14 días y sin datos personales. Las estadísticas de uso, hasta 1 año.",
          "Si pedís la baja de tu cuenta, borramos tus datos de contacto y conservamos sólo lo que la ley nos obliga a guardar de tus compras.",
        ],
      },
      {
        title: "Tus derechos y cómo ejercerlos",
        paragraphs: [
          "Podés pedir en cualquier momento acceso a tus datos, su rectificación, actualización o inclusión, y su supresión, y retirar tu consentimiento. Escribinos desde el mail de tu cuenta a " +
            `${LEGAL_OWNER.email} o por WhatsApp al ${whatsapp}; para cuidar tus datos podemos pedirte que confirmes que sos el titular.`,
          "Respondemos dentro de los 5 días hábiles que fija la ley. El acceso es gratuito una vez cada seis meses, salvo que haya un interés legítimo para pedirlo antes. El celular también lo podés cambiar vos desde Mi cuenta.",
          "Si no te respondemos o no estás conforme, podés reclamar ante la URCDP (gub.uy/urcdp).",
        ],
      },
      {
        title: "Cookies y almacenamiento en tu navegador",
        paragraphs: [
          "No usamos cookies de publicidad ni de seguimiento. El sitio guarda en tu navegador sólo lo necesario para funcionar: tu sesión y el paso de compra en curso (sessionStorage, se borra al cerrar la pestaña) y el carrito si todavía no ingresaste (localStorage, para que no lo pierdas). Al entrar o crear la cuenta, Amazon Cognito y, si lo elegís, Google, usan sus propias cookies técnicas en sus páginas de ingreso.",
        ],
      },
      {
        title: "Estadísticas de uso sin cookies",
        paragraphs: [
          "Cuando está activada, usamos PostHog (servidores en la Unión Europea) para saber cómo se usa la tienda y corregir errores. Se registran las páginas que visitás, los pasos de la compra (sin montos ni datos personales), los clics a WhatsApp y errores técnicos, con un identificador al azar que se borra al cerrar la pestaña.",
          'No usamos cookies para esto ni enviamos tu nombre, mail, teléfono, dirección, datos de pago o de tu cuenta; los eventos son anónimos y no se pueden cruzar entre visitas ni dispositivos. Si tu navegador tiene activado "No rastrear" o Global Privacy Control, no se envía nada.',
        ],
      },
      {
        title: "Menores de edad",
        paragraphs: [
          "La tienda está pensada para mayores de 18 años. [A CONFIRMAR: si Piuma acepta compras de menores con autorización de un adulto].",
        ],
      },
      {
        title: "Cambios en esta política",
        paragraphs: [
          "Si cambiamos esta política, publicamos la versión nueva en esta página con su fecha. Si el cambio es importante, te avisamos por mail antes de que rija.",
        ],
      },
    ],
  };

  const terms: LegalDoc = {
    ...page("terminos"),
    title: "Términos y condiciones de compra",
    description:
      "Condiciones de compra en Piuma: precios en pesos con IVA, formas de pago, reserva, envíos, derecho de arrepentimiento de 5 días hábiles y garantía.",
    updated,
    sections: [
      {
        title: "Quién vende",
        paragraphs: [
          `Vende ${LEGAL_OWNER.name}, RUT ${LEGAL_OWNER.rut}, con la marca Piuma; domicilio: ${LEGAL_OWNER.address}. Escribinos a ${LEGAL_OWNER.email} o por WhatsApp al ${whatsapp}.`,
          "Estas condiciones se aplican a las compras en este sitio, junto con la Ley 17.250 de Defensa del Consumidor. Al confirmar un pedido declarás que las leíste y las aceptás.",
        ],
      },
      {
        title: "Productos y precios",
        paragraphs: [
          "Los precios están en pesos uruguayos e incluyen IVA. El total que ves al confirmar ya suma el envío, si corresponde. El precio y el stock que valen son los que te muestra el carrito en el momento de confirmar.",
          "Las fotos muestran los productos lo más fielmente posible; el color puede variar un poco según la pantalla. Las medidas de cada producto figuran en su ficha y en la guía de talles.",
          "Si por un error evidente un precio aparece mal publicado, te avisamos y podés confirmar la compra con el precio correcto o cancelarla sin costo.",
        ],
      },
      {
        title: "Cuenta",
        paragraphs: [
          "Para comprar necesitás una cuenta con tu nombre, mail y celular, o entrar con Google. Cuidá tu contraseña: las compras hechas desde tu cuenta se consideran tuyas.",
        ],
      },
      {
        title: "Formas de pago",
        paragraphs: [
          "En el checkout aparecen las formas de pago habilitadas en ese momento:",
        ],
        items: [
          "Tarjeta de débito o crédito, o saldo de Mercado Pago: pagás en el sitio de Mercado Pago, con sus cuotas y condiciones. [A CONFIRMAR: si Piuma ofrece cuotas sin recargo].",
          "Transferencia bancaria: al confirmar te damos los datos de la cuenta y nos mandás el comprobante por WhatsApp.",
        ],
      },
      {
        title: "Reserva y vencimiento",
        paragraphs: [
          "Al confirmar el pedido reservamos los productos. Si no se acredita el pago dentro del plazo que te mostramos en ese momento, el pedido vence, se cancela solo y los productos vuelven a estar a la venta; no se cobra nada.",
          "El pedido queda confirmado cuando recibimos el pago: con tarjeta, cuando Mercado Pago lo aprueba; con transferencia, cuando la verificamos. Te avisamos por mail. Podés cancelar un pedido sin pagar desde Mis pedidos.",
        ],
      },
      {
        title: "Envíos y entrega",
        paragraphs: [
          "Las zonas, costos y plazos de envío y el retiro, si está disponible, están en la página de Envíos y se eligen al confirmar la compra. Después del pago te escribimos por WhatsApp para coordinar el día y el horario de la entrega.",
          "Revisá el paquete al recibirlo. Si llega dañado o no es lo que pediste, avisanos dentro de [A CONFIRMAR: plazo, por ejemplo 48 horas] con una foto y lo resolvemos según la política de cambios y devoluciones.",
        ],
      },
      {
        title: "Derecho de arrepentimiento",
        paragraphs: [
          "Como la compra es a distancia, la Ley 17.250 (artículo 16) te da derecho a arrepentirte sin dar explicaciones dentro de los 5 días hábiles desde que se formalizó la compra o desde que recibiste el producto, a tu elección.",
          `Para ejercerlo, avisanos dentro de ese plazo por mail a ${LEGAL_OWNER.email} o por WhatsApp al ${whatsapp}, con el número de pedido. Te devolvemos todo lo que pagaste por el mismo medio de pago, y coordinamos la devolución del producto, sin uso y en las condiciones en que lo recibiste. [A CONFIRMAR con el asesor: quién paga el envío de vuelta y el plazo para reintegrar el dinero].`,
        ],
      },
      {
        title: "Garantía",
        paragraphs: [
          "Si un producto tiene un defecto de fabricación, lo cambiamos por otro igual o te devolvemos el dinero, además de los derechos que te dan la Ley 17.250 y las normas sobre vicios ocultos. Plazo de la garantía de Piuma: [A CONFIRMAR]. No cubre el desgaste normal ni el daño por lavado o uso contrario a las indicaciones de cuidado.",
        ],
      },
      {
        title: "Datos personales",
        paragraphs: [
          "Usamos tus datos sólo para la compra y la entrega, como explica la política de privacidad.",
        ],
      },
      {
        title: "Consultas y reclamos",
        paragraphs: [
          `${contact} Si no llegamos a un acuerdo, podés acudir al Área de Defensa del Consumidor del Ministerio de Economía y Finanzas (gub.uy/defensa-consumidor). Estas condiciones se rigen por las leyes de Uruguay.`,
        ],
      },
    ],
  };

  const returns: LegalDoc = {
    ...page("cambios"),
    title: "Cambios y devoluciones",
    description:
      "Cómo pedir un cambio o una devolución en Piuma: arrepentimiento en 5 días hábiles, productos con defectos y la política de cambios de la tienda.",
    updated,
    sections: [
      {
        title: "Te arrepentiste de la compra",
        paragraphs: [
          "Tenés 5 días hábiles desde la compra o desde que recibiste el producto, a tu elección, para arrepentirte sin dar explicaciones (Ley 17.250, artículo 16). Te devolvemos todo lo que pagaste por el mismo medio de pago.",
        ],
      },
      {
        title: "Llegó dañado, con un defecto o no es lo que pediste",
        paragraphs: [
          "Lo cambiamos por otro igual o te devolvemos el dinero, sin costo para vos. Avisanos con una foto del producto y del paquete. [A CONFIRMAR: plazo para avisar].",
        ],
      },
      {
        title: "Cambios de medida o de color",
        paragraphs: [
          "[A CONFIRMAR: política propia de Piuma. Por ejemplo: plazo para pedir el cambio, si el producto tiene que estar sin uso, sin lavar, con etiquetas y en su empaque, si se cambia por otro producto o se da un crédito, y quién paga el envío]. Esta política nunca reduce los derechos de los dos puntos anteriores.",
        ],
      },
      {
        title: "Cómo pedirlo",
        paragraphs: [
          `Escribinos por WhatsApp al ${whatsapp} o por mail a ${LEGAL_OWNER.email} con el número de pedido y qué querés hacer. Te respondemos con los pasos y coordinamos el retiro o la entrega del producto.`,
        ],
        items: [
          "Producto sin uso, en las condiciones en que lo recibiste (salvo que tenga un defecto).",
          "Reintegro por el mismo medio de pago: con tarjeta, lo hace Mercado Pago y el banco lo acredita en sus plazos; con transferencia, a una cuenta a tu nombre.",
        ],
      },
    ],
  };

  const docs = { privacidad: privacy, terminos: terms, cambios: returns };
  return pages.map((p) => docs[p.id]);
}

/** Texto partido en tramos normales y marcas [A CONFIRMAR …] para resaltarlas. */
export function pendingParts(
  text: string,
): { text: string; pending: boolean }[] {
  const parts: { text: string; pending: boolean }[] = [];
  let at = 0;
  for (const m of text.matchAll(PENDING)) {
    if (m.index > at)
      parts.push({ text: text.slice(at, m.index), pending: false });
    parts.push({ text: m[0], pending: true });
    at = m.index + m[0].length;
  }
  if (at < text.length) parts.push({ text: text.slice(at), pending: false });
  return parts;
}

/** Todos los textos de una página, para buscar marcas pendientes. */
export const legalTexts = (doc: LegalDoc): string[] => [
  doc.title,
  doc.description,
  doc.updated,
  ...doc.sections.flatMap((s) => [
    s.title,
    ...s.paragraphs,
    ...(s.items ?? []),
  ]),
];
