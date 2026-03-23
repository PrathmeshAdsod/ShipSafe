import { getConfig, requireConfig } from '../config';
import { normalizeFlowName } from '../catalog/flow-metadata';
import {
  AdditionalContextItem,
  FlowKind,
  GitLabFlowStartInput,
  GitLabStatusCheck
} from '../types';
import { safeJsonParse } from '../utils/json';

interface FetchOptions extends RequestInit {
  expectJson?: boolean;
}

interface FlowCatalogNode {
  id: string;
  item: {
    name: string;
  };
}

const flowConsumerCache = new Map<string, number>();

function apiBase(): string {
  return `${getConfig().gitlabHost}/api/v4`;
}

function headers(extra?: RequestInit['headers']): Record<string, string> {
  const config = getConfig();
  const merged: Record<string, string> = {
    'Content-Type': 'application/json',
    'PRIVATE-TOKEN': requireConfig(config.gitlabToken, 'GITLAB_TOKEN')
  };

  if (!extra) {
    return merged;
  }

  if (Array.isArray(extra)) {
    for (const [key, value] of extra) {
      merged[key] = value;
    }
    return merged;
  }

  if (typeof Headers !== 'undefined' && extra instanceof Headers) {
    extra.forEach((value, key) => {
      merged[key] = value;
    });
    return merged;
  }

  for (const [key, value] of Object.entries(extra)) {
    if (typeof value === 'string') {
      merged[key] = value;
    }
  }

  return merged;
}

function buildQuery(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      search.set(key, String(value));
    }
  }

  const suffix = search.toString();
  return suffix ? `?${suffix}` : '';
}

async function glFetch<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const res = await fetch(`${apiBase()}${path}`, {
    ...options,
    headers: headers(options.headers)
  });

  const text = await res.text();
  const parsed = options.expectJson === false ? (text as T) : (safeJsonParse<T>(text) ?? (text as T));

  if (!res.ok) {
    console.error(`[gitlab] ${options.method || 'GET'} ${path} -> ${res.status}: ${text.slice(0, 400)}`);
    throw new Error(`GitLab API ${res.status} ${path}`);
  }

  return parsed;
}

function projectPath(projectId: string | number): string {
  return `/projects/${encodeURIComponent(String(projectId))}`;
}

export const gl = {
  async graphQL<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    const config = getConfig();
    const res = await fetch(`${config.gitlabHost}/api/graphql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${requireConfig(config.gitlabToken, 'GITLAB_TOKEN')}`
      },
      body: JSON.stringify({ query, variables })
    });
    const text = await res.text();
    const parsed = safeJsonParse<T>(text) ?? (text as T);

    if (!res.ok) {
      console.error(`[gitlab] POST /api/graphql -> ${res.status}: ${text.slice(0, 400)}`);
      throw new Error(`GitLab GraphQL ${res.status}`);
    }

    return parsed;
  },

  async getProject(projectId: string | number): Promise<any> {
    return glFetch(`${projectPath(projectId)}`);
  },

  async getMR(projectId: string | number, mrIid: number): Promise<any> {
    return glFetch(`${projectPath(projectId)}/merge_requests/${mrIid}`);
  },

  async getMRDiff(projectId: string | number, mrIid: number): Promise<any[]> {
    return glFetch(`${projectPath(projectId)}/merge_requests/${mrIid}/diffs`);
  },

  async getIssue(projectId: string | number, issueIid: number): Promise<any> {
    return glFetch(`${projectPath(projectId)}/issues/${issueIid}`);
  },

  async listIssues(projectId: string | number, params: Record<string, string | number | boolean | undefined> = {}): Promise<any[]> {
    return glFetch(`${projectPath(projectId)}/issues${buildQuery(params)}`);
  },

  async getFile(projectId: string | number, filePath: string, ref: string): Promise<string | null> {
    try {
      const encodedPath = encodeURIComponent(filePath);
      const data = await glFetch<{ content: string }>(
        `${projectPath(projectId)}/repository/files/${encodedPath}${buildQuery({ ref })}`
      );
      return Buffer.from(data.content, 'base64').toString('utf8');
    } catch {
      return null;
    }
  },

  async getFileTree(projectId: string | number, ref: string, recursive = true): Promise<any[]> {
    return glFetch(
      `${projectPath(projectId)}/repository/tree${buildQuery({ recursive, per_page: 100, ref })}`
    );
  },

  async listCommits(projectId: string | number, refName: string, perPage = 30): Promise<any[]> {
    return glFetch(`${projectPath(projectId)}/repository/commits${buildQuery({ ref_name: refName, per_page: perPage })}`);
  },

  async getCommitDiff(projectId: string | number, sha: string): Promise<any[]> {
    return glFetch(`${projectPath(projectId)}/repository/commits/${encodeURIComponent(sha)}/diff`);
  },

  async postMRComment(projectId: string | number, mrIid: number, body: string): Promise<any> {
    return glFetch(`${projectPath(projectId)}/merge_requests/${mrIid}/notes`, {
      method: 'POST',
      body: JSON.stringify({ body })
    });
  },

  async postIssueComment(projectId: string | number, issueIid: number, body: string): Promise<any> {
    return glFetch(`${projectPath(projectId)}/issues/${issueIid}/notes`, {
      method: 'POST',
      body: JSON.stringify({ body })
    });
  },

  async createIssue(
    projectId: string | number,
    params: {
      title: string;
      description: string;
      labels?: string;
      assignee_id?: number;
      confidential?: boolean;
    }
  ): Promise<any> {
    return glFetch(`${projectPath(projectId)}/issues`, {
      method: 'POST',
      body: JSON.stringify(params)
    });
  },

  async updateIssue(projectId: string | number, issueIid: number, params: Record<string, unknown>): Promise<any> {
    return glFetch(`${projectPath(projectId)}/issues/${issueIid}`, {
      method: 'PUT',
      body: JSON.stringify(params)
    });
  },

  async approveMR(projectId: string | number, mrIid: number): Promise<any> {
    return glFetch(`${projectPath(projectId)}/merge_requests/${mrIid}/approve`, {
      method: 'POST',
      body: JSON.stringify({})
    });
  },

  async unapproveMR(projectId: string | number, mrIid: number): Promise<any> {
    return glFetch(`${projectPath(projectId)}/merge_requests/${mrIid}/unapprove`, {
      method: 'POST',
      body: JSON.stringify({})
    });
  },

  async updateMR(projectId: string | number, mrIid: number, params: Record<string, unknown>): Promise<any> {
    return glFetch(`${projectPath(projectId)}/merge_requests/${mrIid}`, {
      method: 'PUT',
      body: JSON.stringify(params)
    });
  },

  async updateMRLabels(projectId: string | number, mrIid: number, addLabels: string[], removeLabels: string[] = []): Promise<any> {
    return gl.updateMR(projectId, mrIid, {
      add_labels: addLabels.join(','),
      remove_labels: removeLabels.join(',')
    });
  },

  async setReviewer(projectId: string | number, mrIid: number, reviewerIds: number[]): Promise<any> {
    return gl.updateMR(projectId, mrIid, { reviewer_ids: reviewerIds });
  },

  async createBranch(projectId: string | number, branch: string, ref: string): Promise<any> {
    return glFetch(`${projectPath(projectId)}/repository/branches`, {
      method: 'POST',
      body: JSON.stringify({ branch, ref })
    });
  },

  async createCommit(
    projectId: string | number,
    params: {
      branch: string;
      commit_message: string;
      actions: Array<{ action: string; file_path: string; content: string }>;
    }
  ): Promise<any> {
    return glFetch(`${projectPath(projectId)}/repository/commits`, {
      method: 'POST',
      body: JSON.stringify(params)
    });
  },

  async createMR(
    projectId: string | number,
    params: {
      source_branch: string;
      target_branch: string;
      title: string;
      description: string;
      remove_source_branch?: boolean;
    }
  ): Promise<any> {
    return glFetch(`${projectPath(projectId)}/merge_requests`, {
      method: 'POST',
      body: JSON.stringify(params)
    });
  },

  async getCODEOWNERS(projectId: string | number, ref: string): Promise<string | null> {
    const gitlabPath = await gl.getFile(projectId, '.gitlab/CODEOWNERS', ref);
    if (gitlabPath) {
      return gitlabPath;
    }

    return gl.getFile(projectId, 'CODEOWNERS', ref);
  },

  async writeFile(projectId: string | number, filePath: string, content: string, branch: string, commitMessage: string): Promise<any> {
    const encodedPath = encodeURIComponent(filePath);
    const existing = await fetch(`${apiBase()}${projectPath(projectId)}/repository/files/${encodedPath}${buildQuery({ ref: branch })}`, {
      headers: headers()
    });

    const method = existing.ok ? 'PUT' : 'POST';

    return glFetch(`${projectPath(projectId)}/repository/files/${encodedPath}`, {
      method,
      body: JSON.stringify({
        branch,
        content: Buffer.from(content, 'utf8').toString('base64'),
        encoding: 'base64',
        commit_message: commitMessage
      })
    });
  },

  async lookupFlowConsumerId(projectId: string | number, flowName: string): Promise<number> {
    const query = `
      query ConfiguredItems($projectId: ID!) {
        aiCatalogConfiguredItems(projectId: $projectId) {
          nodes {
            id
            item {
              name
            }
          }
        }
      }
    `;
    const response = await gl.graphQL<{ data?: { aiCatalogConfiguredItems?: { nodes?: FlowCatalogNode[] } }; errors?: Array<{ message: string }> }>(
      query,
      { projectId: `gid://gitlab/Project/${projectId}` }
    );

    if (response.errors?.length) {
      throw new Error(`GraphQL lookup failed: ${response.errors.map((error) => error.message).join(', ')}`);
    }

    const nodes = response.data?.aiCatalogConfiguredItems?.nodes ?? [];
    const expectedName = normalizeFlowName(flowName);
    const match = nodes.find((node) => normalizeFlowName(node.item.name || '') === expectedName);

    if (!match) {
      throw new Error(`Configured flow not found: ${flowName}`);
    }

    const suffix = match.id.split('/').pop();
    if (!suffix) {
      throw new Error(`Invalid consumer ID: ${match.id}`);
    }

    return Number.parseInt(suffix, 10);
  },

  async resolveFlowConsumerId(flowKind: FlowKind, projectId: string | number, flowName: string): Promise<number> {
    const cacheKey = `${String(projectId)}:${flowKind}:${normalizeFlowName(flowName)}`;
    const fromConfig =
      flowKind === 'mr'
        ? getConfig().mrFlowConsumerId
        : flowKind === 'issue'
          ? getConfig().issueFlowConsumerId
          : getConfig().releaseFlowConsumerId;

    if (fromConfig) {
      flowConsumerCache.set(cacheKey, fromConfig);
      return fromConfig;
    }

    const cached = flowConsumerCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const resolved = await gl.lookupFlowConsumerId(projectId, flowName);
    flowConsumerCache.set(cacheKey, resolved);
    return resolved;
  },

  async startFlow(input: GitLabFlowStartInput): Promise<any> {
    const body: Record<string, unknown> = {
      project_id: String(input.projectId),
      ai_catalog_item_consumer_id: input.consumerId,
      workflow_definition: input.workflowDefinition,
      goal: input.goal,
      additional_context: input.additionalContext,
      allow_agent_to_request_user: false,
      environment: 'ambient',
      start_workflow: true
    };

    if (input.mergeRequestId !== undefined) {
      body.merge_request_id = input.mergeRequestId;
    }

    if (input.issueId !== undefined) {
      body.issue_id = input.issueId;
    }

    if (input.sourceBranch) {
      body.source_branch = input.sourceBranch;
    }

    return glFetch('/ai/duo_workflows/workflows', {
      method: 'POST',
      body: JSON.stringify(body)
    });
  },

  async listExternalStatusChecks(projectId: string | number, mrIid: number): Promise<GitLabStatusCheck[]> {
    return glFetch(`${projectPath(projectId)}/merge_requests/${mrIid}/status_checks`);
  },

  async setExternalStatusCheck(
    projectId: string | number,
    mrIid: number,
    statusCheckId: number,
    sha: string,
    status: GitLabStatusCheck['status']
  ): Promise<any> {
    return glFetch(`${projectPath(projectId)}/merge_requests/${mrIid}/status_check_responses`, {
      method: 'POST',
      body: JSON.stringify({
        sha,
        external_status_check_id: statusCheckId,
        status
      })
    });
  },

  async createLabel(projectId: string | number, name: string, color: string, description?: string): Promise<any> {
    return glFetch(`${projectPath(projectId)}/labels`, {
      method: 'POST',
      body: JSON.stringify({ name, color, description })
    });
  },

  async listLabels(projectId: string | number): Promise<any[]> {
    return glFetch(`${projectPath(projectId)}/labels`);
  },

  async getRelease(projectId: string | number, tagName: string): Promise<any | null> {
    try {
      return await glFetch(`${projectPath(projectId)}/releases/${encodeURIComponent(tagName)}`);
    } catch {
      return null;
    }
  },

  async createRelease(
    projectId: string | number,
    params: { tag_name: string; ref?: string; name?: string; description: string }
  ): Promise<any> {
    return glFetch(`${projectPath(projectId)}/releases`, {
      method: 'POST',
      body: JSON.stringify(params)
    });
  },

  async updateRelease(projectId: string | number, tagName: string, params: { name?: string; description: string }): Promise<any> {
    return glFetch(`${projectPath(projectId)}/releases/${encodeURIComponent(tagName)}`, {
      method: 'PUT',
      body: JSON.stringify(params)
    });
  }
};

export function buildAdditionalContext(category: string, content: unknown): AdditionalContextItem {
  return {
    Category: category,
    Content: typeof content === 'string' ? content : JSON.stringify(content)
  };
}
