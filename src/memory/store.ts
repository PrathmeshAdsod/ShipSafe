import { getConfig } from '../config';
import { gl } from '../gitlab/client';
import { VerdictStore } from '../types';

const MEMORY_FILE = 'memory/verdicts.json';

export async function loadStore(projectId?: string | number, branch?: string): Promise<VerdictStore> {
  const config = getConfig();
  const resolvedProjectId = projectId ?? config.gitlabProjectId;
  const resolvedBranch = branch ?? config.gitlabDefaultBranch ?? 'main';

  if (!resolvedProjectId) {
    return {};
  }

  const content = await gl.getFile(resolvedProjectId, MEMORY_FILE, resolvedBranch);
  if (!content) {
    return {};
  }

  try {
    return JSON.parse(content) as VerdictStore;
  } catch {
    return {};
  }
}

export async function storeVerdict(
  files: string[],
  verdict: { outcome?: string; summary?: string; accepted_findings?: string[] },
  mrIid: number,
  projectId?: string | number,
  branch?: string
): Promise<void> {
  const config = getConfig();
  if (!config.enableMemory) {
    return;
  }

  const resolvedProjectId = projectId ?? config.gitlabProjectId;
  const resolvedBranch = branch ?? config.gitlabDefaultBranch ?? 'main';

  if (!resolvedProjectId || files.length === 0) {
    return;
  }

  const store = await loadStore(resolvedProjectId, resolvedBranch);
  for (const file of files) {
    if (!store[file]) {
      store[file] = { verdicts: [] };
    }

    store[file].verdicts.push({
      outcome: verdict.outcome ?? 'UNKNOWN',
      summary: (verdict.summary ?? '').slice(0, 200),
      timestamp: new Date().toISOString(),
      mr_iid: mrIid,
      key_findings: (verdict.accepted_findings ?? []).slice(0, 3)
    });

    store[file].verdicts = store[file].verdicts.slice(-10);
  }

  await gl.writeFile(
    resolvedProjectId,
    MEMORY_FILE,
    JSON.stringify(store, null, 2),
    resolvedBranch,
    'chore: update shipsafe verdict memory [skip ci]'
  );
}
