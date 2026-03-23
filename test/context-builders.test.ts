import { beforeEach, describe, expect, it, vi } from 'vitest';
import { gl } from '../src/gitlab/client';
import { buildIssueContext } from '../src/context/issue-builder';
import { buildMRContext } from '../src/context/mr-builder';
import { buildReleaseContext } from '../src/context/release-builder';

vi.mock('../src/memory/retriever', () => ({
  getVerdictHistory: vi.fn().mockResolvedValue('history')
}));

describe('context builders', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('builds MR context with diff, files, imports, and linked issue', async () => {
    vi.spyOn(gl, 'getMR').mockResolvedValue({
      title: 'Fix auth expiration',
      description: 'Closes #42',
      source_branch: 'feature/auth',
      target_branch: 'main',
      author: { username: 'dev1' },
      sha: 'abc123'
    });
    vi.spyOn(gl, 'getProject').mockResolvedValue({ default_branch: 'main' });
    vi.spyOn(gl, 'getMRDiff').mockResolvedValue([
      {
        new_path: 'auth/jwt.ts',
        new_file: false,
        diff: "@@ -1,3 +1,3 @@\n-if (payload.exp > Date.now() / 1000) {\n+if (payload.exp >= Date.now() / 1000) {"
      }
    ]);
    vi.spyOn(gl, 'getCODEOWNERS').mockResolvedValue('* @security-team');
    vi.spyOn(gl, 'getFile').mockImplementation(async (_project, file) => {
      if (file === 'auth/jwt.ts') {
        return "import { helper } from './helper';\nexport function isValid(payload: { exp: number }) {\n  return payload.exp > Date.now() / 1000;\n}";
      }

      if (file === 'auth/helper.ts') {
        return 'export function helper() {}';
      }

      return null;
    });
    vi.spyOn(gl, 'getIssue').mockResolvedValue({ description: 'JWT token bug details' });

    const context = await buildMRContext({
      project: { id: 1, default_branch: 'main' },
      object_attributes: { iid: 8 }
    });

    expect(context.changed_files).toEqual(['auth/jwt.ts']);
    expect(context.file_contents['auth/jwt.ts']).toContain('payload.exp');
    expect(context.import_signatures['auth/helper.ts']).toContain('export function helper');
    expect(context.linked_issue).toContain('JWT token bug details');
  });

  it('builds issue context from keyword-matched files and similar issues', async () => {
    vi.spyOn(gl, 'getIssue').mockResolvedValue({
      title: 'Improve payment retry flow',
      description: 'The payment retry should be more resilient.'
    });
    vi.spyOn(gl, 'getProject').mockResolvedValue({ default_branch: 'main' });
    vi.spyOn(gl, 'getFileTree').mockResolvedValue([
      { path: 'payments/retry.ts' },
      { path: 'auth/jwt.ts' }
    ]);
    vi.spyOn(gl, 'getFile').mockResolvedValue('export function retryPayment() {}\nexport const PAYMENT_LIMIT = 3;');
    vi.spyOn(gl, 'listIssues').mockResolvedValue([
      { iid: 14, title: 'Improve payment retries', state: 'opened' }
    ]);

    const context = await buildIssueContext({
      project: { id: 1, default_branch: 'main' },
      object_attributes: { iid: 9 }
    });

    expect(context.candidate_files).toEqual(['payments/retry.ts']);
    expect(context.file_signatures['payments/retry.ts']).toContain('export function retryPayment');
    expect(context.similar_issues[0]?.iid).toBe(14);
  });

  it('builds release context from commits, touched files, and high priority issues', async () => {
    vi.spyOn(gl, 'getProject').mockResolvedValue({ default_branch: 'main' });
    vi.spyOn(gl, 'listCommits').mockResolvedValue([
      { id: 'c1', title: 'Patch auth' },
      { id: 'c2', title: 'Add tests' }
    ]);
    vi.spyOn(gl, 'getCommitDiff').mockImplementation(async (_project, sha) => {
      if (sha === 'c1') {
        return [{ new_path: 'auth/jwt.ts' }];
      }

      return [{ new_path: 'test/auth.test.ts' }];
    });
    vi.spyOn(gl, 'listIssues').mockResolvedValue([
      { iid: 1, title: 'Critical prod outage', labels: ['severity::critical'] },
      { iid: 2, title: 'Medium polish task', labels: ['severity::medium'] }
    ]);

    const context = await buildReleaseContext(
      {
        project: { id: 1, default_branch: 'main' },
        ref: 'refs/tags/v1.2.3',
        message: 'release notes'
      },
      55
    );

    expect(context.tag_name).toBe('v1.2.3');
    expect(context.touched_files).toContain('auth/jwt.ts');
    expect(context.high_priority_issues).toEqual([{ iid: 1, title: 'Critical prod outage' }]);
  });
});
