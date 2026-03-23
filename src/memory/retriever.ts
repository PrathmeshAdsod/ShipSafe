import { getConfig } from '../config';
import { gl } from '../gitlab/client';
import { VerdictStore } from '../types';

const MEMORY_FILE = 'memory/verdicts.json';

export async function getVerdictHistory(files: string[], projectId?: string | number, branch?: string): Promise<string> {
  const config = getConfig();
  const resolvedProjectId = projectId ?? config.gitlabProjectId;
  const resolvedBranch = branch ?? config.gitlabDefaultBranch ?? 'main';

  if (!resolvedProjectId || files.length === 0) {
    return 'No previous ShipSafe verdicts for these files.';
  }

  const content = await gl.getFile(resolvedProjectId, MEMORY_FILE, resolvedBranch);
  if (!content) {
    return 'No previous ShipSafe verdicts for these files.';
  }

  try {
    const store = JSON.parse(content) as VerdictStore;
    const lines: string[] = [];

    for (const file of files) {
      const entry = store[file];
      if (!entry?.verdicts?.length) {
        continue;
      }

      lines.push(`${file}:`);
      for (const verdict of entry.verdicts.slice(-2)) {
        lines.push(
          `  - MR !${verdict.mr_iid} (${verdict.timestamp.slice(0, 10)}): ${verdict.outcome} — ${verdict.summary.slice(0, 150)}`
        );
      }
    }

    return lines.length ? lines.join('\n') : 'No previous ShipSafe verdicts for these files.';
  } catch {
    return 'No previous ShipSafe verdicts for these files.';
  }
}
