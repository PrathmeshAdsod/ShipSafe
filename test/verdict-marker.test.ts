import { describe, expect, it } from 'vitest';
import { encodeVerdictMarker, decodeVerdictMarker, isTrustedFlowUser } from '../src/utils/verdict-marker';
import { VerdictEnvelope } from '../src/types';

describe('verdict marker', () => {
  it('encodes and decodes a base64 marker', () => {
    const envelope: VerdictEnvelope = {
      kind: 'mr',
      event: {
        project_id: 7,
        mr_iid: 11
      },
      verdict: {
        outcome: 'APPROVED',
        confidence: 97,
        accepted_findings: [],
        rejected_findings: [],
        accepted_arguments: ['Looks good'],
        rejected_arguments: [],
        summary: 'Safe to merge.',
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
    };

    const decoded = decodeVerdictMarker(`note\n${encodeVerdictMarker(envelope)}`);
    expect(decoded).toEqual(envelope);
  });

  it('supports raw json markers as a fallback transport', () => {
    const note = '<!-- shipsafe-verdict:v1:{"kind":"issue","event":{"project_id":7,"issue_iid":9},"verdict":{"outcome":"READY_FOR_DEVELOPMENT","confidence":88,"summary":"Clear enough","complexity":"LOW","gaps":[],"duplicate_candidates":[]}} -->';
    const decoded = decodeVerdictMarker(note);

    expect(decoded?.kind).toBe('issue');
    expect(decoded?.event.issue_iid).toBe(9);
  });

  it('validates trusted flow usernames case-insensitively', () => {
    expect(isTrustedFlowUser('ShipSafe-Bot', ['shipsafe-bot'])).toBe(true);
    expect(isTrustedFlowUser('someone-else', ['shipsafe-bot'])).toBe(false);
  });
});
