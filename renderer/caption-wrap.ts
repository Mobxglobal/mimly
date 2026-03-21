export const SOFT_WRAP_RATIO = 0.84;
export const MIN_WORDS_FOR_SOFT_WRAP = 6;
export const MIN_LAST_WORD_LENGTH = 4;

function normalizeCaptionText(text: string): string {
  return String(text ?? "")
    .replace(/\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function wrapTextGreedy(text: string, maxChars: number, maxLines: number): string[] {
  if (!text) return [];
  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (testLine.length <= maxChars) {
      currentLine = testLine;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
      if (lines.length >= maxLines) break;
    }
  }

  if (currentLine && lines.length < maxLines) lines.push(currentLine);
  return lines.slice(0, maxLines);
}

function getBalancedTwoLineSplit(text: string, maxChars: number): [string, string] | null {
  const words = text.split(" ").filter(Boolean);
  if (words.length < 4) return null;

  const minLineChars = Math.max(6, Math.floor(maxChars * 0.25));
  let best: { left: string; right: string; score: number } | null = null;

  for (let split = 1; split < words.length; split++) {
    const leftWords = words.slice(0, split);
    const rightWords = words.slice(split);
    if (leftWords.length < 2 || rightWords.length < 2) continue;

    const left = leftWords.join(" ");
    const right = rightWords.join(" ");

    if (left.length > maxChars || right.length > maxChars) continue;
    if (left.length < minLineChars || right.length < minLineChars) continue;

    const rightWordCount = rightWords.length;
    const splitProgress = split / words.length;
    const lengthBalancePenalty = Math.abs(left.length - right.length);

    const line2WordCountPenalty = (() => {
      if (rightWordCount === 2) return 0; // preferred payoff shape
      if (rightWordCount === 3) return 18;
      if (rightWordCount === 4) return 30;
      if (rightWordCount === 5) return 55;
      return 80 + (rightWordCount - 5) * 18;
    })();

    let score = 0;
    // Primary objective: prefer a compact 2-word line 2 where available.
    score += line2WordCountPenalty;
    // Secondary objective: prefer later split points (longer setup line 1).
    score -= splitProgress * 30;
    // Tertiary objective: use line-length balance as a tiebreaker.
    score += lengthBalancePenalty * 0.2;

    if (!best || score < best.score) {
      best = { left, right, score };
    }
  }

  return best ? [best.left, best.right] : null;
}

/**
 * Conservative soft-wrap:
 * - Keep existing greedy char-based wrap as default.
 * - Only when text stays single-line and is near max chars, try a balanced 2-line split.
 */
export function wrapCaptionWithSoftEarlySplit(
  text: string,
  maxChars: number,
  maxLines: number
): string[] {
  const normalized = normalizeCaptionText(text);
  if (!normalized) return [];

  const baseLines = wrapTextGreedy(normalized, maxChars, maxLines);
  if (baseLines.length !== 1 || maxLines < 2) return baseLines;
  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length < MIN_WORDS_FOR_SOFT_WRAP) return baseLines;

  const lastWord = words[words.length - 1] ?? "";
  if (lastWord.length < MIN_LAST_WORD_LENGTH) return baseLines;

  const withoutLastWord = words.slice(0, -1).join(" ").trim();
  const softLimit = Math.floor(maxChars * SOFT_WRAP_RATIO);
  if (
    normalized.length < softLimit ||
    withoutLastWord.length >= softLimit
  ) {
    return baseLines;
  }

  const balanced = getBalancedTwoLineSplit(normalized, maxChars);
  return balanced ? [balanced[0], balanced[1]] : baseLines;
}

