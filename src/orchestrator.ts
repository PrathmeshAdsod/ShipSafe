import { getConfig } from './config';
import { selectChangedFiles } from './context/file-selector';
import { buildIssueAdditionalContext, buildIssueContext, buildIssueGoal } from './context/issue-builder';
import { buildMRAdditionalContext, buildMRContext, buildMRGoal } from './context/mr-builder';
import { buildReleaseAdditionalContext, buildReleaseContext, buildReleaseGoal } from './context/release-builder';
import { buildIssueReviewStartedComment, buildMrReviewStartedComment, buildReleaseReviewStartedComment } from './execution/comment-builder';
import { executeIssueVerdict, executeMergeRequestVerdict, executeReleaseVerdict, setStatusCheckState } from './execution/engine';
import { gl } from './gitlab/client';
import { storeVerdict } from './memory/store';
import { FlowKind, IssueDebateVerdict, NoteHookEvent, PragmatistVerdict, ReleaseDebateVerdict, VerdictEnvelope } from './types';
import { decodeVerdictMarker, isTrustedFlowUser } from './utils/verdict-marker';

function getFlowName(kind: FlowKind): string {
  const config = getConfig();

  switch (kind) {
    case 'mr':
      return config.mrFlowName;
    case 'issue':
      return config.issueFlowName;
    case 'release':
      return config.releaseFlowName;
    default:
      return 'ShipSafe Flow';
  }
}

export async function handleWebhookEvent(event: any): Promise<void> {
  switch (event.object_kind) {
    case 'merge_request':
      if (shouldHandleMergeRequest(event)) {
        await launchMergeRequestReview(event);
      }
      break;
    case 'issue':
      if (event.object_attributes?.action === 'open') {
        await launchIssueReview(event);
      }
      break;
    case 'tag_push':
      await launchReleaseReview(event);
      break;
    case 'note':
      await handleVerdictNote(event as NoteHookEvent);
      break;
    default:
      console.log(`[orchestrator] ignoring event kind ${event.object_kind}`);
  }
}

export async function handleStatusCheckHook(event: any): Promise<void> {
  if (event.object_kind !== 'merge_request') {
    return;
  }

  const projectId = event.project?.id ?? event.project_id;
  const mrIid = event.object_attributes?.iid;
  console.log(`[status-checks] received callback for MR !${mrIid ?? 'unknown'} in project ${projectId ?? 'unknown'}`);
}

function shouldHandleMergeRequest(event: any): boolean {
  const action = event.object_attributes?.action;
  if (action === 'open') {
    return true;
  }

  if (action !== 'update') {
    return false;
  }

  if (event.object_attributes?.oldrev) {
    return true;
  }

  const changeKeys = Object.keys(event.changes ?? {});
  return changeKeys.some((key) => !['labels', 'updated_at', 'last_edited_at', 'reviewers'].includes(key));
}

async function launchMergeRequestReview(event: any): Promise<void> {
  const config = getConfig();
  const context = await buildMRContext(event);

  await gl.postMRComment(context.project_id, context.mr_iid, buildMrReviewStartedComment()).catch(() => undefined);
  await setStatusCheckState(context, 'pending').catch(() => undefined);

  try {
    const consumerId = await gl.resolveFlowConsumerId('mr', context.project_id, getFlowName('mr'));
    await gl.startFlow({
      projectId: context.project_id,
      mergeRequestId: context.mr_iid,
      sourceBranch: context.source_branch,
      consumerId,
      goal: buildMRGoal(context),
      additionalContext: buildMRAdditionalContext(context)
    });
  } catch (error) {
    console.error('[orchestrator] failed to start MR flow', error);
    await setStatusCheckState(context, 'failed').catch(() => undefined);
    await gl.postMRComment(
      context.project_id,
      context.mr_iid,
      'ShipSafe could not start the MR review flow. Manual review is required until flow configuration is fixed.'
    ).catch(() => undefined);
    return;
  }

  if (config.enablePlatformTriggerBridge && config.flowReviewerId) {
    await gl.setReviewer(context.project_id, context.mr_iid, [config.flowReviewerId]).catch(() => undefined);
  }
}

async function launchIssueReview(event: any): Promise<void> {
  const context = await buildIssueContext(event);
  await gl.postIssueComment(context.project_id, context.issue_iid, buildIssueReviewStartedComment()).catch(() => undefined);

  try {
    const consumerId = await gl.resolveFlowConsumerId('issue', context.project_id, getFlowName('issue'));
    await gl.startFlow({
      projectId: context.project_id,
      issueId: context.issue_iid,
      consumerId,
      goal: buildIssueGoal(context),
      additionalContext: buildIssueAdditionalContext(context)
    });
  } catch (error) {
    console.error('[orchestrator] failed to start issue flow', error);
    await gl.postIssueComment(
      context.project_id,
      context.issue_iid,
      'ShipSafe could not start the issue triage flow. Manual clarification is required until flow configuration is fixed.'
    ).catch(() => undefined);
  }
}

async function launchReleaseReview(event: any): Promise<void> {
  const projectId = event.project?.id ?? event.project_id;
  if (!projectId || !event.ref?.startsWith('refs/tags/')) {
    return;
  }

  const tagName = String(event.ref).replace('refs/tags/', '');
  const releaseIssue = await getOrCreateReleaseIssue(projectId, tagName);
  await gl.postIssueComment(projectId, releaseIssue.iid, buildReleaseReviewStartedComment(tagName)).catch(() => undefined);

  const context = await buildReleaseContext(event, releaseIssue.iid);
  try {
    const consumerId = await gl.resolveFlowConsumerId('release', context.project_id, getFlowName('release'));
    await gl.startFlow({
      projectId: context.project_id,
      issueId: context.release_issue_iid,
      consumerId,
      goal: buildReleaseGoal(context),
      additionalContext: buildReleaseAdditionalContext(context)
    });
  } catch (error) {
    console.error('[orchestrator] failed to start release flow', error);
    await gl.postIssueComment(
      context.project_id,
      context.release_issue_iid,
      `ShipSafe could not start the release gate flow for \`${context.tag_name}\`. Manual release review is required.`
    ).catch(() => undefined);
  }
}

async function handleVerdictNote(event: NoteHookEvent): Promise<void> {
  if (event.object_attributes?.action !== 'create') {
    return;
  }

  const config = getConfig();
  if (!isTrustedFlowUser(event.user?.username, config.flowServiceUsers)) {
    return;
  }

  const note = event.object_attributes?.note ?? '';
  const envelope = decodeVerdictMarker(note);
  if (!envelope) {
    return;
  }

  switch (envelope.kind) {
    case 'mr':
      await executeMergeRequestEnvelope(event, envelope as VerdictEnvelope & { verdict: PragmatistVerdict });
      break;
    case 'issue':
      await executeIssueEnvelope(event, envelope as VerdictEnvelope & { verdict: IssueDebateVerdict });
      break;
    case 'release':
      await executeReleaseEnvelope(event, envelope as VerdictEnvelope & { verdict: ReleaseDebateVerdict });
      break;
    default:
      break;
  }
}

async function executeMergeRequestEnvelope(
  event: NoteHookEvent,
  envelope: VerdictEnvelope & { verdict: PragmatistVerdict }
): Promise<void> {
  const mrIid = envelope.event.mr_iid ?? event.merge_request?.iid;
  const projectId = envelope.event.project_id ?? event.project_id;

  if (!mrIid || !projectId) {
    return;
  }

  const mr = await gl.getMR(projectId, mrIid);
  const diffs = await gl.getMRDiff(projectId, mrIid).catch(() => []);
  const context = {
    project_id: projectId,
    mr_iid: mrIid,
    diff: '',
    mr_title: mr.title ?? event.merge_request?.title ?? '',
    mr_description: mr.description ?? '',
    target_branch: mr.target_branch,
    source_branch: mr.source_branch,
    author: mr.author?.username ?? 'unknown',
    sha: mr.sha ?? mr.last_commit?.id ?? '',
    changed_files: selectChangedFiles(diffs),
    file_contents: {},
    import_signatures: {},
    codeowners: '',
    verdict_history: '',
    linked_issue: null
  };

  await executeMergeRequestVerdict(context, envelope.verdict);
  await storeVerdict(context.changed_files, envelope.verdict, mrIid, projectId);
}

async function executeIssueEnvelope(
  event: NoteHookEvent,
  envelope: VerdictEnvelope & { verdict: IssueDebateVerdict }
): Promise<void> {
  const issueIid = envelope.event.issue_iid ?? event.issue?.iid;
  const projectId = envelope.event.project_id ?? event.project_id;

  if (!issueIid || !projectId) {
    return;
  }

  const issue = await gl.getIssue(projectId, issueIid);
  await executeIssueVerdict(
    {
      project_id: projectId,
      issue_iid: issueIid,
      title: issue.title,
      description: issue.description ?? '',
      candidate_files: [],
      file_signatures: {},
      similar_issues: []
    },
    envelope.verdict
  );
}

async function executeReleaseEnvelope(
  event: NoteHookEvent,
  envelope: VerdictEnvelope & { verdict: ReleaseDebateVerdict }
): Promise<void> {
  const projectId = envelope.event.project_id;
  const issueIid = envelope.event.issue_iid;
  const releaseTag = envelope.event.release_tag ?? parseReleaseTagFromIssueTitle(event.issue?.title);

  if (!projectId || !issueIid || !releaseTag) {
    return;
  }

  await executeReleaseVerdict(
    {
      project_id: projectId,
      tag_name: releaseTag,
      ref: `refs/tags/${releaseTag}`,
      tag_message: '',
      release_issue_iid: issueIid,
      commits: [],
      high_priority_issues: [],
      touched_files: [],
      verdict_history: ''
    },
    envelope.verdict
  );
}

function parseReleaseTagFromIssueTitle(title: string | undefined): string | undefined {
  const match = title?.match(/^\[ShipSafe Release Gate\]\s+(.+?)\s*$/);
  return match?.[1]?.trim() || undefined;
}

async function getOrCreateReleaseIssue(projectId: string | number, tagName: string): Promise<any> {
  const title = `[ShipSafe Release Gate] ${tagName}`;
  const existing = await gl.listIssues(projectId, { state: 'opened', search: title, per_page: 10 });
  const match = existing.find((issue) => issue.title === title);
  if (match) {
    return match;
  }

  return gl.createIssue(projectId, {
    title,
    description: `ShipSafe release control issue for tag \`${tagName}\`. Verdict notes from the release flow are collected here.`,
    labels: 'shipsafe,shipsafe::release-control'
  });
}
