import { gl, buildAdditionalContext } from '../gitlab/client';
import { AdditionalContextItem, IssueContext } from '../types';
import { compactLines, truncate } from '../utils/text';

const STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'from',
  'into',
  'this',
  'that',
  'need',
  'have',
  'issue'
]);

export async function buildIssueContext(event: any): Promise<IssueContext> {
  const projectId = event.project?.id ?? event.project_id;
  const issueIid = event.object_attributes?.iid;

  if (!projectId || !issueIid) {
    throw new Error('Missing project_id or issue_iid in issue event');
  }

  const issue = await gl.getIssue(projectId, issueIid);
  const project = event.project?.default_branch ? event.project : await gl.getProject(projectId);
  const defaultBranch = project.default_branch ?? 'main';
  const tree = await gl.getFileTree(projectId, defaultBranch, true);
  const keywords = extractKeywords(`${issue.title ?? ''} ${issue.description ?? ''}`);
  const candidateFiles = tree
    .map((entry: any) => entry.path)
    .filter((path: string) => keywords.some((keyword) => path.toLowerCase().includes(keyword)))
    .slice(0, 5);

  const fileSignatures: Record<string, string> = {};
  for (const file of candidateFiles) {
    const content = await gl.getFile(projectId, file, defaultBranch);
    if (!content) {
      continue;
    }

    fileSignatures[file] = content
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => /^(export\s+|def\s+|class\s+)/.test(line))
      .slice(0, 10)
      .join('\n');
  }

  const similarIssues = (await gl.listIssues(projectId, { state: 'opened', search: truncate(issue.title ?? '', 40), per_page: 10 }))
    .filter((item) => item.iid !== issueIid)
    .slice(0, 5)
    .map((item) => ({
      iid: item.iid,
      title: item.title,
      state: item.state
    }));

  return {
    project_id: projectId,
    issue_iid: issueIid,
    title: issue.title ?? '',
    description: issue.description ?? '',
    candidate_files: candidateFiles,
    file_signatures: fileSignatures,
    similar_issues: similarIssues
  };
}

function extractKeywords(input: string): string[] {
  return input
    .toLowerCase()
    .match(/[a-z][a-z0-9_-]{2,}/g)
    ?.filter((token) => !STOP_WORDS.has(token))
    .slice(0, 8) ?? [];
}

export function buildIssueGoal(context: IssueContext): string {
  return compactLines([
    'Challenge this issue before code is written. Decide whether it is ready for development or needs clarification.',
    `Title: ${context.title}`,
    `Description:\n${truncate(context.description, 2000)}`,
    context.candidate_files.length ? `Candidate files: ${context.candidate_files.join(', ')}` : '',
    Object.keys(context.file_signatures).length
      ? `File signatures:\n${JSON.stringify(context.file_signatures, null, 2)}`
      : '',
    context.similar_issues.length
      ? `Similar issues:\n${JSON.stringify(context.similar_issues, null, 2)}`
      : ''
  ]);
}

export function buildIssueAdditionalContext(context: IssueContext): AdditionalContextItem[] {
  return [
    buildAdditionalContext('issue', {
      iid: context.issue_iid,
      title: context.title,
      description: truncate(context.description, 2000)
    }),
    buildAdditionalContext('candidate_files', context.candidate_files),
    buildAdditionalContext('file_signatures', context.file_signatures),
    buildAdditionalContext('similar_issues', context.similar_issues)
  ];
}
