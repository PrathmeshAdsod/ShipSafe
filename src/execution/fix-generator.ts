import { gl } from '../gitlab/client';

interface FixMRParams {
  projectId: string | number;
  mrIid: number;
  sourceBranch: string;
  targetBranch: string;
  fixCodeChanges: Array<{
    file_path: string;
    old_content: string;
    new_content: string;
  }>;
  fixDescription: string;
  verdictSummary: string;
  issueIid: number | null;
}

export async function generateFixMR(params: FixMRParams): Promise<number | null> {
  const {
    projectId,
    mrIid,
    sourceBranch,
    targetBranch,
    fixCodeChanges,
    fixDescription,
    verdictSummary,
    issueIid
  } = params;

  const commitActions: Array<{ action: string; file_path: string; content: string }> = [];

  for (const change of fixCodeChanges) {
    try {
      if (!change.old_content) {
        console.warn(`[fix] empty old_content for ${change.file_path}`);
        continue;
      }

      const currentContent = await gl.getFile(projectId, change.file_path, sourceBranch);
      if (!currentContent || !currentContent.includes(change.old_content)) {
        console.warn(`[fix] old_content not found in ${change.file_path}`);
        continue;
      }

      const occurrences = countOccurrences(currentContent, change.old_content);
      if (occurrences !== 1) {
        console.warn(`[fix] old_content matched ${occurrences} times in ${change.file_path}; refusing ambiguous patch`);
        continue;
      }

      const updatedContent = currentContent.replace(change.old_content, change.new_content);
      commitActions.push({
        action: 'update',
        file_path: change.file_path,
        content: updatedContent
      });
    } catch (error) {
      console.warn(`[fix] failed to prepare change for ${change.file_path}`, error);
    }
  }

  if (commitActions.length === 0) {
    return null;
  }

  const branchSuffix = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const fixBranch = `shipsafe/fix-mr-${mrIid}-${branchSuffix}`;

  try {
    await gl.createBranch(projectId, fixBranch, sourceBranch);
  } catch (error) {
    console.error('[fix] branch creation failed', error);
    return null;
  }

  try {
    await gl.createCommit(projectId, {
      branch: fixBranch,
      commit_message: `fix: shipsafe auto-fix for MR !${mrIid}\n\n${fixDescription}`,
      actions: commitActions
    });
  } catch (error) {
    console.error('[fix] commit failed', error);
    return null;
  }

  let fixMr: any;
  try {
    fixMr = await gl.createMR(projectId, {
      source_branch: fixBranch,
      target_branch: targetBranch,
      title: `fix: shipsafe auto-fix for !${mrIid}`,
      description: buildFixMrDescription(params, commitActions),
      remove_source_branch: false
    });
  } catch (error) {
    console.error('[fix] merge request creation failed', error);
    return null;
  }

  const issueText = issueIid ? ` Related issue: #${issueIid}.` : '';
  await gl.postMRComment(
    projectId,
    mrIid,
    `ShipSafe blocked this merge request and proposed a fix in !${fixMr.iid}.${issueText}\n\nWhy blocked: ${verdictSummary}`
  ).catch(() => undefined);

  await gl.postMRComment(
    projectId,
    fixMr.iid,
    `This fix MR was generated automatically from source MR !${mrIid}.${issueText}\n\nWhy it exists: ${verdictSummary}`
  ).catch(() => undefined);

  return fixMr.iid;
}

function buildFixMrDescription(
  params: FixMRParams,
  changes: Array<{ action: string; file_path: string; content: string }>
): string {
  return [
    '## ShipSafe Auto-Fix',
    '',
    `Source MR: !${params.mrIid}`,
    `Problem: ${params.fixDescription}`,
    '',
    '### Changed files',
    ...changes.map((change) => `- \`${change.file_path}\``),
    '',
    '### Why this exists',
    params.verdictSummary,
    '',
    'Review this patch before merging.'
  ].join('\n');
}

function countOccurrences(content: string, search: string): number {
  let count = 0;
  let offset = 0;

  while (true) {
    const index = content.indexOf(search, offset);
    if (index === -1) {
      return count;
    }

    count += 1;
    offset = index + search.length;
  }
}
