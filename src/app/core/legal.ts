/**
 * Páginas legales (T89): /privacidad/, /terminos/ y /cambios-y-devoluciones/. Un solo texto para la
 * página en Angular (LegalPageComponent, en un chunk diferido) y para el prerender (scripts/seo.ts).
 * Sin Angular y sin imports de valores (scripts/seo.ts lo corre Node tal cual): rutas, nombres y el
 * WhatsApp llegan como argumentos de legalDocs(); ver legalDocsFor en core/legal-pages.ts.
 *
 * BORRADOR para aprobar por Guillermo y por Piuma; no es asesoramiento legal. Texto ajustado a la ley
 * en T105 (normas y fuentes en docs/legal-fuentes.md). Lo que sólo puede dar Piuma va marcado con
 * [A CONFIRMAR …]: la página lo resalta y tests/legal.test.ts impide publicarlo como definitivo (LEGAL_DRAFT = false, en core/legal-pages.ts) mientras quede alguna
 * marca. Mientras sea borrador, el build de producción no lo publica (T99).
 */

import type { LegalId, LegalPage } from "./legal-pages";

/** Marca de lo que tiene que confirmar Piuma; con o sin detalle: "[A CONFIRMAR: plazo]". */
export const PENDING = /\[A CONFIRMAR[^\]]*\]/g;

export const LEGAL_OWNER = {
  name: "Distrifoto SRL",
  rut: "213 376 180 018",
  /** El mail de atención del sitio (SITE_CONFIG.email); tests/legal.test.ts comprueba que coincidan. */
  email: "distrifotosrl@gmail.com",
  address: "[A CONFIRMAR: domicilio de Distrifoto SRL]",
} as const;

export interface LegalSection {
  title: string;
  paragraphs: string[];
  items?: string[];
  /** Un enlace al final de la sección: el «Botón de arrepentimiento» (T109). */
  link?: { label: string; path: string };
}

/**
 * El «Botón de arrepentimiento» (T109, Ley 20.531 art. 108): mismo nombre y ruta que
 * core/withdrawal.ts, repetidos porque este archivo no importa valores; tests/withdrawal.test.ts
 * comprueba que coincidan.
 */
export const WITHDRAWAL_LINK = { label: "Botón de arrepentimiento", path: "/arrepentimiento/" } as const;

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
 *
 * T105: sólo lo que exige la ley; cada obligación con su norma en docs/legal-fuentes.md (las
 * normas no se citan en la página salvo cuando el texto nombra un derecho).
 */
export function legalDocs(
  pages: readonly LegalPage[],
  whatsapp: string,
): LegalDoc[] {
  const page = (id: LegalId): LegalPage => pages.find((p) => p.id === id)!;
  const owner = `${LEGAL_OWNER.name}, RUT ${LEGAL_OWNER.rut}, con domicilio en ${LEGAL_OWNER.address}`;
  const contact = `mail a ${LEGAL_OWNER.email} o WhatsApp al ${whatsapp}`;

  const updated = "[A CONFIRMAR: fecha de publicación]";

  // Arrepentimiento (Ley 17.250 art. 16; desde el 1/1/2027, redacción de la Ley 20.531 art. 108).
  const withdrawal = [
    "Como comprás a distancia, podés arrepentirte de la compra sin dar explicaciones y sin ninguna responsabilidad:",
  ];
  const withdrawalTerms = [
    "Compras hasta el 31 de diciembre de 2026: dentro de los 5 días hábiles desde la compra o desde que recibiste el producto, lo que elijas.",
    "Compras desde el 1 de enero de 2027: dentro de los 10 días corridos desde la compra o desde que recibiste el producto, lo que elijas.",
  ];
  const withdrawalHow = [
    `Avisanos dentro de ese plazo con el ${WITHDRAWAL_LINK.label}, al pie de cada página y en Mis pedidos, o por ${contact}, con el número de pedido.`,
    "Devolvés el producto sin uso y en el mismo estado en que lo recibiste; podés abrir el empaque para revisarlo. El costo de enviárnoslo es tuyo.",
    "Te devolvemos todo lo que pagaste, envío incluido, al recibir el producto. Si pagaste con tarjeta, hacemos la devolución en Mercado Pago y se anulan las cuotas que falten.",
  ];

  // Defectos (Ley 17.250 arts. 33 y 37).
  const defects = [
    "Si el producto tiene un defecto o no es lo que pediste, podés elegir que te lo cambiemos por otro, aceptar otro producto o que te devolvamos lo que pagaste, sin costo para vos.",
    "Defectos a la vista: avisanos dentro de los 90 días desde que lo recibiste. Defectos ocultos: los que aparezcan dentro de los 6 meses desde la entrega; avisanos dentro de los 3 meses desde que aparecen.",
  ];

  const privacy: LegalDoc = {
    ...page("privacidad"),
    title: "Política de privacidad",
    description:
      "Qué datos personales trata Piuma, para qué, dónde se guardan y cómo ejercer tus derechos según la Ley 18.331.",
    updated,
    sections: [
      {
        title: "Responsable",
        paragraphs: [
          `Los datos que nos das al comprar forman la base de datos de clientes de Piuma, marca de ${owner}.`,
          "Base de datos inscripta ante la Unidad Reguladora y de Control de Datos Personales (URCDP): [A CONFIRMAR: número y fecha de la resolución de inscripción].",
          `Contacto: ${contact}.`,
        ],
      },
      {
        title: "Qué datos tratamos y para qué",
        paragraphs: [
          "Usamos tus datos sólo para tu cuenta, tus pedidos, el cobro, la entrega, responder tus consultas y reclamos, y cumplir obligaciones legales, contables y tributarias:",
        ],
        items: [
          "Nombre, mail y celular, al crear tu cuenta (o nombre y mail que comparte Google, si entrás con Google).",
          "Dirección de entrega, si elegís envío.",
          "Tus pedidos: productos, importes, forma de pago, estado y fechas.",
          "Si pagás con tarjeta, el resultado y el número de operación que informa Mercado Pago. Los datos de la tarjeta los cargás en Mercado Pago: Piuma no los recibe.",
        ],
      },
      {
        title: "Si no nos das tus datos",
        paragraphs: [
          "Nombre, mail y celular son obligatorios para comprar; la dirección, sólo si elegís envío. Sin ellos, o si son incorrectos, no podemos tomar, cobrar ni entregar el pedido.",
        ],
      },
      {
        title: "Quién más accede a tus datos",
        paragraphs: [
          "No vendemos ni cedemos tus datos. Sólo acceden quienes nos prestan un servicio para la compra, y las autoridades cuando una ley o un juez lo exige:",
        ],
        items: [
          "Amazon Web Services: aloja la tienda, las cuentas (Amazon Cognito) y envía los mails (Amazon SES).",
          "MercadoPago Uruguay S.R.L.: cobra los pagos con tarjeta.",
          "Google: sólo si entrás con Google.",
          "WhatsApp: los mensajes con los que coordinamos la entrega.",
        ],
      },
      {
        title: "Transferencia internacional",
        paragraphs: [
          "Sí hay transferencia internacional: la tienda y sus datos están alojados en Amazon Web Services, en Estados Unidos (región us-east-2, Ohio). Es necesaria para cumplir la compra que nos pedís.",
        ],
      },
      {
        title: "Cuánto tiempo los guardamos",
        paragraphs: [
          "Los datos de tu cuenta, mientras la tengas. Los de tus compras, el plazo que exigen las normas contables y tributarias. Los registros técnicos del servidor, 14 días.",
        ],
      },
      {
        title: "Tus derechos",
        paragraphs: [
          `Podés pedir acceso a tus datos y su rectificación, actualización, inclusión o supresión. Pedilo por ${contact}; te podemos pedir que acredites tu identidad. Es gratis y respondemos dentro de los 5 días hábiles. El acceso es gratuito una vez cada seis meses, salvo que tengas un interés legítimo para pedirlo antes.`,
          "Si no te respondemos o no estás conforme, podés reclamar ante la URCDP (gub.uy/urcdp).",
        ],
      },
      {
        title: "Navegador y estadísticas de uso",
        paragraphs: [
          "Este sitio no usa cookies. Guarda en tu navegador tu sesión y el paso de compra en curso (sessionStorage, se borra al cerrar la pestaña) y el carrito si todavía no ingresaste (localStorage). Amazon Cognito y Google usan sus propias cookies en sus páginas de ingreso.",
          "Para saber cómo se usa la tienda y corregir errores usamos PostHog (servidores en Estados Unidos): páginas vistas, pasos de la compra, clics a WhatsApp y errores, con un identificador al azar que se borra al cerrar la pestaña. No le enviamos tu nombre, mail, teléfono, dirección ni datos de pago, y PostHog descarta tu dirección IP. Si tu navegador tiene activado \"No rastrear\" o Global Privacy Control, no se envía nada.",
        ],
      },
    ],
  };

  const terms: LegalDoc = {
    ...page("terminos"),
    title: "Términos y condiciones de compra",
    description:
      "Condiciones de compra en Piuma: quién vende, precios con impuestos, pagos, envíos, derecho de arrepentimiento y productos con defectos.",
    updated,
    sections: [
      {
        title: "Quién vende",
        paragraphs: [
          `Vende ${owner}, con la marca Piuma. Atención al cliente: ${contact}.`,
          "Vendemos sólo en Uruguay. Estas condiciones se aplican a las compras en este sitio, junto con la Ley 17.250 de Defensa del Consumidor y las demás leyes de Uruguay.",
        ],
      },
      {
        title: "Precios",
        paragraphs: [
          "Los precios están en pesos uruguayos e incluyen IVA. El envío, si corresponde, se muestra aparte antes de confirmar y se suma al total. El precio es el mismo con tarjeta o con transferencia.",
        ],
      },
      {
        title: "Cómo se compra",
        paragraphs: [
          "Para comprar necesitás una cuenta. Antes de confirmar ves el resumen del pedido (productos, envío, total y forma de pago) y podés corregirlo; el pedido se hace recién cuando tocás confirmar.",
          "Al confirmar reservamos los productos por el plazo que te mostramos. Si el pago no se acredita en ese plazo, el pedido se cancela solo y no se cobra nada. El pedido queda confirmado cuando recibimos el pago, y te avisamos por mail.",
        ],
      },
      {
        title: "Formas de pago",
        paragraphs: [],
        items: [
          "Tarjeta de débito o crédito, o dinero en Mercado Pago: pagás en el sitio de Mercado Pago. Si elegís cuotas, la financiación la da Mercado Pago o el emisor de tu tarjeta, que te muestran la cantidad de cuotas, los intereses y el total antes de pagar.",
          "Transferencia bancaria: al confirmar te damos los datos de la cuenta y nos mandás el comprobante por WhatsApp.",
        ],
      },
      {
        title: "Envíos",
        paragraphs: [
          "Las zonas, costos y plazos de envío están en la página de Envíos y se eligen antes de confirmar. Después del pago te escribimos por WhatsApp para coordinar la entrega.",
        ],
      },
      {
        title: "Derecho de arrepentimiento",
        paragraphs: withdrawal,
        items: [...withdrawalTerms, ...withdrawalHow],
        link: { ...WITHDRAWAL_LINK },
      },
      {
        title: "Productos con defectos",
        paragraphs: defects,
      },
      {
        title: "Datos personales",
        paragraphs: ["Tratamos tus datos como explica la política de privacidad."],
      },
      {
        title: "Consultas y reclamos",
        paragraphs: [
          `Escribinos por ${contact}. También podés reclamar ante la Unidad Defensa del Consumidor del Ministerio de Economía y Finanzas (gub.uy/defensa-consumidor, teléfono 0800 7005).`,
        ],
      },
    ],
  };

  const returns: LegalDoc = {
    ...page("cambios"),
    title: "Cambios y devoluciones",
    description:
      "Cómo arrepentirte de una compra en Piuma o reclamar por un producto con defectos: plazos, condiciones y reintegro.",
    updated,
    sections: [
      {
        title: "Te arrepentiste de la compra",
        paragraphs: withdrawal,
        items: [...withdrawalTerms, ...withdrawalHow],
        link: { ...WITHDRAWAL_LINK },
      },
      {
        title: "Llegó con un defecto o no es lo que pediste",
        paragraphs: defects,
      },
      {
        title: "Cómo pedirlo",
        paragraphs: [
          `Si te arrepentiste, usá el ${WITHDRAWAL_LINK.label}. Por un defecto, o si preferís, escribinos por ${contact} con el número de pedido y qué querés hacer. Te respondemos con los pasos para devolver el producto y recibir el reintegro, que va por el mismo medio de pago: con tarjeta, en Mercado Pago; con transferencia, a una cuenta a tu nombre.`,
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
