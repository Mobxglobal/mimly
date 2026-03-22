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

/** Em dash / en dash — normalized before slideshow wrap so PNG matches TikTok-native punctuation. */
const EM_DASH = /\u2014/g;
const EN_DASH = /\u2013/g;

export function normalizeSlideshowTypographyForWrap(text: string): string {
  return normalizeCaptionText(
    String(text ?? "")
      .replace(EM_DASH, ". ")
      .replace(EN_DASH, "-")
  );
}

/** Slideshow layout scoring weights (lower total score = stronger composition). */
const SS_WIDTH = 11;
const SS_WIDTH_EXP = 1.38;
/** Softer than before so phrase/rhythm penalties can win over pixel balance. */
const SS_BALANCE = 0.3;
const SS_EXTRA_LINE = 2.9;
const SS_ORPHAN_MULT = 1;
const SS_DANGLING = 7;
/** Sentence end before next line: strong preference for "It's not X." / "It's Y." style breaks. */
const SS_PHRASE_END_BONUS = 10;
const SS_PHRASE_COMMA_BONUS = 2.5;
const SS_WIDE_SINGLE_THRESHOLD = 0.84;
const SS_WIDE_SINGLE_MULT = 48;
const SS_PUNCH_LAST_BONUS = 3.2;

/** Line starts with a weak function word in a *short* fragment (unnatural break). */
const SS_LINE_START_TO_SHORT = 22;
const SS_LINE_START_TO_THREE_WORDS = 8;
const SS_LINE_START_THE_SHORT = 17;
const SS_LINE_START_OTHER_SHORT = 18;
/** Previous line is a tiny lead-in; next line opens with a function-word fragment. */
const SS_FRAGMENT_BEFORE_WEAK = 24;
/** Middle line of a 3+ line stack is a thin fragment (e.g. "to warm"). */
const SS_SHORT_MIDDLE_FRAGMENT = 18;

const DANGLING_LINE_END =
  /\b(the|a|an|and|or|but|to|of|in|for|with|if|as|at|so)\s*$/i;

function lineStartFunctionWordPenalty(line: string): number {
  const L = line.trim();
  const words = L.split(/\s+/).filter(Boolean);
  if (words.length === 0) return 0;
  if (/^to\b/i.test(L)) {
    if (words.length <= 2) return SS_LINE_START_TO_SHORT;
    if (words.length === 3) return SS_LINE_START_TO_THREE_WORDS;
    return 0;
  }
  if (/^the\b/i.test(L)) {
    if (words.length <= 2) return SS_LINE_START_THE_SHORT;
    return 0;
  }
  if (/^(and|of|or|but|a|an)\b/i.test(L)) {
    if (words.length <= 2) return SS_LINE_START_OTHER_SHORT;
    return 0;
  }
  return 0;
}

/**
 * Penalise unnatural boundaries: short lines that strand "to/the/…" chunks, stacked fragments,
 * and weak middle lines in 3+ line layouts.
 */
function phraseAndRhythmPenalty(lines: string[]): number {
  let p = 0;
  const n = lines.length;

  for (let i = 0; i < n; i++) {
    const L = (lines[i] ?? "").trim();
    const w = L.split(/\s+/).filter(Boolean);
    p += lineStartFunctionWordPenalty(L);

    if (n >= 3 && i > 0 && i < n - 1) {
      if (w.length <= 2 && !/[.!?]$/.test(L)) {
        p += SS_SHORT_MIDDLE_FRAGMENT;
      }
    }

    if (i < n - 1) {
      const next = (lines[i + 1] ?? "").trim();
      const endsSentence = /[.!?]$/.test(L);
      if (!endsSentence && w.length <= 2 && lineStartFunctionWordPenalty(next) > 0) {
        p += SS_FRAGMENT_BEFORE_WEAK;
      }
    }
  }

  return p;
}

/**
 * Adds layouts that split only on sentence boundaries (after . ! ?).
 * Preserves "It's not X." / "It's Y." as separate lines when each fits maxChars.
 */
function addSlideshowSentenceBoundaryLayouts(
  normalized: string,
  maxChars: number,
  maxK: number,
  candidates: string[][],
  seen: Set<string>
): void {
  const segs = normalized
    .split(/(?<=[.!?])\s+/)
    .map((x) => x.trim())
    .filter(Boolean);
  if (segs.length < 2) return;
  if (segs.length > maxK) return;
  if (!segs.every((s) => s.length > 0 && s.length <= maxChars)) return;

  const lay = [...segs];
  const key = layoutDedupeKey(lay);
  if (seen.has(key)) return;
  seen.add(key);
  candidates.push(lay);
}

/**
 * All ways to partition `words` into 1..maxK contiguous lines, each line length <= maxChars.
 */
function generateSlideshowWordBoundaryLayouts(
  words: string[],
  maxChars: number,
  maxK: number
): string[][] {
  const n = words.length;
  const out: string[][] = [];
  if (n === 0) return out;

  const full = words.join(" ");
  if (full.length <= maxChars) {
    out.push([full]);
  }

  function dfs(start: number, acc: string[], kRemaining: number): void {
    if (kRemaining === 1) {
      const last = words.slice(start).join(" ");
      if (last.length > 0 && last.length <= maxChars) {
        out.push([...acc, last]);
      }
      return;
    }
    const endMax = n - (kRemaining - 1);
    for (let end = start + 1; end <= endMax; end++) {
      const line = words.slice(start, end).join(" ");
      if (line.length > maxChars) continue;
      dfs(end, [...acc, line], kRemaining - 1);
    }
  }

  const kCap = Math.min(maxK, n, 4);
  for (let k = 2; k <= kCap; k++) {
    dfs(0, [], k);
  }

  return out;
}

function layoutDedupeKey(lines: string[]): string {
  return lines.join("\u0001");
}

/**
 * Last-line orphan vs punchy: punctuation-terminated short closes read intentional (slides).
 * Accidental orphans: tiny non-terminated fragments, single weak words.
 */
function orphanPenaltyLastLine(line: string): number {
  const t = line.trim();
  if (!t) return 40;
  const parts = t.split(/\s+/).filter(Boolean);
  const punctEnd = /[.!?]$/.test(t);

  if (punctEnd) {
    if (parts.length <= 3) return 0;
    return Math.max(0, (parts.length - 3) * 1.5);
  }

  if (parts.length >= 4) return 0;

  if (parts.length === 1) {
    const w = parts[0] ?? "";
    return w.length >= 6 ? 3 : 24;
  }

  if (parts.length === 2) {
    if (t.length >= 14) return 5;
    return 17;
  }

  return 6;
}

/**
 * Visual + natural-language score for a candidate line array (lower is better).
 */
function scoreSlideshowLayout(lines: string[], maxChars: number): number {
  if (!lines.length) return 1e9;

  let s = 0;
  const lens = lines.map((l) => l.length);
  const mean = lens.reduce((a, b) => a + b, 0) / lens.length;
  const variance =
    lens.reduce((acc, len) => acc + (len - mean) ** 2, 0) / lens.length;
  s += SS_BALANCE * Math.sqrt(variance);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const r = maxChars > 0 ? line.length / maxChars : 0;
    s += SS_WIDTH * Math.pow(r, SS_WIDTH_EXP);
  }

  s += SS_EXTRA_LINE * (lines.length - 1);

  const last = lines[lines.length - 1] ?? "";
  s += SS_ORPHAN_MULT * orphanPenaltyLastLine(last);

  if (lines.length === 1) {
    const r0 = maxChars > 0 ? lines[0]!.length / maxChars : 0;
    if (r0 > SS_WIDE_SINGLE_THRESHOLD) {
      s += SS_WIDE_SINGLE_MULT * (r0 - SS_WIDE_SINGLE_THRESHOLD);
    }
  }

  for (let i = 0; i < lines.length - 1; i++) {
    const line = (lines[i] ?? "").trim();
    if (/[.!?]$/.test(line)) s -= SS_PHRASE_END_BONUS;
    else if (/[,;:]$/.test(line)) s -= SS_PHRASE_COMMA_BONUS;
    if (DANGLING_LINE_END.test(line)) s += SS_DANGLING;
  }

  if (
    lines.length >= 2 &&
    last.trim().length <= 22 &&
    /[.!?]$/.test(last.trim())
  ) {
    s -= SS_PUNCH_LAST_BONUS;
  }

  s += phraseAndRhythmPenalty(lines);

  return s;
}

function pickBestSlideshowLayout(
  candidates: string[][],
  maxChars: number
): string[] {
  let best = candidates[0]!;
  let bestScore = scoreSlideshowLayout(best, maxChars);
  for (let i = 1; i < candidates.length; i++) {
    const c = candidates[i]!;
    const sc = scoreSlideshowLayout(c, maxChars);
    if (sc < bestScore) {
      bestScore = sc;
      best = c;
      continue;
    }
    if (sc === bestScore) {
      if (c.length < best.length) {
        best = c;
        continue;
      }
      if (c.length === best.length && layoutDedupeKey(c) < layoutDedupeKey(best)) {
        best = c;
      }
    }
  }
  return best;
}

/**
 * Vertical slideshow: enumerate word-boundary layouts (1..maxLines, cap 4), add sentence-boundary
 * layouts when each sentence fits a line, score with width + orphan + natural phrase/rhythm rules,
 * pick lowest score. Greedy wrap remains a fallback candidate.
 */
export function wrapSlideshowVerticalLines(
  text: string,
  maxChars: number,
  maxLines: number
): string[] {
  const normalized = normalizeSlideshowTypographyForWrap(text);
  if (!normalized) return [];

  const words = normalized.split(/\s+/).filter(Boolean);
  const maxK = Math.max(1, Math.min(maxLines, 4));

  const generated = generateSlideshowWordBoundaryLayouts(words, maxChars, maxK);
  const greedy = wrapTextGreedy(normalized, maxChars, maxLines);

  const seen = new Set<string>();
  const candidates: string[][] = [];
  for (const lay of generated) {
    const k = layoutDedupeKey(lay);
    if (!seen.has(k)) {
      seen.add(k);
      candidates.push(lay);
    }
  }

  addSlideshowSentenceBoundaryLayouts(
    normalized,
    maxChars,
    maxK,
    candidates,
    seen
  );

  const gk = layoutDedupeKey(greedy);
  if (!seen.has(gk)) {
    candidates.push(greedy);
  }

  if (candidates.length === 0) {
    return greedy;
  }

  return pickBestSlideshowLayout(candidates, maxChars);
}

