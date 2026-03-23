import dotenv from 'dotenv';
import { defaultFlowName } from './catalog/flow-metadata';

dotenv.config();

export interface AppConfig {
  gitlabToken: string;
  gitlabWebhookSecret: string;
  gitlabStatusCheckSharedSecret?: string;
  gitlabProjectId?: string;
  gitlabGroupId?: string;
  gitlabHost: string;
  gitlabDefaultBranch?: string;
  port: number;
  enableMrBlocking: boolean;
  enableIssueCreation: boolean;
  enableFixMr: boolean;
  enableAutoApprove: boolean;
  enableAutoMerge: boolean;
  enableMemory: boolean;
  enableCodebaseScan: boolean;
  enablePlatformTriggerBridge: boolean;
  enableStatusChecks: boolean;
  mrFlowConsumerId?: number;
  issueFlowConsumerId?: number;
  releaseFlowConsumerId?: number;
  mrFlowName: string;
  issueFlowName: string;
  releaseFlowName: string;
  flowServiceUsers: string[];
  flowReviewerId?: number;
  externalStatusCheckName: string;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') {
    return fallback;
  }

  return value.toLowerCase() === 'true';
}

function parseNumber(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function parseCsv(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function getConfig(): AppConfig {
  return {
    gitlabToken: process.env.GITLAB_TOKEN ?? '',
    gitlabWebhookSecret: process.env.GITLAB_WEBHOOK_SECRET ?? '',
    gitlabStatusCheckSharedSecret: process.env.GITLAB_STATUS_CHECK_SHARED_SECRET || undefined,
    gitlabProjectId: process.env.GITLAB_PROJECT_ID || undefined,
    gitlabGroupId: process.env.GITLAB_GROUP_ID || undefined,
    gitlabHost: (process.env.GITLAB_HOST || 'https://gitlab.com').replace(/\/+$/, ''),
    gitlabDefaultBranch: process.env.GITLAB_DEFAULT_BRANCH || undefined,
    port: parseNumber(process.env.PORT) ?? 3000,
    enableMrBlocking: parseBoolean(process.env.ENABLE_MR_BLOCKING, true),
    enableIssueCreation: parseBoolean(process.env.ENABLE_ISSUE_CREATION, true),
    enableFixMr: parseBoolean(process.env.ENABLE_FIX_MR, true),
    enableAutoApprove: parseBoolean(process.env.ENABLE_AUTO_APPROVE, false),
    enableAutoMerge: parseBoolean(process.env.ENABLE_AUTO_MERGE, false),
    enableMemory: parseBoolean(process.env.ENABLE_MEMORY, true),
    enableCodebaseScan: parseBoolean(process.env.ENABLE_CODEBASE_SCAN, true),
    enablePlatformTriggerBridge: parseBoolean(process.env.ENABLE_PLATFORM_TRIGGER_BRIDGE, false),
    enableStatusChecks: parseBoolean(process.env.ENABLE_STATUS_CHECKS, true),
    mrFlowConsumerId: parseNumber(process.env.GITLAB_MR_FLOW_CONSUMER_ID),
    issueFlowConsumerId: parseNumber(process.env.GITLAB_ISSUE_FLOW_CONSUMER_ID),
    releaseFlowConsumerId: parseNumber(process.env.GITLAB_RELEASE_FLOW_CONSUMER_ID),
    mrFlowName: process.env.SHIPSAFE_MR_FLOW_NAME || defaultFlowName('mr'),
    issueFlowName: process.env.SHIPSAFE_ISSUE_FLOW_NAME || defaultFlowName('issue'),
    releaseFlowName: process.env.SHIPSAFE_RELEASE_FLOW_NAME || defaultFlowName('release'),
    flowServiceUsers: parseCsv(process.env.SHIPSAFE_FLOW_SERVICE_USERS),
    flowReviewerId: parseNumber(process.env.SHIPSAFE_FLOW_REVIEWER_ID),
    externalStatusCheckName: process.env.SHIPSAFE_EXTERNAL_STATUS_CHECK_NAME || 'ShipSafe'
  };
}

export function requireConfig(value: string | undefined, label: string): string {
  if (!value) {
    throw new Error(`Missing required configuration: ${label}`);
  }

  return value;
}
