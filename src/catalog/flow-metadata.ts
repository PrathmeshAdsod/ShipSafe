import { FlowKind } from '../types';

export interface FlowProjectMetadata {
  kind: FlowKind;
  slug: string;
  defaultName: string;
  description: string;
  definitionPath: string;
}

export const FLOW_PROJECTS: Record<FlowKind, FlowProjectMetadata> = {
  mr: {
    kind: 'mr',
    slug: 'shipsafe-mr-review',
    defaultName: 'ShipSafe MR Review',
    description: 'ShipSafe flow for merge request review, blocking, and auto-fix decisions',
    definitionPath: '.gitlab/duo/flows/shipsafe-mr-review.yaml'
  },
  issue: {
    kind: 'issue',
    slug: 'shipsafe-issue-triage',
    defaultName: 'ShipSafe Issue Triage',
    description: 'ShipSafe flow for issue readiness checks and clarification decisions',
    definitionPath: '.gitlab/duo/flows/shipsafe-issue-triage.yaml'
  },
  release: {
    kind: 'release',
    slug: 'shipsafe-release-gate',
    defaultName: 'ShipSafe Release Gate',
    description: 'ShipSafe flow for release go or no-go decisions and release note generation',
    definitionPath: '.gitlab/duo/flows/shipsafe-release-gate.yaml'
  }
};

export function defaultFlowName(kind: FlowKind): string {
  return FLOW_PROJECTS[kind].defaultName;
}

export function normalizeFlowName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function listFlowProjects(): FlowProjectMetadata[] {
  return Object.values(FLOW_PROJECTS);
}
