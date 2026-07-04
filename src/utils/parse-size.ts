// src/utils/parse-size.ts

const SIZE_UNITS: Record<string, number> = {
  B: 1,
  KB: 1024,
  MB: 1024 * 1024,
  GB: 1024 * 1024 * 1024,
};

/**
 * Parse a human-readable size string (e.g., "50MB") to bytes.
 * Accepts: "500KB", "50MB", "1GB", "1024" (plain bytes), or a number.
 */
export function parseSize(input: string | number): number {
  if (typeof input === 'number') return input;

  const trimmed = input.trim().toUpperCase();

  // Plain number
  if (/^\d+$/.test(trimmed)) return parseInt(trimmed, 10);

  const match = trimmed.match(/^(\d+(?:\.\d+)?)\s*(KB|MB|GB|B)$/);
  if (!match) throw new Error(`Invalid size format: "${input}". Use e.g. "50MB", "1GB", "500KB".`);

  const value = parseFloat(match[1]);
  const unit = match[2];
  return Math.floor(value * SIZE_UNITS[unit]);
}

/**
 * Format bytes to a human-readable string.
 */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
