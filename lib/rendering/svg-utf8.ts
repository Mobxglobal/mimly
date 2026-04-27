/** UTF-8 XML declaration for Sharp/librsvg SVG documents. */
export const SVG_UTF8_XML_DECL = '<?xml version="1.0" encoding="UTF-8"?>\n';

export function escapeXML(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function svgStringToUtf8Buffer(svg: string): Buffer {
  return Buffer.from(svg, "utf-8");
}

/** Temporary: log escaped sample for Sharp SVG pipeline debugging. */
export function logSvgDebugSample(rawTextForSample: string): void {
  const safeTop = escapeXML(rawTextForSample.slice(0, 240));
  console.log("[svg-debug] sample text:", safeTop);
}
