import { gl, buildAdditionalContext } from '../gitlab/client';
import { getVerdictHistory } from '../memory/retriever';
import { AdditionalContextItem, MRContext } from '../types';
import { compactLines, truncate, unique } from '../utils/text';
import { shouldLoadFullFile, selectChangedFiles } from './file-selector';

export async function buildMRContext(event: any): Promise<MRContext> {
  const projectId = event.project?.id ?? event.project_id;
  const mrIid = event.object_attributes?.iid;

  if (!projectId || !mrIid) {
    throw new Error('Missing project_id or mr_iid in merge request event');
  }

  const mr = await gl.getMR(projectId, mrIid);
  const project = event.project?.default_branch ? event.project : await gl.getProject(projectId);
  const defaultBranch = project.default_branch ?? 'main';
  const sourceBranch = mr.source_branch ?? event.object_attributes?.source_branch ?? defaultBranch;
  const targetBranch = mr.target_branch ?? event.object_attributes?.target_branch ?? defaultBranch;
  const diffs = await gl.getMRDiff(projectId, mrIid);
  const changedFiles = selectChangedFiles(diffs);
  const codeowners = await gl.getCODEOWNERS(projectId, targetBranch);

  const formattedDiff = diffs
    .slice(0, 15)
    .map((diff: any) => {
      const header = `=== ${diff.new_path ?? diff.old_path} (${diff.new_file ? 'new' : 'modified'}) ===`;
      return `${header}\n${truncate(diff.diff ?? '', 2500)}`;
    })
    .join('\n\n');

  const fileContents: Record<string, string> = {};
  for (const file of changedFiles.slice(0, 5)) {
    const content = await gl.getFile(projectId, file, sourceBranch);
    if (content && shouldLoadFullFile(content)) {
      fileContents[file] = content;
    }
  }

  const importSignatures: Record<string, string> = {};
  const importTargets: string[] = [];
  for (const file of changedFiles.slice(0, 3)) {
    const content = fileContents[file] ?? (await gl.getFile(projectId, file, sourceBranch));
    if (!content) {
      continue;
    }

    importTargets.push(...extractRelativeImports(content, file));
  }

  for (const importTarget of unique(importTargets).slice(0, 5)) {
    const importContent = await gl.getFile(projectId, importTarget, sourceBranch);
    if (importContent) {
      importSignatures[importTarget] = extractExportSignatures(importContent);
    }
  }

  const linkedIssue = await getLinkedIssueSummary(projectId, mr.description ?? '');

  return {
    project_id: projectId,
    mr_iid: mrIid,
    diff: formattedDiff,
    mr_title: mr.title ?? '',
    mr_description: truncate(mr.description ?? '', 500),
    target_branch: targetBranch,
    source_branch: sourceBranch,
    author: mr.author?.username ?? 'unknown',
    sha: mr.sha ?? mr.diff_refs?.head_sha ?? mr.last_commit?.id ?? '',
    changed_files: changedFiles,
    file_contents: fileContents,
    import_signatures: importSignatures,
    codeowners: truncate(codeowners ?? '', 500),
    verdict_history: await getVerdictHistory(changedFiles),
    linked_issue: linkedIssue
  };
}

async function getLinkedIssueSummary(projectId: string | number, description: string): Promise<string | null> {
  const match = description.match(/#(\d+)/);
  if (!match) {
    return null;
  }

  const issue = await gl.getIssue(projectId, Number.parseInt(match[1], 10)).catch(() => null);
  return issue?.description ? truncate(issue.description, 300) : null;
}

function extractRelativeImports(content: string, filePath: string): string[] {
  const directory = filePath.split('/').slice(0, -1);
  const imports: string[] = [];

  for (const match of content.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
    const rawImport = match[1];
    const resolved = resolveRelativeImport(directory, rawImport);
    if (resolved) {
      imports.push(resolved);
    }
  }

  for (const match of content.matchAll(/from\s+\.(\w[\w.]*)\s+import/g)) {
    const rawImport = `./${match[1].replace(/\./g, '/')}.py`;
    const resolved = resolveRelativeImport(directory, rawImport);
    if (resolved) {
      imports.push(resolved);
    }
  }

  return unique(imports);
}

function resolveRelativeImport(directory: string[], rawImport: string): string | null {
  const segments = [...directory];
  let remainder = rawImport;

  while (remainder.startsWith('../')) {
    segments.pop();
    remainder = remainder.slice(3);
  }

  if (remainder.startsWith('./')) {
    remainder = remainder.slice(2);
  }

  if (!remainder) {
    return null;
  }

  const joined = [...segments, remainder].join('/');
  return /\.[a-z]+$/i.test(joined) ? joined : `${joined}.ts`;
}

function extractExportSignatures(content: string): string {
  return content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^(export\s+(async\s+)?(function|class|const|interface|type|enum))/.test(line))
    .slice(0, 15)
    .join('\n');
}

export function buildMRGoal(context: MRContext): string {
  return compactLines([
    'Review this merge request for bad code that should be detected, blocked, and fixed automatically.',
    `Title: ${context.mr_title}`,
    `Author: @${context.author}`,
    `Target branch: ${context.target_branch}`,
    `Source branch: ${context.source_branch}`,
    `Changed files: ${context.changed_files.join(', ')}`,
    '',
    context.mr_description ? `Description:\n${context.mr_description}` : '',
    context.linked_issue ? `Linked issue:\n${context.linked_issue}` : '',
    `Diff:\n${context.diff}`,
    Object.keys(context.file_contents).length
      ? `Full file contents:\n${JSON.stringify(context.file_contents, null, 2)}`
      : '',
    Object.keys(context.import_signatures).length
      ? `Import signatures:\n${JSON.stringify(context.import_signatures, null, 2)}`
      : '',
    context.codeowners ? `CODEOWNERS:\n${context.codeowners}` : '',
    context.verdict_history ? `Verdict history:\n${context.verdict_history}` : ''
  ]);
}

export function buildMRAdditionalContext(context: MRContext): AdditionalContextItem[] {
  return [
    buildAdditionalContext('merge_request', {
      iid: context.mr_iid,
      title: context.mr_title,
      description: context.mr_description,
      source_branch: context.source_branch,
      target_branch: context.target_branch,
      author: context.author,
      changed_files: context.changed_files,
      sha: context.sha
    }),
    buildAdditionalContext('diff', context.diff),
    buildAdditionalContext('files', context.file_contents),
    buildAdditionalContext('import_signatures', context.import_signatures),
    buildAdditionalContext('codeowners', context.codeowners),
    buildAdditionalContext('verdict_history', context.verdict_history),
    buildAdditionalContext('linked_issue', context.linked_issue ?? '')
  ];
}
