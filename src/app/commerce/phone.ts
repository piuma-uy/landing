import {
  AsYouType,
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
  type CountryCode,
} from "libphonenumber-js/min";

/**
 * The buyer's celular (T71), with the same rule as the API (piuma-backend src/phone.ts):
 * libphonenumber-js with its "min" metadata; a Uruguayan number must be a mobile (09X XXX XXX)
 * and anything valid goes to the API as E.164. Only the lazy phone field imports this file, so
 * the library (≈35 kB gzip) stays out of the initial bundle.
 */
export type { CountryCode };
export const DEFAULT_COUNTRY: CountryCode = "UY";
/** 9 and a second digit 1-9, then 6 digits: what WhatsApp can reach in Uruguay. */
const UY_MOBILE = /^9[1-9]\d{6}$/;

export interface Country {
  code: CountryCode;
  name: string;
  dial: string;
}
/** Every country libphonenumber knows, named in Spanish: Uruguay first, then A to Z. */
export function countries(): Country[] {
  const names = new Intl.DisplayNames(["es"], { type: "region" });
  const all = getCountries().map((code) => ({
    code,
    name: names.of(code) ?? code,
    dial: getCountryCallingCode(code),
  }));
  const uy = all.find((c) => c.code === DEFAULT_COUNTRY)!;
  return [
    uy,
    ...all
      .filter((c) => c !== uy)
      .sort((a, b) => a.name.localeCompare(b.name, "es")),
  ];
}
export const dialCode = (country: CountryCode) =>
  getCountryCallingCode(country);

export type PhoneCheck =
  { e164: string; problem: null } | { e164: null; problem: string };
/**
 * What the buyer typed, read for the chosen country (a leading + or 00 picks its own): E.164
 * when it is a celular Piuma can write to, otherwise the sentence shown under the field.
 */
export function checkPhone(text: string, country: CountryCode): PhoneCheck {
  const digits = text.replace(/\D/g, "");
  if (!digits)
    return {
      e164: null,
      problem: "Necesitamos tu celular para coordinar la entrega.",
    };
  const n = parsePhoneNumberFromString(text, country);
  const uruguayan = n ? n.countryCallingCode === "598" : country === "UY";
  if (n?.isValid() && (!uruguayan || UY_MOBILE.test(n.nationalNumber)))
    return { e164: n.number, problem: null };
  // Fixed lines in Uruguay start with 2 (Montevideo) or 4 (interior).
  if (uruguayan && n?.isValid() && /^[24]/.test(n.nationalNumber))
    return {
      e164: null,
      problem:
        "Ese número parece de un teléfono fijo. Necesitamos un celular para escribirte por WhatsApp.",
    };
  if (uruguayan)
    return {
      e164: null,
      problem:
        "Revisá el número: un celular uruguayo tiene 9 dígitos y empieza con 09, por ejemplo 091 234 567.",
    };
  return {
    e164: null,
    problem:
      "Revisá el número: no parece un celular de ese país. Escribilo sin el código, que ya está elegido.",
  };
}
/** The country a pasted or autofilled "+54 9 11…" belongs to; undefined while it is unclear. */
export function countryOf(text: string): CountryCode | undefined {
  if (!/^\s*(\+|00)/.test(text)) return undefined;
  const typer = new AsYouType();
  typer.input(text.trim().replace(/^00/, "+"));
  return typer.getCountry();
}
/** "091813234" → "091 813 234" as it is typed, in the chosen country's own grouping. */
export const formatTyping = (text: string, country: CountryCode) =>
  new AsYouType(country).input(text);
/**
 * A saved E.164 number back in the field: its country and the number without the code
 * ("091 813 234" in Uruguay, "9 11 1234 5678" for Argentina).
 */
export function fromE164(
  e164: string,
): { country: CountryCode; text: string } | null {
  const n = parsePhoneNumberFromString(e164);
  if (!n?.country) return null;
  if (n.country === DEFAULT_COUNTRY)
    return { country: n.country, text: n.formatNational() };
  const text = n
    .formatInternational()
    .replace(`+${n.countryCallingCode}`, "")
    .trim();
  return { country: n.country, text };
}
