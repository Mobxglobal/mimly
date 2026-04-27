import path from "path";
import TextToSVG from "text-to-svg";
import { escapeXML } from "@/lib/rendering/svg-utf8";

const INTER_FONT_PATH = path.join(process.cwd(), "public", "fonts", "Inter-Bold.ttf");

let interTextToSvg: TextToSVG | null = null;

export function getInterTextToSVG(): TextToSVG {
  if (!interTextToSvg) {
    interTextToSvg = TextToSVG.loadSync(INTER_FONT_PATH);
  }
  return interTextToSvg;
}

/** Lower-level: any `text-to-svg` anchor string (e.g. `"left top"`). */
export function interTextToPathWithAnchor(
  text: string,
  opts: {
    x: number;
    y: number;
    fontSize: number;
    anchor: string;
    fill: string;
    stroke?: string;
    strokeWidth?: number;
  }
): string {
  const raw = String(text ?? "");
  const t = raw.length > 0 ? raw : " ";
  const tts = getInterTextToSVG();
  const attributes: Record<string, string> = {
    fill: escapeXML(opts.fill),
  };
  if (opts.stroke && opts.strokeWidth && opts.strokeWidth > 0) {
    attributes.stroke = escapeXML(opts.stroke);
    attributes["stroke-width"] = String(opts.strokeWidth);
    attributes["paint-order"] = "stroke";
  }
  return tts.getPath(t, {
    x: opts.x,
    y: opts.y,
    fontSize: opts.fontSize,
    anchor: opts.anchor,
    attributes,
  });
}

/** Maps SVG `text-anchor` to text-to-svg `anchor` (horizontal + baseline). */
export type SvgTextAnchor = "start" | "middle" | "end";

const ANCHOR_FOR_TEXT_ANCHOR: Record<SvgTextAnchor, string> = {
  start: "left baseline",
  middle: "center baseline",
  end: "right baseline",
};

/**
 * Single-line label as `<path …/>` using Inter outlines (no `<text>`, no fontconfig).
 */
export function interTextToPathElement(
  text: string,
  opts: {
    x: number;
    y: number;
    fontSize: number;
    textAnchor: SvgTextAnchor;
    fill: string;
    stroke?: string;
    strokeWidth?: number;
  }
): string {
  const raw = String(text ?? "");
  const t = raw.length > 0 ? raw : " ";
  const tts = getInterTextToSVG();
  const attributes: Record<string, string> = {
    fill: escapeXML(opts.fill),
  };
  if (opts.stroke && opts.strokeWidth && opts.strokeWidth > 0) {
    attributes.stroke = escapeXML(opts.stroke);
    attributes["stroke-width"] = String(opts.strokeWidth);
    attributes["paint-order"] = "stroke";
  }
  return tts.getPath(t, {
    x: opts.x,
    y: opts.y,
    fontSize: opts.fontSize,
    anchor: ANCHOR_FOR_TEXT_ANCHOR[opts.textAnchor],
    attributes,
  });
}

/** Width in px for one line (matches `text-to-svg` / Inter-Bold). */
export function interTextWidthPx(text: string, fontSize: number): number {
  const t = String(text ?? "").length > 0 ? String(text) : " ";
  return getInterTextToSVG().getWidth(t, { fontSize });
}
