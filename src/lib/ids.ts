// PDF numbers and the tracking key.
//
// The party's PDF numbers start with letters ("K-1108", "KAN 1108"); the
// manufacturer often writes only the number ("1108"). Both must land on the same
// ring, so every number is tracked by its key: the text from the first digit on,
// with leading zeros dropped. The label (what was typed) is kept for display.
//
//   "K-1108"   -> key "1108"
//   "kan 01108"-> key "1108"
//   "1108"     -> key "1108"
//   "K1108A"   -> key "1108A"
//   "K-1108/2" -> key "1108/2"

/** Display form: trimmed, single spaces, upper case. */
export function cleanLabel(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").toUpperCase();
}

/** Tracking key, or null when the text has no digit at all. */
export function trackingKey(raw: string): string | null {
  const label = cleanLabel(raw);
  const firstDigit = label.search(/\d/);
  if (firstDigit < 0) return null;
  const rest = label.slice(firstDigit).replace(/\s+/g, "");
  const key = rest.replace(/^0+(?=\d)/, "");
  return key.length > 0 ? key : null;
}

export function hasLetterPrefix(label: string): boolean {
  return /^[A-Z]/.test(cleanLabel(label));
}

/**
 * Split pasted text into separate numbers. Accepts an Excel column, a row of
 * cells, or a comma / semicolon list. A line is split on spaces only when every
 * piece has a digit, so "K 1108" stays one number while "K1101 K1102" is two.
 */
export function parseList(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split(/[\r\n\t,;]+/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parts = trimmed.split(/\s+/);
    if (parts.length > 1 && parts.every((p) => /\d/.test(p))) out.push(...parts);
    else out.push(trimmed);
  }
  return out.map(cleanLabel).filter((s) => s.length > 0);
}
