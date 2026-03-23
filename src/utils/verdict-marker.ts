import { FlowKind, VerdictEnvelope } from '../types';

export const VERDICT_MARKER_PREFIX = 'shipsafe-verdict:v1:';

export function encodeVerdictMarker(envelope: VerdictEnvelope): string {
  const encoded = Buffer.from(JSON.stringify(envelope), 'utf8').toString('base64');
  return `<!-- ${VERDICT_MARKER_PREFIX}${encoded} -->`;
}

export function attachVerdictMarker(body: string, envelope: VerdictEnvelope): string {
  return `${body.trim()}\n\n${encodeVerdictMarker(envelope)}`;
}

function decodeBase64Payload(payload: string): VerdictEnvelope | null {
  try {
    return JSON.parse(Buffer.from(payload, 'base64').toString('utf8')) as VerdictEnvelope;
  } catch {
    return null;
  }
}

function decodeRawJsonPayload(payload: string): VerdictEnvelope | null {
  try {
    return JSON.parse(payload) as VerdictEnvelope;
  } catch {
    return null;
  }
}

export function decodeVerdictMarker(note: string): VerdictEnvelope | null {
  const regex = /<!--\s*shipsafe-verdict:v1:(.*?)\s*-->/s;
  const match = note.match(regex);

  if (!match) {
    return null;
  }

  const payload = match[1].trim();
  return decodeBase64Payload(payload) ?? decodeRawJsonPayload(payload);
}

export function isTrustedFlowUser(username: string | undefined, allowedUsers: string[]): boolean {
  if (!username) {
    return false;
  }

  return allowedUsers.some((allowed) => allowed.toLowerCase() === username.toLowerCase());
}

export function isVerdictKind(kind: string | undefined): kind is FlowKind {
  return kind === 'mr' || kind === 'issue' || kind === 'release';
}
