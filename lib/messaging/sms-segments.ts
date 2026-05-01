/**
 * SMS segment counter — TS port of backend count_sms_segments
 * (backend/services/messaging/templates.py).
 *
 * GSM-7: 160 chars/segment standalone, 153 when concatenated.
 * UCS-2: 70 chars/segment standalone, 67 when concatenated.
 */

const GSM7_CHARS = new Set(
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ\x1bÆæßÉ " +
    '!"#¤%&\'()*+,-./0123456789:;<=>?' +
    "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§" +
    "¿abcdefghijklmnopqrstuvwxyzäöñüà"
);

export interface SmsSegmentResult {
  count: number;
  encoding: "GSM-7" | "UCS-2";
  totalChars: number;
  remainingChars: number;
  perSegmentLimit: number;
}

export function countSmsSegments(body: string): SmsSegmentResult {
  const chars = Array.from(body);
  const totalChars = chars.length;
  const isGsm = chars.every((c) => GSM7_CHARS.has(c));

  if (isGsm) {
    if (totalChars <= 160) {
      return {
        count: 1,
        encoding: "GSM-7",
        totalChars,
        remainingChars: 160 - totalChars,
        perSegmentLimit: 160,
      };
    }
    const count = Math.ceil(totalChars / 153);
    const remainder = totalChars % 153;
    return {
      count,
      encoding: "GSM-7",
      totalChars,
      remainingChars: remainder === 0 ? 0 : 153 - remainder,
      perSegmentLimit: 153,
    };
  }

  if (totalChars <= 70) {
    return {
      count: 1,
      encoding: "UCS-2",
      totalChars,
      remainingChars: 70 - totalChars,
      perSegmentLimit: 70,
    };
  }
  const count = Math.ceil(totalChars / 67);
  const remainder = totalChars % 67;
  return {
    count,
    encoding: "UCS-2",
    totalChars,
    remainingChars: remainder === 0 ? 0 : 67 - remainder,
    perSegmentLimit: 67,
  };
}
