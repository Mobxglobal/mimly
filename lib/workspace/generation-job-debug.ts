export function extractedMetadataToDebugRecord(metadata: unknown): Record<string, unknown> {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {};
  }
  return { ...(metadata as Record<string, unknown>) };
}

export function profileToDebugRecord(profile: unknown): Record<string, unknown> | null {
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
    return null;
  }
  return { ...(profile as Record<string, unknown>) };
}

export function mergeDebugIntoMetadata(
  metadata: Record<string, unknown>,
  debug: Record<string, unknown>
): Record<string, unknown> {
  const existingDebug =
    metadata.debug && typeof metadata.debug === "object" && !Array.isArray(metadata.debug)
      ? (metadata.debug as Record<string, unknown>)
      : {};
  return {
    ...metadata,
    debug: {
      ...existingDebug,
      ...debug,
    },
  };
}
