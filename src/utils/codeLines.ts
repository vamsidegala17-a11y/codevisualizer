export interface NumberedCodeLine {
  lineNumber: number;
  text: string;
}

/**
 * Extracts 1-indexed line numbers from text such as "Lines 1-11", "Line 5",
 * "13–29", "Lines 4, 8, 12", or "L3".
 */
export function parseLineNumbersFromText(text: string, maxLines?: number): number[] {
  if (!text) return [];
  const result = new Set<number>();

  // Match ranges like "1-11", "13–29", "Lines 4 to 9"
  const rangeRegex = /\b(?:lines?|l)?\s*(\d+)\s*(?:-|–|—|to)\s*(\d+)\b/gi;
  let match: RegExpExecArray | null;
  while ((match = rangeRegex.exec(text)) !== null) {
    const start = Number.parseInt(match[1], 10);
    const end = Number.parseInt(match[2], 10);
    if (Number.isFinite(start) && Number.isFinite(end) && start >= 1 && end >= start) {
      const cappedEnd = Math.min(end, maxLines ?? end, start + 120);
      for (let ln = start; ln <= cappedEnd; ln++) {
        result.add(ln);
      }
    }
  }

  // Match explicit single references like "Line 5", "Lines 4, 8", "L12"
  const singleLineRegex = /\b(?:lines?|l)\s*(\d+)(?:\s*,\s*(\d+))*/gi;
  while ((match = singleLineRegex.exec(text)) !== null) {
    const numMatches = match[0].match(/\d+/g);
    if (numMatches) {
      for (const raw of numMatches) {
        const ln = Number.parseInt(raw, 10);
        if (Number.isFinite(ln) && ln >= 1 && (!maxLines || ln <= maxLines)) {
          result.add(ln);
        }
      }
    }
  }

  // If the entire string is just a number like "12" or comma-separated numbers "4, 7"
  if (result.size === 0 && /^\s*\d+(?:\s*,\s*\d+)*\s*$/.test(text)) {
    const nums = text.match(/\d+/g) ?? [];
    for (const raw of nums) {
      const ln = Number.parseInt(raw, 10);
      if (Number.isFinite(ln) && ln >= 1 && (!maxLines || ln <= maxLines)) {
        result.add(ln);
      }
    }
  }

  return Array.from(result).sort((a, b) => a - b);
}

/**
 * Finds line numbers in source code that match a syntax token or symbol when
 * explicit line numbers aren't already available.
 */
export function findMatchingLineNumbers(
  code: string,
  needle: string,
  maxMatches = 6
): number[] {
  if (!code || !needle) return [];
  const clean = needle.trim();
  if (clean.length < 2) return [];

  const lines = code.split('\n');
  const lowerNeedle = clean.toLowerCase();
  const matches: number[] = [];

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].toLowerCase().includes(lowerNeedle)) {
      matches.push(i + 1);
      if (matches.length >= maxMatches) break;
    }
  }
  return matches;
}

/**
 * Normalizes, deduplicates, sorts, and bounds line numbers against source code.
 */
export function normalizeLineNumbers(lineNumbers: number[], code: string): number[] {
  const totalLines = code ? code.split('\n').length : 1;
  return Array.from(
    new Set(
      lineNumbers
        .map((n) => Math.trunc(Number(n)))
        .filter((n) => Number.isFinite(n) && n >= 1 && n <= totalLines)
    )
  ).sort((a, b) => a - b);
}

/**
 * Returns the exact source lines for the requested 1-indexed line numbers.
 */
export function extractNumberedCodeLines(
  code: string,
  lineNumbers: number[]
): NumberedCodeLine[] {
  if (!code || lineNumbers.length === 0) return [];
  const allLines = code.split('\n');
  const normalized = normalizeLineNumbers(lineNumbers, code);
  return normalized.map((ln) => ({
    lineNumber: ln,
    text: allLines[ln - 1] ?? '',
  }));
}

/**
 * Formats [1, 2, 3, 7] into "Lines 1-3, 7" or [5] into "Line 5".
 */
export function formatLineRangeLabel(lineNumbers: number[]): string {
  if (lineNumbers.length === 0) return '';
  const sorted = Array.from(new Set(lineNumbers)).sort((a, b) => a - b);
  if (sorted.length === 1) return `Line ${sorted[0]}`;

  const parts: string[] = [];
  let start = sorted[0];
  let end = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === end + 1) {
      end = sorted[i];
    } else {
      parts.push(start === end ? `${start}` : `${start}-${end}`);
      start = sorted[i];
      end = sorted[i];
    }
  }
  parts.push(start === end ? `${start}` : `${start}-${end}`);
  return `Lines ${parts.join(', ')}`;
}
