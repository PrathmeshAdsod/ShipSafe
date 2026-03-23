import { getConfig } from '../config';
import { gl } from '../gitlab/client';
import { IssueContext, IssueDebateVerdict, MRContext, PragmatistVerdict, ReleaseContext, ReleaseDebateVerdict } from '../types';
import { buildAutoFixFailureComment } from './comment-builder';
import { generateFixMR } from './fix-generator';

const LABELS: Record<string, { color: string; description: string }> = {
  shipsafe: { color: '#004a77', description: 'Managed by ShipSafe automation' },
  'shipsafe::blocked': { color: '#b60205', description: 'Bad code was detected and merge is blocked' },
  'shipsafe::approved': { color: '#0e8a16', description: 'ShipSafe approved the change' },
  'shipsafe::ready': { color: '#0e8a16', description: 'ShipSafe marked the issue ready for development' },
  'shipsafe::needs-clarification': { color: '#fbca04', description: 'ShipSafe requires clarification before implementation' },
  'shipsafe::architectural': { color: '#5319e7', description: 'ShipSafe detected an architectural concern' },
  'shipsafe::release-control': { color: '#d93f0b', description: 'ShipSafe release control issue' },
  'severity::critical': { color: '#b60205', description: 'Critical severity issue' },
  'severity::high': { color: '#d93f0b', description: 'High severity issue' },
  'severity::medium': { color: '#fbca04', description: 'Medium severity issue' },
  'severity::low': { color: '#0e8a16', description: 'Low severity issue' }
};

export async function executeMergeRequestVerdict(context: MRContext, verdict: PragmatistVerdict): Promise<void> {
  const config = getConfig();
  const { project_id: projectId, mr_iid: mrIid } = context;

  await ensureLabels(projectId, ['shipsafe', verdictLabel(verdict)]);
  await setStatusCheckState(context, verdict.actions.block_mr ? 'failed' : 'passed').catch(() => undefined);

  if (verdict.actions.block_mr && config.enableMrBlocking) {
    await gl.unapproveMR(projectId, mrIid).catch(() => undefined);
    await gl.updateMRLabels(projectId, mrIid, ['shipsafe', 'shipsafe::blocked'], ['shipsafe::approved']).catch(() => undefined);
  }

  if (verdict.actions.auto_approve && config.enableAutoApprove) {
    await gl.approveMR(projectId, mrIid).catch(() => undefined);
    await gl.updateMRLabels(projectId, mrIid, ['shipsafe', 'shipsafe::approved'], ['shipsafe::blocked']).catch(() => undefined);
  }

  let createdIssueIid: number | null = null;

  if (verdict.actions.create_issue && config.enableIssueCreation) {
    const severityLabel = `severity::${verdict.actions.issue_severity}`;
    await ensureLabels(projectId, [severityLabel]);
    const issue = await gl.createIssue(projectId, {
      title: `[ShipSafe] ${buildIssueTitle(verdict)}`,
      description: buildIssueBody(context, verdict),
      labels: ['shipsafe', severityLabel].join(','),
      confidential: verdict.accepted_findings.some((finding) => /security|auth|token|injection|bypass/i.test(finding))
    }).catch((error) => {
      console.error('[engine] create issue failed', error);
      return null;
    });

    createdIssueIid = issue?.iid ?? null;
  }

  if (verdict.actions.generate_fix_mr && verdict.fix_code_changes?.length && config.enableFixMr) {
    const fixMrIid = await generateFixMR({
      projectId,
      mrIid,
      sourceBranch: context.source_branch || context.target_branch,
      targetBranch: context.target_branch,
      fixCodeChanges: verdict.fix_code_changes,
      fixDescription: verdict.fix_description ?? verdict.summary,
      verdictSummary: verdict.summary,
      issueIid: createdIssueIid
    }).catch((error) => {
      console.error('[engine] generate fix MR failed', error);
      return null;
    });

    if (!fixMrIid) {
      await gl.postMRComment(projectId, mrIid, buildAutoFixFailureComment()).catch(() => undefined);
    }
  }

  if (verdict.actions.scan_codebase && config.enableCodebaseScan) {
    await gl.postMRComment(
      projectId,
      mrIid,
      `ShipSafe flagged a likely pattern concern. Audit related files beyond this MR: ${context.changed_files.join(', ')}`
    ).catch(() => undefined);
  }

  if (verdict.actions.create_epic) {
    await ensureLabels(projectId, ['shipsafe::architectural']);
    await gl.updateMRLabels(projectId, mrIid, ['shipsafe::architectural'], []).catch(() => undefined);
    await gl.postMRComment(
      projectId,
      mrIid,
      'ShipSafe detected an architectural concern that should be tracked before this merge is reconsidered.'
    ).catch(() => undefined);
  }
}

export async function executeIssueVerdict(context: IssueContext, verdict: IssueDebateVerdict): Promise<void> {
  const projectId = context.project_id;
  const issueIid = context.issue_iid;

  await ensureLabels(projectId, ['shipsafe', 'shipsafe::ready', 'shipsafe::needs-clarification']);

  if (verdict.outcome === 'READY_FOR_DEVELOPMENT') {
    await gl.updateIssue(projectId, issueIid, {
      add_labels: 'shipsafe,shipsafe::ready',
      remove_labels: 'shipsafe::needs-clarification'
    }).catch(() => undefined);
  } else {
    await gl.updateIssue(projectId, issueIid, {
      add_labels: 'shipsafe,shipsafe::needs-clarification',
      remove_labels: 'shipsafe::ready'
    }).catch(() => undefined);

    for (const gap of verdict.gaps.slice(0, 3)) {
      await gl.createIssue(projectId, {
        title: `[ShipSafe Gap] ${gap.slice(0, 80)}`,
        description: `Created automatically from issue #${issueIid}.\n\nGap:\n${gap}`,
        labels: 'shipsafe,shipsafe::needs-clarification'
      }).catch(() => undefined);
    }
  }

  await gl.postIssueComment(
    projectId,
    issueIid,
    `ShipSafe ${verdict.outcome === 'READY_FOR_DEVELOPMENT' ? 'marked this ready for development' : 'found clarification gaps'}.\n\n${verdict.summary}`
  ).catch(() => undefined);
}

export async function executeReleaseVerdict(context: ReleaseContext, verdict: ReleaseDebateVerdict): Promise<void> {
  const projectId = context.project_id;
  const description = [
    `## ShipSafe Release Verdict: ${verdict.outcome}`,
    '',
    verdict.summary,
    '',
    verdict.release_notes
  ].join('\n');

  const existingRelease = await gl.getRelease(projectId, context.tag_name).catch(() => null);

  if (verdict.outcome === 'GO') {
    if (existingRelease) {
      await gl.updateRelease(projectId, context.tag_name, {
        name: existingRelease.name ?? context.tag_name,
        description
      }).catch(() => undefined);
    } else {
      await gl.createRelease(projectId, {
        tag_name: context.tag_name,
        ref: context.tag_name,
        name: context.tag_name,
        description
      }).catch(() => undefined);
    }
  } else {
    await ensureLabels(projectId, ['shipsafe', 'severity::high']);
    await gl.createIssue(projectId, {
      title: `[ShipSafe Release Blocker] ${context.tag_name}`,
      description: `${verdict.summary}\n\nBlockers:\n${verdict.blockers.map((blocker) => `- ${blocker}`).join('\n')}`,
      labels: 'shipsafe,severity::high'
    }).catch(() => undefined);

    if (existingRelease) {
      await gl.updateRelease(projectId, context.tag_name, {
        name: existingRelease.name ?? context.tag_name,
        description: `${description}\n\nRelease is currently blocked.`
      }).catch(() => undefined);
    }
  }

  await gl.postIssueComment(
    projectId,
    context.release_issue_iid,
    `ShipSafe finished release review for \`${context.tag_name}\` with verdict ${verdict.outcome}.\n\n${verdict.summary}`
  ).catch(() => undefined);
}

export async function setStatusCheckState(
  context: Pick<MRContext, 'project_id' | 'mr_iid' | 'sha'>,
  status: 'pending' | 'passed' | 'failed'
): Promise<void> {
  const config = getConfig();
  if (!config.enableStatusChecks || !context.sha) {
    return;
  }

  const checks = await gl.listExternalStatusChecks(context.project_id, context.mr_iid).catch(() => []);
  const shipsafeCheck = checks.find((check) => check.name === config.externalStatusCheckName);

  if (!shipsafeCheck) {
    console.warn('[engine] ShipSafe external status check not found');
    return;
  }

  await gl.setExternalStatusCheck(context.project_id, context.mr_iid, shipsafeCheck.id, context.sha, status);
}

function verdictLabel(verdict: PragmatistVerdict): string {
  return verdict.actions.block_mr ? 'shipsafe::blocked' : 'shipsafe::approved';
}

async function ensureLabels(projectId: string | number, labels: string[]): Promise<void> {
  const existing = await gl.listLabels(projectId).catch(() => []);
  const existingNames = new Set(existing.map((label) => label.name));

  for (const label of labels) {
    if (existingNames.has(label)) {
      continue;
    }

    const spec = LABELS[label] ?? { color: '#5319e7', description: 'Managed by ShipSafe' };
    await gl.createLabel(projectId, label, spec.color, spec.description).catch(() => undefined);
  }
}

function buildIssueTitle(verdict: PragmatistVerdict): string {
  return verdict.accepted_findings[0]?.slice(0, 90) ?? verdict.summary.slice(0, 90);
}

function buildIssueBody(context: MRContext, verdict: PragmatistVerdict): string {
  return [
    '## ShipSafe Detection',
    '',
    `Source MR: !${context.mr_iid}`,
    `Outcome: ${verdict.outcome}`,
    `Confidence: ${verdict.confidence}%`,
    '',
    '### Summary',
    verdict.summary,
    '',
    '### Accepted findings',
    ...(verdict.accepted_findings.length ? verdict.accepted_findings.map((finding) => `- ${finding}`) : ['- See summary.']),
    '',
    '### Fix guidance',
    verdict.fix_description ?? 'Review the verdict and patch manually if auto-fix is unavailable.'
  ].join('\n');
}
