import { beforeEach, describe, expect, it, vi } from 'vitest';
import { gl } from '../src/gitlab/client';
import { getVerdictHistory } from '../src/memory/retriever';
import { storeVerdict } from '../src/memory/store';

describe('memory store', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.ENABLE_MEMORY = 'true';
    process.env.GITLAB_PROJECT_ID = '5';
    process.env.GITLAB_DEFAULT_BRANCH = 'main';
  });

  it('stores and retrieves verdict history', async () => {
    vi.spyOn(gl, 'getFile').mockResolvedValue('{}');
    const writeSpy = vi.spyOn(gl, 'writeFile').mockResolvedValue({});

    await storeVerdict(
      ['auth/jwt.ts'],
      {
        outcome: 'REQUEST_CHANGES',
        summary: 'Boundary bug detected',
        accepted_findings: ['Off-by-one in token expiration check']
      },
      22,
      5,
      'main'
    );

    expect(writeSpy).toHaveBeenCalledOnce();
    const writtenJson = JSON.parse(String(writeSpy.mock.calls[0][2]));
    expect(writtenJson['auth/jwt.ts'].verdicts[0].outcome).toBe('REQUEST_CHANGES');

    vi.spyOn(gl, 'getFile').mockResolvedValue(JSON.stringify(writtenJson));
    const history = await getVerdictHistory(['auth/jwt.ts'], 5, 'main');
    expect(history).toContain('Boundary bug detected');
  });
});
