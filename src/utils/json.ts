export function stripMarkdownFences(value: string): string {
  return value.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
}

export function safeJsonParse<T>(value: string): T | null {
  try {
    return JSON.parse(stripMarkdownFences(value)) as T;
  } catch {
    return null;
  }
}

export function stringifyPretty(value: unknown): string {
  return JSON.stringify(value, null, 2);
}
