import { measureLineWidthPx, measureSquareTextLineWidthPx } from "@/renderer/square-text-measure";

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

  for (let i = 0; i < words.length; i++) {
    const word = words[i] ?? "";
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (testLine.length <= maxChars) {
      currentLine = testLine;
    } else {
      if (currentLine) lines.push(currentLine);
      if (lines.length >= maxLines) {
        // Never drop words: merge the overflowing word and remaining tail into the final line.
        const tail = [word, ...words.slice(i + 1)].join(" ").trim();
        if (tail) {
          const lastIdx = Math.max(0, maxLines - 1);
          if (typeof lines[lastIdx] === "string" && lines[lastIdx].length > 0) {
            lines[lastIdx] = `${lines[lastIdx]} ${tail}`.trim();
          } else {
            lines[lastIdx] = tail;
          }
        }
        return lines.slice(0, Math.max(1, maxLines));
      }
      currentLine = word;
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

function estimateTopCaptionWidthPx(
  text: string,
  fontSize: number,
  fontFamily?: string | null
): number {
  return measureLineWidthPx(
    text,
    fontSize,
    fontFamily && String(fontFamily).trim()
      ? String(fontFamily)
      : "Inter"
  );
}

function normalizeTopCaptionLayoutType(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function isTopCaptionStyleLayout(layoutType: string): boolean {
  return layoutType === "top_caption" || layoutType === "";
}

function isSquareMemeFamily(family: unknown): boolean {
  const normalized = String(family ?? "").trim().toLowerCase();
  return normalized === "square_image" || normalized === "square_video";
}

/**
 * Scoped top-caption logic for square image/video templates:
 * - try single-line first
 * - only wrap when single-line exceeds slot width
 * - wrap via deterministic midpoint word-boundary split
 */
export function wrapSquareTopCaptionScoped(params: {
  text: string;
  maxChars: number;
  maxLines: number;
  slotWidthPx: number;
  fontSize: number;
  fontFamily?: string | null;
  templateFamily?: string | null;
  textLayoutType?: string | null;
}): string[] {
  const normalized = normalizeCaptionText(params.text);
  if (!normalized) return [];

  const debugCaptions = new Set([
    "when the diy project goes sideways but you stay cool",
    "when you're surrounded by flowers but can't choose",
    "when you open a flower shop and no one comes",
    "when you find out your plumbing's leaking again",
  ]);
  const debugEnabled = debugCaptions.has(normalized.toLowerCase());

  const layoutType = normalizeTopCaptionLayoutType(params.textLayoutType);
  const scoped =
    isSquareMemeFamily(params.templateFamily) && isTopCaptionStyleLayout(layoutType);

  if (!scoped) {
    return wrapCaptionWithSoftEarlySplit(normalized, params.maxChars, params.maxLines);
  }

  const slotWidthPx = Math.max(1, params.slotWidthPx);
  const oneLineWidth = estimateTopCaptionWidthPx(
    normalized,
    params.fontSize,
    params.fontFamily ?? null
  );
  const oneLineFits = oneLineWidth <= slotWidthPx;
  const words = normalized.split(/\s+/).filter(Boolean);

  // Safe, narrow tweak: for roomy slot-1 captions that are long enough to read cramped
  // on one line, prefer a clean 2-line split if both lines still fit by measured width.
  const shouldPreferTwoLineInRoomySlot =
    oneLineFits &&
    params.maxLines >= 2 &&
    slotWidthPx >= 420 &&
    params.maxChars >= 20 &&
    words.length >= 8 &&
    normalized.length >= 42 &&
    oneLineWidth / slotWidthPx >= 0.72;

  const logDecision = (
    decision: "one_line" | "two_lines",
    trigger:
      | "comfort_check_passed"
      | "max_lines_lt_2"
      | "midpoint_split_fit"
      | "greedy_fallback"
      | "fallback_one_line"
  ) => {
    if (!debugEnabled) return;
    console.log("[caption-wrap-debug]", {
      caption: normalized,
      measuredOneLineWidth: Math.round(oneLineWidth * 100) / 100,
      slotWidth: Math.round(slotWidthPx * 100) / 100,
      fitCheckPassed: oneLineFits,
      decision,
      trigger,
    });
  };

  if (oneLineFits) {
    if (shouldPreferTwoLineInRoomySlot) {
      const midpoint = Math.floor(words.length / 2);
      const splitCandidates: number[] = [];
      for (let offset = 0; offset < words.length; offset++) {
        const leftIndex = midpoint - offset;
        const rightIndex = midpoint + offset;
        if (leftIndex > 0) splitCandidates.push(leftIndex);
        if (
          rightIndex > 0 &&
          rightIndex < words.length &&
          rightIndex !== leftIndex
        ) {
          splitCandidates.push(rightIndex);
        }
      }

      let bestLaterSplit:
        | { left: string; right: string; splitIndex: number }
        | null = null;
      for (const splitIndex of splitCandidates) {
        const left = words.slice(0, splitIndex).join(" ");
        const right = words.slice(splitIndex).join(" ");
        const leftWords = left.split(/\s+/).filter(Boolean);
        const rightWords = right.split(/\s+/).filter(Boolean);
        if (leftWords.length < 2 || rightWords.length < 2) continue;

        const leftWidth = estimateTopCaptionWidthPx(
          left,
          params.fontSize,
          params.fontFamily ?? null
        );
        const rightWidth = estimateTopCaptionWidthPx(
          right,
          params.fontSize,
          params.fontFamily ?? null
        );
        if (leftWidth <= slotWidthPx && rightWidth <= slotWidthPx) {
          if (!bestLaterSplit || splitIndex > bestLaterSplit.splitIndex) {
            bestLaterSplit = { left, right, splitIndex };
          }
        }
      }

      if (bestLaterSplit) {
        logDecision("two_lines", "midpoint_split_fit");
        return [bestLaterSplit.left, bestLaterSplit.right];
      }
    }

    logDecision("one_line", "comfort_check_passed");
    return [normalized];
  }

  if (params.maxLines < 2) {
    logDecision("one_line", "max_lines_lt_2");
    return [normalized];
  }

  if (words.length < 2) {
    return wrapCaptionWithSoftEarlySplit(normalized, params.maxChars, params.maxLines);
  }

  const midpoint = Math.floor(words.length / 2);
  const splitCandidates: number[] = [];
  for (let offset = 0; offset < words.length; offset++) {
    const leftIndex = midpoint - offset;
    const rightIndex = midpoint + offset;
    if (leftIndex > 0) splitCandidates.push(leftIndex);
    if (rightIndex > 0 && rightIndex < words.length && rightIndex !== leftIndex) {
      splitCandidates.push(rightIndex);
    }
  }
  let bestLaterSplit:
    | { left: string; right: string; splitIndex: number }
    | null = null;
  for (const splitIndex of splitCandidates) {
    const left = words.slice(0, splitIndex).join(" ");
    const right = words.slice(splitIndex).join(" ");
    const leftWidth = estimateTopCaptionWidthPx(
      left,
      params.fontSize,
      params.fontFamily ?? null
    );
    const rightWidth = estimateTopCaptionWidthPx(
      right,
      params.fontSize,
      params.fontFamily ?? null
    );
    if (leftWidth <= slotWidthPx && rightWidth <= slotWidthPx) {
      if (!bestLaterSplit || splitIndex > bestLaterSplit.splitIndex) {
        bestLaterSplit = { left, right, splitIndex };
      }
    }
  }
  if (bestLaterSplit) {
    logDecision("two_lines", "midpoint_split_fit");
    return [bestLaterSplit.left, bestLaterSplit.right];
  }

  // Safety fallback: width-constrained greedy wrap (still word-boundary first).
  const greedy = wrapTextGreedyPixel(
    normalized,
    slotWidthPx,
    Math.max(2, params.maxLines),
    (value) =>
      estimateTopCaptionWidthPx(value, params.fontSize, params.fontFamily ?? null)
  );
  if (greedy.length >= 2) {
    logDecision("two_lines", "greedy_fallback");
    return [greedy[0] ?? "", greedy[1] ?? ""].filter(Boolean);
  }
  logDecision("one_line", "fallback_one_line");
  return [normalized];
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

  const kCap = Math.min(maxK, n);
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

/** Strip edge punctuation so phrase bigrams match (“choose...” → choose). */
function normalizeWordForPhrase(raw: string): string {
  return raw.replace(/^[^a-z0-9']+|[^a-z0-9']+$/gi, "").toLowerCase();
}

/**
 * Square text: penalize breaks between lines that split common short collocations or
 * strand a lead-in (e.g. “how long” / “it took”). Complements slideshow dangling-line-end
 * scoring inside `scoreSlideshowLayout`.
 */
const SQUARE_BIGRAM_HEAVY = 34;
const SQUARE_BIGRAM_MEDIUM = 15;
const SQUARE_WEAK_END_AFTER = 18;

const SQUARE_HEAVY_BIGRAM_KEYS = new Set<string>([
  "how|long",
  "how|much",
  "how|many",
  "how|far",
  "how|old",
  "how|soon",
  "how|often",
  "long|it",
  "long|ago",
  "long|since",
  "long|before",
  "long|enough",
  "much|of",
  "more|of",
  "the|last",
  "the|first",
  "the|same",
  "the|only",
  "the|whole",
  "the|next",
  "the|other",
  "the|best",
  "the|worst",
  "at|home",
  "at|least",
  "at|most",
  "at|first",
  "at|last",
  "your|home",
  "your|life",
  "your|mind",
  "my|life",
  "my|god",
  "her|life",
  "his|life",
  "our|home",
  "as|long",
  "as|much",
  "so|much",
  "so|many",
  "out|of",
  "up|to",
  "all|the",
  "each|other",
  "one|more",
  "no|one",
]);

const SQUARE_MEDIUM_BIGRAM_KEYS = new Set<string>([
  "of|the",
  "in|the",
  "to|the",
  "on|the",
  "for|the",
  "and|the",
  "with|the",
  "from|the",
  "by|the",
  "to|be",
  "to|get",
  "to|make",
  "to|go",
  "to|see",
  "a|lot",
  "a|little",
  "in|a",
  "on|a",
  "for|a",
  "natural|light",
  "drafty|window",
]);

/** Line ends with a short fragment that usually wants the next word on the same line. */
const SQUARE_WEAK_TAIL_TWO = new Set<string>([
  "how long",
  "how much",
  "how many",
  "how far",
  "the last",
  "the first",
  "the same",
  "your home",
  "your life",
  "at home",
  "at least",
  "as long",
  "so much",
  "so many",
]);

function interLineSquarePhrasePenalty(prevLine: string, nextLine: string): number {
  const pl = prevLine.trim();
  const nl = nextLine.trim();
  if (!pl || !nl) return 0;

  const prevWords = pl.split(/\s+/).filter(Boolean);
  const nextWords = nl.split(/\s+/).filter(Boolean);
  const last = normalizeWordForPhrase(prevWords[prevWords.length - 1] ?? "");
  const first = normalizeWordForPhrase(nextWords[0] ?? "");
  if (!last || !first) return 0;

  const pairKey = `${last}|${first}`;
  let p = 0;
  if (SQUARE_HEAVY_BIGRAM_KEYS.has(pairKey)) {
    p += SQUARE_BIGRAM_HEAVY;
  } else if (SQUARE_MEDIUM_BIGRAM_KEYS.has(pairKey)) {
    p += SQUARE_BIGRAM_MEDIUM;
  }

  const tail2 = `${normalizeWordForPhrase(prevWords[prevWords.length - 2] ?? "")} ${last}`.trim();
  if (prevWords.length >= 2 && SQUARE_WEAK_TAIL_TWO.has(tail2)) {
    p += SQUARE_WEAK_END_AFTER;
  }

  const questionLead = new Set([
    "how",
    "what",
    "when",
    "where",
    "why",
    "which",
    "whose",
  ]);
  const okAfterQuestionLead = new Set([
    "long",
    "much",
    "many",
    "far",
    "old",
    "soon",
    "often",
    "about",
    "to",
    "do",
    "does",
    "did",
    "is",
    "are",
    "was",
    "were",
    "way",
    "kind",
    "type",
    "time",
    "place",
    "reason",
    "happened",
    "else",
    "if",
  ]);
  if (questionLead.has(last) && !okAfterQuestionLead.has(first)) {
    p += SQUARE_WEAK_END_AFTER;
  }

  return p;
}

/** Prefer fewer lines for medium-length square_text (used by pixel-based square layout scoring). */
function preferredMaxLinesForSquare(textLen: number): number {
  if (textLen <= 140) return 3;
  if (textLen <= 260) return 4;
  if (textLen <= 400) return 5;
  return 16;
}

const SQUARE_LINE_COUNT_OVER_PREFER = 15;
/**
 * Soften slideshow width-variance term. Keep small: a large relief rewarded very uneven stacks
 * (tiny line 1 + long line 2), which reads as “early break” on square text memes.
 */
const SQUARE_BALANCE_RELIEF = 0.08;
/** Penalize middle lines that are still far below the pixel budget (non–line-1/2). */
const SQUARE_SHORT_LINE_RATIO = 0.52;
const SQUARE_SHORT_LINE_PENALTY = 7;
/** Line 1 & 2: stricter “short line” threshold + slightly higher flat penalty. */
const SQUARE_EARLY_SHORT_LINE_RATIO = 0.64;
const SQUARE_EARLY_SHORT_LINE_PENALTY = 14;
/**
 * Target fill for early lines (when not the final line): penalize unused width so breaks move later
 * when another word still fits under maxWidthPx. (Weights are tuned so ~0.72 fill pays clearly more
 * than ~0.99 fill — the slideshow base score favors low r per line, which fights “full” early lines.)
 */
const SQUARE_EARLY_FILL_TARGET_RATIO = 0.82;
const SQUARE_EARLY_UNDERFILL_WEIGHT = 118;
const SQUARE_EARLY_UNDERFILL_CAP = 42;

/** Split a single token (no spaces) into chunks that each fit `maxWidthPx`. */
function breakLongWordNoSpace(
  word: string,
  maxWidthPx: number,
  measure: (s: string) => number
): string[] {
  if (!word) return [];
  if (measure(word) <= maxWidthPx) return [word];
  const out: string[] = [];
  let i = 0;
  while (i < word.length) {
    let lo = i + 1;
    let hi = word.length;
    let best = i + 1;
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      const sub = word.slice(i, mid);
      if (measure(sub) <= maxWidthPx) {
        best = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    if (best <= i) best = i + 1;
    out.push(word.slice(i, best));
    i = best;
  }
  return out;
}

function wrapTextGreedyPixel(
  text: string,
  maxWidthPx: number,
  maxLines: number,
  measure: (s: string) => number
): string[] {
  const normalized = normalizeCaptionText(text);
  if (!normalized) return [];

  const words = normalized.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let currentLine = "";

  for (let i = 0; i < words.length; i++) {
    const word = words[i] ?? "";
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (measure(testLine) <= maxWidthPx) {
      currentLine = testLine;
      continue;
    }

    if (currentLine) {
      lines.push(currentLine);
      currentLine = "";
      if (lines.length >= maxLines) {
        // Match char-wrap behavior: preserve all words by appending overflow tail to the final line.
        const tail = [word, ...words.slice(i + 1)].join(" ").trim();
        if (tail) {
          const lastIdx = Math.max(0, maxLines - 1);
          if (typeof lines[lastIdx] === "string" && lines[lastIdx].length > 0) {
            lines[lastIdx] = `${lines[lastIdx]} ${tail}`.trim();
          } else {
            lines[lastIdx] = tail;
          }
        }
        return lines.slice(0, Math.max(1, maxLines));
      }
    }

    if (measure(word) <= maxWidthPx) {
      currentLine = word;
    } else {
      const chunks = breakLongWordNoSpace(word, maxWidthPx, measure);
      for (let ci = 0; ci < chunks.length; ci++) {
        const chunk = chunks[ci]!;
        if (lines.length >= maxLines) {
          return lines.slice(0, maxLines);
        }
        if (ci < chunks.length - 1) {
          lines.push(chunk);
        } else {
          currentLine = chunk;
        }
      }
    }
  }

  if (currentLine && lines.length < maxLines) {
    lines.push(currentLine);
  }

  return lines.slice(0, maxLines);
}

function generateSlideshowWordBoundaryLayoutsPixel(
  words: string[],
  maxWidthPx: number,
  maxK: number,
  measure: (s: string) => number
): string[][] {
  const n = words.length;
  const out: string[][] = [];
  if (n === 0) return out;

  const full = words.join(" ");
  if (measure(full) <= maxWidthPx) {
    out.push([full]);
  }

  function dfs(start: number, acc: string[], kRemaining: number): void {
    if (kRemaining === 1) {
      const last = words.slice(start).join(" ");
      if (last.length > 0 && measure(last) <= maxWidthPx) {
        out.push([...acc, last]);
      }
      return;
    }
    const endMax = n - (kRemaining - 1);
    for (let end = start + 1; end <= endMax; end++) {
      const line = words.slice(start, end).join(" ");
      if (measure(line) > maxWidthPx) continue;
      dfs(end, [...acc, line], kRemaining - 1);
    }
  }

  const kCap = Math.min(maxK, n);
  for (let k = 2; k <= kCap; k++) {
    dfs(0, [], k);
  }

  return out;
}

function addSlideshowSentenceBoundaryLayoutsPixel(
  normalized: string,
  maxWidthPx: number,
  maxK: number,
  candidates: string[][],
  seen: Set<string>,
  measure: (s: string) => number
): void {
  const segs = normalized
    .split(/(?<=[.!?])\s+/)
    .map((x) => x.trim())
    .filter(Boolean);
  if (segs.length < 2) return;
  if (segs.length > maxK) return;
  if (!segs.every((s) => s.length > 0 && measure(s) <= maxWidthPx)) return;

  const lay = [...segs];
  const key = layoutDedupeKey(lay);
  if (seen.has(key)) return;
  seen.add(key);
  candidates.push(lay);
}

function scoreSlideshowLayoutPixel(
  lines: string[],
  maxWidthPx: number,
  measure: (s: string) => number
): number {
  if (!lines.length) return 1e9;

  let s = 0;
  const widths = lines.map((l) => measure(l));
  const mean = widths.reduce((a, b) => a + b, 0) / widths.length;
  const variance =
    widths.reduce((acc, w) => acc + (w - mean) ** 2, 0) / widths.length;
  s += SS_BALANCE * Math.sqrt(variance);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const r = maxWidthPx > 0 ? measure(line) / maxWidthPx : 0;
    s += SS_WIDTH * Math.pow(r, SS_WIDTH_EXP);
  }

  s += SS_EXTRA_LINE * (lines.length - 1);

  const last = lines[lines.length - 1] ?? "";
  s += SS_ORPHAN_MULT * orphanPenaltyLastLine(last);

  if (lines.length === 1) {
    const r0 = maxWidthPx > 0 ? measure(lines[0]!) / maxWidthPx : 0;
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

function squareEarlyLineUnderfillPenalty(
  lines: string[],
  maxWidthPx: number,
  measure: (s: string) => number
): number {
  if (lines.length <= 1 || maxWidthPx <= 0) return 0;
  let p = 0;
  const target = SQUARE_EARLY_FILL_TARGET_RATIO;
  for (let i = 0; i < Math.min(2, lines.length - 1); i++) {
    const r = measure(lines[i] ?? "") / maxWidthPx;
    if (r < target) {
      const raw = SQUARE_EARLY_UNDERFILL_WEIGHT * (target - r);
      p += Math.min(SQUARE_EARLY_UNDERFILL_CAP, raw);
    }
  }
  return p;
}

function squareEarlyLinesWidthSum(
  lines: string[],
  measure: (s: string) => number
): number {
  if (lines.length === 0) return 0;
  const w0 = measure(lines[0] ?? "");
  if (lines.length === 1) return w0;
  return w0 + measure(lines[1] ?? "");
}

function scoreSquareTextLayoutPixel(
  lines: string[],
  maxWidthPx: number,
  textLen: number,
  measure: (s: string) => number
): number {
  let s = scoreSlideshowLayoutPixel(lines, maxWidthPx, measure);

  const widths = lines.map((l) => measure(l));
  const mean = widths.reduce((a, b) => a + b, 0) / Math.max(1, widths.length);
  const variance =
    widths.reduce((acc, w) => acc + (w - mean) ** 2, 0) / Math.max(1, widths.length);
  s -= SQUARE_BALANCE_RELIEF * Math.sqrt(variance);

  const pref = preferredMaxLinesForSquare(textLen);
  if (lines.length > pref) {
    s += SQUARE_LINE_COUNT_OVER_PREFER * (lines.length - pref);
  }

  if (lines.length >= 2 && maxWidthPx > 0) {
    for (let i = 0; i < lines.length - 1; i++) {
      const w = measure(lines[i] ?? "");
      const r = w / maxWidthPx;
      const early = i < 2;
      const thresh = early ? SQUARE_EARLY_SHORT_LINE_RATIO : SQUARE_SHORT_LINE_RATIO;
      const pen = early ? SQUARE_EARLY_SHORT_LINE_PENALTY : SQUARE_SHORT_LINE_PENALTY;
      if (r < thresh) {
        s += pen;
      }
    }
  }

  s += squareEarlyLineUnderfillPenalty(lines, maxWidthPx, measure);

  for (let i = 0; i < lines.length - 1; i++) {
    s += interLineSquarePhrasePenalty(lines[i] ?? "", lines[i + 1] ?? "");
  }
  return s;
}

function pickBestSquareTextLayoutPixel(
  candidates: string[][],
  maxWidthPx: number,
  textLen: number,
  measure: (s: string) => number
): string[] {
  let best = candidates[0]!;
  let bestScore = scoreSquareTextLayoutPixel(best, maxWidthPx, textLen, measure);
  for (let i = 1; i < candidates.length; i++) {
    const c = candidates[i]!;
    const sc = scoreSquareTextLayoutPixel(c, maxWidthPx, textLen, measure);
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
      if (c.length > best.length) {
        continue;
      }
      const cw = squareEarlyLinesWidthSum(c, measure);
      const bw = squareEarlyLinesWidthSum(best, measure);
      if (cw > bw) {
        best = c;
        continue;
      }
      if (cw < bw) {
        continue;
      }
      if (layoutDedupeKey(c) < layoutDedupeKey(best)) {
        best = c;
      }
    }
  }
  return best;
}

/**
 * Final guarantee: no line wider than `maxWidthPx`; respects `maxLines` via greedy reflow if needed.
 */
function enforceSquareTextMaxLineWidthFinal(
  lines: string[],
  maxWidthPx: number,
  maxLines: number,
  measure: (s: string) => number,
  normalizedFullText: string
): string[] {
  const EPS = 1;

  const reflowOversized = (arr: string[]): string[] =>
    arr.flatMap((line) => {
      if (measure(line) <= maxWidthPx + EPS) return [line];
      const t = line.trim();
      if (t.includes(" ")) {
        return wrapTextGreedyPixel(t, maxWidthPx, 64, measure);
      }
      return breakLongWordNoSpace(t, maxWidthPx, measure);
    });

  let out = reflowOversized(lines);

  if (out.length > maxLines || out.some((l) => measure(l) > maxWidthPx + EPS)) {
    out = wrapTextGreedyPixel(normalizedFullText, maxWidthPx, maxLines, measure);
  }

  out = reflowOversized(out);

  if (out.length > maxLines || out.some((l) => measure(l) > maxWidthPx + EPS)) {
    out = wrapTextGreedyPixel(normalizedFullText, maxWidthPx, maxLines, measure);
    out = reflowOversized(out);
  }

  if (out.length > maxLines) {
    out = wrapTextGreedyPixel(normalizedFullText, maxWidthPx, maxLines, measure);
  }

  return out.filter((l) => l.length > 0);
}

/**
 * Square meme PNG: word-boundary layouts scored like slideshow, but **line width** is capped
 * using canvas `measureText` (52px Inter) — not character counts.
 */
export function wrapSquareTextMemeLines(
  text: string,
  maxLineWidthPx: number,
  maxLines: number
): string[] {
  const measure = measureSquareTextLineWidthPx;
  const normalized = normalizeCaptionText(text);
  if (!normalized) return [];

  const words = normalized.split(/\s+/).filter(Boolean);
  const greedy = wrapTextGreedyPixel(normalized, maxLineWidthPx, maxLines, measure);

  const maxK = Math.max(1, Math.min(maxLines, 6));
  const enumCap = words.length > 36 ? Math.min(maxK, 4) : maxK;

  const generated = generateSlideshowWordBoundaryLayoutsPixel(
    words,
    maxLineWidthPx,
    enumCap,
    measure
  );

  const seen = new Set<string>();
  const candidates: string[][] = [];
  for (const lay of generated) {
    const k = layoutDedupeKey(lay);
    if (!seen.has(k)) {
      seen.add(k);
      candidates.push(lay);
    }
  }

  addSlideshowSentenceBoundaryLayoutsPixel(
    normalized,
    maxLineWidthPx,
    Math.min(enumCap, maxLines),
    candidates,
    seen,
    measure
  );

  const gk = layoutDedupeKey(greedy);
  if (!seen.has(gk)) {
    candidates.push(greedy);
  }

  if (candidates.length === 0) {
    return enforceSquareTextMaxLineWidthFinal(
      greedy,
      maxLineWidthPx,
      maxLines,
      measure,
      normalized
    );
  }

  const best = pickBestSquareTextLayoutPixel(
    candidates,
    maxLineWidthPx,
    normalized.length,
    measure
  );
  return enforceSquareTextMaxLineWidthFinal(
    best,
    maxLineWidthPx,
    maxLines,
    measure,
    normalized
  );
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

