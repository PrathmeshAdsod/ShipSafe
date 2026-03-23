import { unique } from '../utils/text';

export function shouldLoadFullFile(content: string): boolean {
  return content.split('\n').length <= 200;
}

export function selectChangedFiles(diffs: any[], limit = 15): string[] {
  return unique(
    diffs
      .slice(0, limit)
      .map((diff) => diff.new_path ?? diff.old_path)
      .filter((value): value is string => Boolean(value))
      .filter((file) => !file.includes('node_modules'))
  );
}
