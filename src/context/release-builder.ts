import { gl, buildAdditionalContext } from '../gitlab/client';
import { getVerdictHistory } from '../memory/retriever';
import { AdditionalContextItem, ReleaseContext } from '../types';
import { compactLines, unique } from '../utils/text';

export async function buildReleaseContext(event: any, releaseIssueIid: number): Promise<ReleaseContext> {
  const projectId = event.project?.id ?? event.project_id;
  const ref = event.ref ?? '';

  if (!projectId || !ref.startsWith('refs/tags/')) {
    throw new Error('Invalid tag push event');
  }

  const project = event.project?.default_branch ? event.project : await gl.getProject(projectId);
  const defaultBranch = project.default_branch ?? 'main';
  const tagName = ref.replace('refs/tags/', '');
  const commits = await gl.listCommits(projectId, defaultBranch, 30);

  const touchedFiles: string[] = [];
  for (const commit of commits.slice(0, 10)) {
    const diff = await gl.getCommitDiff(projectId, commit.id).catch(() => []);
    touchedFiles.push(
      ...diff
        .map((item: any) => item.new_path ?? item.old_path)
        .filter((value: string | undefined): value is string => Boolean(value))
    );
  }

  const highPriorityIssues = (await gl.listIssues(projectId, { state: 'opened', per_page: 100 }))
    .filter((issue) => {
      const labels = (issue.labels ?? []).map((label: any) => (typeof label === 'string' ? label : label.title));
      return labels.includes('severity::critical') || labels.includes('severity::high');
    })
    .slice(0, 10)
    .map((issue) => ({
      iid: issue.iid,
      title: issue.title
    }));

  const uniqueTouchedFiles = unique(touchedFiles).slice(0, 20);

  return {
    project_id: projectId,
    tag_name: tagName,
    ref,
    tag_message: event.message ?? '',
    release_issue_iid: releaseIssueIid,
    commits: commits.map((commit) => ({
      id: commit.id,
      title: commit.title,
      message: commit.message
    })),
    high_priority_issues: highPriorityIssues,
    touched_files: uniqueTouchedFiles,
    verdict_history: await getVerdictHistory(uniqueTouchedFiles)
  };
}

export function buildReleaseGoal(context: ReleaseContext): string {
  return compactLines([
    'Challenge this release before users see it. Decide GO or NO_GO and generate release notes.',
    `Tag: ${context.tag_name}`,
    context.tag_message ? `Tag message:\n${context.tag_message}` : '',
    `Recent commits:\n${JSON.stringify(context.commits.slice(0, 30), null, 2)}`,
    context.high_priority_issues.length
      ? `Open high priority issues:\n${JSON.stringify(context.high_priority_issues, null, 2)}`
      : '',
    context.touched_files.length ? `Touched files: ${context.touched_files.join(', ')}` : '',
    context.verdict_history ? `Verdict history:\n${context.verdict_history}` : ''
  ]);
}

export function buildReleaseAdditionalContext(context: ReleaseContext): AdditionalContextItem[] {
  return [
    buildAdditionalContext('release', {
      tag_name: context.tag_name,
      ref: context.ref,
      release_issue_iid: context.release_issue_iid
    }),
    buildAdditionalContext('recent_commits', context.commits),
    buildAdditionalContext('high_priority_issues', context.high_priority_issues),
    buildAdditionalContext('touched_files', context.touched_files),
    buildAdditionalContext('verdict_history', context.verdict_history)
  ];
}
