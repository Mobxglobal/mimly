/**
 * Visual-only variant for engagement_text PNG renders (not a content template).
 */

export type EngagementVisualStyle = "classic" | "inverse";

export type EngagementTheme = {
  canvasBg: string;
  textPrimary: string;
  textMuted: string;
  lineStroke: string;
};

export function coerceEngagementVisualStyle(
  value: unknown
): EngagementVisualStyle {
  return value === "inverse" ? "inverse" : "classic";
}

export function resolveEngagementTheme(
  style: EngagementVisualStyle | null | undefined
): EngagementTheme {
  if (style === "inverse") {
    return {
      canvasBg: "#000000",
      textPrimary: "#FFFFFF",
      textMuted: "#EDEDED",
      lineStroke: "#FFFFFF",
    };
  }
  return {
    canvasBg: "#FFFFFF",
    textPrimary: "#000000",
    textMuted: "#111111",
    lineStroke: "#000000",
  };
}
