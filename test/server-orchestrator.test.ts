import request from 'supertest';
import crypto from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { encodeVerdictMarker } from '../src/utils/verdict-marker';

describe('server and orchestrator', () => {
  beforeEach(() => {
    process.env.GITLAB_WEBHOOK_SECRET = 'secret';
    process.env.SHIPSAFE_FLOW_SERVICE_USERS = 'shipsafe-bot';
    process.env.SHIPSAFE_EXTERNAL_STATUS_CHECK_NAME = 'ShipSafe';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.resetModules();
    vi.doUnmock('../src/orchestrator');
    delete process.env.GITLAB_STATUS_CHECK_SHARED_SECRET;
  });

  it('returns 200 immediately from /webhook without awaiting processing', async () => {
    vi.doMock('../src/orchestrator', () => ({
      handleWebhookEvent: vi.fn().mockImplementation(async () => new Promise(() => undefined)),
      handleStatusCheckHook: vi.fn().mockResolvedValue(undefined)
    }));

    const { createApp } = await import('../src/server');
    const app = createApp();

    await request(app)
      .post('/webhook')
      .set('x-gitlab-token', 'secret')
      .send({ object_kind: 'merge_request', object_attributes: { action: 'open', iid: 1 }, project: { id: 1 } })
      .expect(200, 'ok');
  });

  it('rejects unauthorized webhook requests', async () => {
    const { createApp } = await import('../src/server');
    const app = createApp();

    await request(app)
      .post('/webhook')
      .set('x-gitlab-token', 'wrong')
      .send({})
      .expect(401);
  });

  it('accepts status check callbacks signed with the configured HMAC secret', async () => {
    process.env.GITLAB_STATUS_CHECK_SHARED_SECRET = 'status-secret';

    vi.doMock('../src/orchestrator', () => ({
      handleWebhookEvent: vi.fn().mockResolvedValue(undefined),
      handleStatusCheckHook: vi.fn().mockResolvedValue(undefined)
    }));

    const payload = { object_kind: 'merge_request', object_attributes: { iid: 3 } };
    const body = JSON.stringify(payload);
    const signature = crypto.createHmac('sha256', 'status-secret').update(body).digest('hex');

    const { createApp } = await import('../src/server');
    const app = createApp();

    await request(app)
      .post('/status-checks/hook')
      .set('x-gitlab-signature', signature)
      .set('Content-Type', 'application/json')
      .send(body)
      .expect(200, 'ok');
  });

  it('rejects status check callbacks with an invalid HMAC signature', async () => {
    process.env.GITLAB_STATUS_CHECK_SHARED_SECRET = 'status-secret';

    const { createApp } = await import('../src/server');
    const app = createApp();

    await request(app)
      .post('/status-checks/hook')
      .set('x-gitlab-signature', 'bad-signature')
      .send({ object_kind: 'merge_request', object_attributes: { iid: 3 } })
      .expect(401);
  });

  it('processes a trusted MR verdict note and executes the action chain', async () => {
    const { handleWebhookEvent } = await import('../src/orchestrator');
    const { gl } = await import('../src/gitlab/client');

    vi.spyOn(gl, 'getMR').mockResolvedValue({
      title: 'Fix auth bug',
      description: 'desc',
      target_branch: 'main',
      source_branch: 'feature/auth',
      author: { username: 'dev1' },
      sha: 'abc123'
    });
    vi.spyOn(gl, 'listExternalStatusChecks').mockResolvedValue([{ id: 9, name: 'ShipSafe', status: 'pending', external_url: 'https://example.com' }]);
    const setStatusSpy = vi.spyOn(gl, 'setExternalStatusCheck').mockResolvedValue({});
    vi.spyOn(gl, 'listLabels').mockResolvedValue([]);
    vi.spyOn(gl, 'createLabel').mockResolvedValue({});
    vi.spyOn(gl, 'unapproveMR').mockResolvedValue({});
    vi.spyOn(gl, 'updateMRLabels').mockResolvedValue({});
    const createIssueSpy = vi.spyOn(gl, 'createIssue').mockResolvedValue({ iid: 31 });
    vi.spyOn(gl, 'getFile').mockResolvedValue('if (payload.exp > Date.now() / 1000) {');
    vi.spyOn(gl, 'createBranch').mockResolvedValue({});
    vi.spyOn(gl, 'createCommit').mockResolvedValue({});
    const createMrSpy = vi.spyOn(gl, 'createMR').mockResolvedValue({ iid: 45 });
    vi.spyOn(gl, 'postMRComment').mockResolvedValue({});

    const verdict = {
      kind: 'mr' as const,
      event: { project_id: 1, mr_iid: 7 },
      verdict: {
        outcome: 'BLOCKED_FIX_AVAILABLE' as const,
        confidence: 99,
        accepted_findings: ['Critical boundary bug in token expiry check'],
        rejected_findings: [],
        accepted_arguments: [],
        rejected_arguments: [],
        summary: 'The expiry check misses the equality boundary and can accept expired tokens.',
        fix_description: 'Change > to >= in auth/jwt.ts',
        fix_code_changes: [
          {
            file_path: 'auth/jwt.ts',
            old_content: '>',
            new_content: '>='
          }
        ],
        actions: {
          block_mr: true,
          auto_approve: false,
          create_issue: true,
          issue_severity: 'critical' as const,
          generate_fix_mr: true,
          scan_codebase: false,
          create_epic: false,
          auto_merge: false
        }
      }
    };

    await handleWebhookEvent({
      object_kind: 'note',
      user: { username: 'shipsafe-bot' },
      project_id: 1,
      object_attributes: {
        action: 'create',
        note: `ShipSafe note\n${encodeVerdictMarker(verdict)}`
      },
      merge_request: { iid: 7 }
    });

    expect(setStatusSpy).toHaveBeenCalledWith(1, 7, 9, 'abc123', 'failed');
    expect(createIssueSpy).toHaveBeenCalledOnce();
    expect(createMrSpy).toHaveBeenCalledOnce();
  });

  it('ignores verdict notes from untrusted users', async () => {
    const { handleWebhookEvent } = await import('../src/orchestrator');
    const { gl } = await import('../src/gitlab/client');
    const getMrSpy = vi.spyOn(gl, 'getMR');

    await handleWebhookEvent({
      object_kind: 'note',
      user: { username: 'random-user' },
      project_id: 1,
      object_attributes: {
        action: 'create',
        note: `ShipSafe note\n${encodeVerdictMarker({
          kind: 'mr',
          event: { project_id: 1, mr_iid: 1 },
          verdict: {
            outcome: 'APPROVED',
            confidence: 90,
            accepted_findings: [],
            rejected_findings: [],
            accepted_arguments: [],
            rejected_arguments: [],
            summary: 'safe',
            actions: {
              block_mr: false,
              auto_approve: false,
              create_issue: false,
              issue_severity: 'low',
              generate_fix_mr: false,
              scan_codebase: false,
              create_epic: false,
              auto_merge: false
            }
          }
        })}`
      },
      merge_request: { iid: 1 }
    });

    expect(getMrSpy).not.toHaveBeenCalled();
  });

  it('falls back to the release control issue title when release_tag is omitted from the note envelope', async () => {
    const { handleWebhookEvent } = await import('../src/orchestrator');
    const { gl } = await import('../src/gitlab/client');

    vi.spyOn(gl, 'getRelease').mockResolvedValue(null);
    const createReleaseSpy = vi.spyOn(gl, 'createRelease').mockResolvedValue({});
    vi.spyOn(gl, 'postIssueComment').mockResolvedValue({});

    await handleWebhookEvent({
      object_kind: 'note',
      user: { username: 'shipsafe-bot' },
      project_id: 1,
      object_attributes: {
        action: 'create',
        note: `ShipSafe release note\n${encodeVerdictMarker({
          kind: 'release',
          event: { project_id: 1, issue_iid: 22 },
          verdict: {
            outcome: 'GO',
            confidence: 91,
            summary: 'Recent changes are ready to ship.',
            release_notes: '## Notes\n- Safe to release',
            blockers: []
          }
        })}`
      },
      issue: {
        iid: 22,
        title: '[ShipSafe Release Gate] v1.2.3'
      }
    });

    expect(createReleaseSpy).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        tag_name: 'v1.2.3'
      })
    );
  });
});
