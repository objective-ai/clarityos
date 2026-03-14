import { createElement, type ReactNode } from "react";

interface HighlightRule {
  pattern: RegExp;
  className: string;
}

const HIGHLIGHT_RULES: HighlightRule[] = [
  // Snellen fractions (20/20, 20/200, etc.)
  { pattern: /\b20\/\d{2,3}\b/g, className: "text-[#2DD4BF]" },
  // IOP values with units
  { pattern: /\b\d{1,2}\s*mm\s*Hg\b/gi, className: "text-[#2DD4BF]" },
  // ICD-10 codes (H52.13, E11.319, etc.)
  { pattern: /\b[A-Z]\d{2}\.\d{1,4}\b/g, className: "text-[#22C55E] font-semibold" },
  // Anatomical terms
  {
    pattern:
      /\b(cornea[sl]?|conjunctiva[sl]?|sclera[sl]?|lens(es)?|iris|lids?|lashes|anterior chamber|tear film|angles?|optic nerve[s]?|macula[sr]?|retina[sl]?|vitreous|vessels|periphery|cup[- ]to[- ]disc|C\/D)\b/gi,
    className: "text-[#60A5FA]",
  },
  // Refraction patterns (-2.00 -0.75 x 180)
  {
    pattern: /[+-]?\d+\.\d{2}(?:\s*[\/\-]\s*[+-]?\d+\.\d{2}\s*[x×]\s*\d{1,3})?/g,
    className: "text-[#F97316]",
  },
  // Diopter values standalone
  { pattern: /[+-]\d+\.\d{2}\s*D?\b/g, className: "text-[#F97316]" },
];

export function highlightSOAP(text: string): ReactNode[] {
  // Build a combined regex with named groups
  const allPatterns = HIGHLIGHT_RULES.map((r, i) => `(?<g${i}>${r.pattern.source})`).join("|");
  const combinedRegex = new RegExp(allPatterns, "gi");

  const result: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = combinedRegex.exec(text)) !== null) {
    // Add text before match
    if (match.index > lastIndex) {
      result.push(text.slice(lastIndex, match.index));
    }

    // Find which group matched
    let className = "";
    for (let i = 0; i < HIGHLIGHT_RULES.length; i++) {
      if (match.groups?.[`g${i}`] !== undefined) {
        className = HIGHLIGHT_RULES[i].className;
        break;
      }
    }

    result.push(createElement("span", { key: key++, className }, match[0]));
    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    result.push(text.slice(lastIndex));
  }

  return result;
}
