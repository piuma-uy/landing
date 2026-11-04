/**
 * «Botón de arrepentimiento» (T109): Ley 17.250 art. 16 con la redacción de la Ley 20.531 art. 108,
 * vigente desde el 1/1/2027 (fuentes en docs/legal-fuentes.md). La tienda tiene que mostrar, visible
 * y destacado, un vínculo con ese nombre para pedir el arrepentimiento; usarlo vale como aviso por
 * medio fehaciente. El pie de todas las páginas y «Mis pedidos» abren /arrepentimiento/, con un
 * formulario mínimo (número de pedido, mail o teléfono, motivo opcional) que llama a
 * POST /withdrawal-requests y deja en pantalla la constancia con el número de solicitud.
 *
 * Sin Angular: lo usan el pie y CommerceService (bundle inicial), scripts/seo.ts y los tests; lo del
 * formulario está en withdrawal-form.ts, que sólo carga la página (chunk diferido).
 */

export const WITHDRAWAL_PATH = "/arrepentimiento/";
/** El nombre que exige la ley, tal cual. */
export const WITHDRAWAL_LABEL = "Botón de arrepentimiento";

export const isWithdrawalPath = (path: string) => /^\/arrepentimiento\/?$/.test(path);

export interface WithdrawalForm {
  orderCode: string;
  contact: string;
  reason: string;
}
/** Lo que se precarga desde «Mis pedidos». */
export type WithdrawalPrefill = Partial<Pick<WithdrawalForm, "orderCode" | "contact">>;
