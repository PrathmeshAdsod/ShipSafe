export function truncate(value: string | null | undefined, max: number): string {
  const input = value ?? '';
  if (input.length <= max) {
    return input;
  }

  return `${input.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

export function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

export function compactLines(lines: Array<string | null | undefined>): string {
  return lines.filter((line): line is string => Boolean(line && line.trim())).join('\n');
}
