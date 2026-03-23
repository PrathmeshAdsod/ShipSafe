import { beforeEach, describe, expect, it, vi } from 'vitest';
import { gl } from '../src/gitlab/client';
import { generateFixMR } from '../src/execution/fix-generator';

describe('fix generator', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns null when the expected old content does not match', async () => {
    vi.spyOn(gl, 'getFile').mockResolvedValue('const value = 1;');

    const result = await generateFixMR({
      projectId: 1,
      mrIid: 2,
      sourceBranch: 'feature/test',
      targetBranch: 'main',
      fixCodeChanges: [
        {
          file_path: 'src/file.ts',
          old_content: 'const value = 2;',
          new_content: 'const value = 3;'
        }
      ],
      fixDescription: 'Fix mismatch',
      verdictSummary: 'Mismatch',
      issueIid: null
    });

    expect(result).toBeNull();
  });

  it('creates a fix MR from the MR source branch on success', async () => {
    vi.spyOn(gl, 'getFile').mockResolvedValue('if (payload.exp > Date.now() / 1000) {');
    vi.spyOn(gl, 'createBranch').mockResolvedValue({});
    vi.spyOn(gl, 'createCommit').mockResolvedValue({});
    const createMrSpy = vi.spyOn(gl, 'createMR').mockResolvedValue({ iid: 44 });
    vi.spyOn(gl, 'postMRComment').mockResolvedValue({});

    const result = await generateFixMR({
      projectId: 1,
      mrIid: 2,
      sourceBranch: 'feature/test',
      targetBranch: 'main',
      fixCodeChanges: [
        {
          file_path: 'auth/jwt.ts',
          old_content: 'payload.exp > Date.now() / 1000',
          new_content: 'payload.exp >= Date.now() / 1000'
        }
      ],
      fixDescription: 'Fix off-by-one',
      verdictSummary: 'Boundary bug',
      issueIid: 9
    });

    expect(result).toBe(44);
    expect(createMrSpy).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        source_branch: expect.stringContaining('shipsafe/fix-mr-2-'),
        target_branch: 'main'
      })
    );
  });

  it('returns null when old_content is ambiguous within the file', async () => {
    vi.spyOn(gl, 'getFile').mockResolvedValue('const x = 1;\nconst x = 1;\n');

    const result = await generateFixMR({
      projectId: 1,
      mrIid: 2,
      sourceBranch: 'feature/test',
      targetBranch: 'main',
      fixCodeChanges: [
        {
          file_path: 'src/file.ts',
          old_content: 'const x = 1;',
          new_content: 'const x = 2;'
        }
      ],
      fixDescription: 'Avoid ambiguous patching',
      verdictSummary: 'Ambiguous content',
      issueIid: null
    });

    expect(result).toBeNull();
  });
});
