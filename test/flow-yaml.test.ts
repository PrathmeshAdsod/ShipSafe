import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

function readFlow(relativePath: string): string {
  return readFileSync(path.resolve(process.cwd(), relativePath), 'utf8');
}

describe('flow yaml contracts', () => {
  it('keeps the MR note builder aligned with the verdict envelope contract', () => {
    const content = readFlow('.gitlab/duo/flows/shipsafe-mr-review.yaml');

    expect(content).toContain('<!-- shipsafe-verdict:v1:{...json...} -->');
    expect(content).toContain('"kind": "mr"');
    expect(content).toContain('"mr_iid": <merge_request_iid>');
    expect(content).toContain('"verdict": <the parsed verdict_json object exactly as provided>');
  });

  it('keeps the issue note builder aligned with the verdict envelope contract', () => {
    const content = readFlow('.gitlab/duo/flows/shipsafe-issue-triage.yaml');

    expect(content).toContain('<!-- shipsafe-verdict:v1:{...json...} -->');
    expect(content).toContain('"kind": "issue"');
    expect(content).toContain('"issue_iid": <issue_iid>');
    expect(content).toContain('"verdict": <the parsed verdict_json object exactly as provided>');
  });

  it('keeps the release note builder aligned with the verdict envelope contract', () => {
    const content = readFlow('.gitlab/duo/flows/shipsafe-release-gate.yaml');

    expect(content).toContain('<!-- shipsafe-verdict:v1:{...json...} -->');
    expect(content).toContain('"kind": "release"');
    expect(content).toContain('"issue_iid": <issue_iid>');
    expect(content).toContain('"release_tag": "<exact tag when known>"');
    expect(content).toContain('omit release_tag instead of guessing');
  });
});
