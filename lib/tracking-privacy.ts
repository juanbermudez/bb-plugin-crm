/**
 * Returns whether a collector property value looks like directly identifying
 * or payment-card data.  Tracking values are intentionally rejected at the
 * boundary instead of being persisted and attempting to redact them later.
 */

const EMAIL_VALUE_PATTERN =
  /[-A-Z0-9.!#$%&'*+\/?^_{}|~]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+/iu;

// Card numbers may be written as a contiguous value or separated by spaces
// and hyphens. Keep the candidate check deliberately narrow so ordinary
// counters, years, and order ids are not rejected just for containing digits.
const PAYMENT_CARD_CANDIDATE_PATTERN = /(?<!\d)(?:\d[ -]?){13,19}(?!\d)/g;

function isLuhnValid(digits: string): boolean {
  if (digits.length < 13 || digits.length > 19 || /^(\d)\1+$/u.test(digits)) return false;
  let sum = 0;
  let shouldDouble = false;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let digit = Number(digits[index]);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}

function containsPaymentCardShape(value: string): boolean {
  return [...value.matchAll(PAYMENT_CARD_CANDIDATE_PATTERN)].some(([candidate]) =>
    isLuhnValid(candidate.replace(/[ -]/gu, "")),
  );
}

/** Whether a scalar tracking value has an email or payment-card shape. */
export function isSensitiveTrackingValue(value: unknown): boolean {
  if (typeof value !== "string" && typeof value !== "number") return false;
  const text = String(value).trim();
  if (!text) return false;
  return EMAIL_VALUE_PATTERN.test(text) || containsPaymentCardShape(text);
}
