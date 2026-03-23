import {
  IssueDebateVerdict,
  PragmatistVerdict,
  ReleaseDebateVerdict,
  VerdictEnvelope
} from '../types';
import { attachVerdictMarker } from '../utils/verdict-marker';

export function buildMrReviewStartedComment(): string {
  return [
    'ShipSafe is reviewing this merge request now.',
    '',
    'Bad code is being checked for real blockers, issue creation, and auto-fix eligibility.'
  ].join('\n');
}

export function buildIssueReviewStartedComment(): string {
  return [
    'ShipSafe is challenging this issue now.',
    '',
    'The goal is to decide whether the work is ready for development or needs clarification.'
  ].join('\n');
}

export function buildReleaseReviewStartedComment(tagName: string): string {
  return [
    `ShipSafe is challenging release \`${tagName}\` now.`,
    '',
    'Recent commits, open high-priority issues, and verdict memory are being reviewed before this release is treated as safe.'
  ].join('\n');
}

export function buildMrVerdictNote(envelope: VerdictEnvelope, verdict: PragmatistVerdict): string {
  const lines = [
    `## ShipSafe Verdict: ${verdict.outcome.replace(/_/g, ' ')}`,
    '',
    `**Confidence:** ${verdict.confidence}%`,
    '',
    verdict.summary,
    '',
    verdict.accepted_findings.length
      ? `**Accepted findings**\n${verdict.accepted_findings.map((finding) => `- ${finding}`).join('\n')}`
      : '**Accepted findings**\n- No blocking finding accepted.',
    '',
    verdict.actions.generate_fix_mr
      ? `**Auto-fix**\n- Fix MR generation requested: ${verdict.fix_description ?? 'A minimal fix patch is included in the verdict.'}`
      : '**Auto-fix**\n- No fix MR requested.'
  ];

  return attachVerdictMarker(lines.join('\n'), envelope);
}

export function buildIssueVerdictNote(envelope: VerdictEnvelope, verdict: IssueDebateVerdict): string {
  const lines = [
    `## ShipSafe Verdict: ${verdict.outcome.replace(/_/g, ' ')}`,
    '',
    `**Confidence:** ${verdict.confidence}%`,
    '',
    verdict.summary,
    '',
    `**Complexity:** ${verdict.complexity}`,
    '',
    verdict.gaps.length ? verdict.gaps.map((gap) => `- ${gap}`).join('\n') : '- No critical gaps.'
  ];

  return attachVerdictMarker(lines.join('\n'), envelope);
}

export function buildReleaseVerdictNote(envelope: VerdictEnvelope, verdict: ReleaseDebateVerdict): string {
  const lines = [
    `## ShipSafe Release Verdict: ${verdict.outcome}`,
    '',
    `**Confidence:** ${verdict.confidence}%`,
    '',
    verdict.summary,
    '',
    verdict.blockers.length
      ? `**Blockers**\n${verdict.blockers.map((blocker) => `- ${blocker}`).join('\n')}`
      : '**Blockers**\n- No release blockers identified.',
    '',
    `**Release notes draft**\n${verdict.release_notes}`
  ];

  return attachVerdictMarker(lines.join('\n'), envelope);
}

export function buildAutoFixFailureComment(): string {
  return 'ShipSafe detected bad code and blocked the merge, but auto-fix generation failed. Manual remediation is required.';
}
