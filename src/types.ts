export type Severity = 'critical' | 'high' | 'medium' | 'low';
export type FixComplexity = 'LOW' | 'MEDIUM' | 'HIGH' | 'ARCHITECTURAL';
export type FlowKind = 'mr' | 'issue' | 'release';
export type ExternalStatus = 'pending' | 'passed' | 'failed';

export interface AdditionalContextItem {
  Category: string;
  Content: string;
}

export interface FixCodeChange {
  file_path: string;
  old_content: string;
  new_content: string;
}

export interface DefenderArgument {
  strength: 'HIGH' | 'MEDIUM' | 'LOW';
  claim: string;
  evidence?: string;
  counters_concern?: string;
}

export interface DefenderOutput {
  position: 'APPROVE';
  confidence: number;
  arguments: DefenderArgument[];
  acknowledged_risks?: string[];
  suggested_tests?: string[];
  overall_assessment?: string;
}

export interface SkepticFinding {
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  type: 'SECURITY' | 'LOGIC' | 'CONCURRENCY' | 'RELIABILITY' | 'PERFORMANCE' | 'ARCHITECTURE' | 'COVERAGE';
  location: string;
  description: string;
  exploit_scenario?: string;
  fix_complexity: FixComplexity;
  suggested_fix?: string;
}

export interface SkepticOutput {
  position: 'BLOCK' | 'REQUEST_CHANGES';
  confidence: number;
  findings: SkepticFinding[];
  pattern_concern?: boolean;
  systemic?: boolean;
  overall_assessment?: string;
}

export interface VerdictActions {
  block_mr: boolean;
  auto_approve: boolean;
  create_issue: boolean;
  issue_severity: Severity;
  generate_fix_mr: boolean;
  scan_codebase: boolean;
  create_epic: boolean;
  auto_merge: boolean;
  assignee_hint?: string;
}

export interface PragmatistVerdict {
  outcome: 'APPROVED' | 'APPROVED_WITH_NOTES' | 'REQUEST_CHANGES' | 'BLOCKED_FIX_AVAILABLE' | 'BLOCKED_ARCHITECTURAL';
  confidence: number;
  accepted_findings: string[];
  rejected_findings: Array<{ finding: string; reason: string }>;
  accepted_arguments: string[];
  rejected_arguments: Array<{ argument: string; reason: string }>;
  summary: string;
  fix_description?: string;
  fix_code_changes?: FixCodeChange[];
  actions: VerdictActions;
}

export interface IssueDebateVerdict {
  outcome: 'READY_FOR_DEVELOPMENT' | 'NEEDS_CLARIFICATION';
  confidence: number;
  summary: string;
  complexity: 'LOW' | 'MEDIUM' | 'HIGH';
  gaps: string[];
  duplicate_candidates: string[];
}

export interface ReleaseDebateVerdict {
  outcome: 'GO' | 'NO_GO';
  confidence: number;
  summary: string;
  release_notes: string;
  blockers: string[];
}

export interface VerdictEnvelope {
  kind: FlowKind;
  event: {
    project_id: string | number;
    mr_iid?: number;
    issue_iid?: number;
    release_tag?: string;
  };
  verdict: PragmatistVerdict | IssueDebateVerdict | ReleaseDebateVerdict;
}

export interface VerdictHistoryEntry {
  outcome: string;
  summary: string;
  timestamp: string;
  mr_iid: number;
  key_findings: string[];
}

export interface VerdictStore {
  [filePath: string]: {
    verdicts: VerdictHistoryEntry[];
  };
}

export interface MRContext {
  project_id: string | number;
  mr_iid: number;
  diff: string;
  mr_title: string;
  mr_description: string;
  target_branch: string;
  source_branch: string;
  author: string;
  sha: string;
  changed_files: string[];
  file_contents: Record<string, string>;
  import_signatures: Record<string, string>;
  codeowners: string;
  verdict_history: string;
  linked_issue: string | null;
}

export interface IssueContext {
  project_id: string | number;
  issue_iid: number;
  title: string;
  description: string;
  candidate_files: string[];
  file_signatures: Record<string, string>;
  similar_issues: Array<{ iid: number; title: string; state: string }>;
}

export interface ReleaseContext {
  project_id: string | number;
  tag_name: string;
  ref: string;
  tag_message: string;
  release_issue_iid: number;
  commits: Array<{ id: string; title?: string; message?: string }>;
  high_priority_issues: Array<{ iid: number; title: string }>;
  touched_files: string[];
  verdict_history: string;
}

export interface MergeRequestHookEvent {
  object_kind: 'merge_request';
  project?: { id: number; default_branch?: string; path_with_namespace?: string };
  object_attributes?: {
    iid?: number;
    action?: string;
    oldrev?: string;
    source_branch?: string;
    target_branch?: string;
    last_commit?: { id?: string };
    title?: string;
    description?: string;
    draft?: boolean;
  };
  changes?: Record<string, unknown>;
}

export interface IssueHookEvent {
  object_kind: 'issue';
  project?: { id: number; default_branch?: string };
  object_attributes?: {
    iid?: number;
    action?: string;
    title?: string;
    description?: string;
  };
}

export interface TagPushHookEvent {
  object_kind: 'tag_push';
  project?: { id: number; default_branch?: string };
  ref?: string;
  message?: string;
  checkout_sha?: string;
}

export interface NoteHookEvent {
  object_kind: 'note';
  project_id?: number;
  project?: { id: number };
  user?: { username?: string };
  object_attributes?: {
    note?: string;
    noteable_type?: string;
    action?: string;
  };
  merge_request?: { iid?: number; title?: string; target_branch?: string; source_branch?: string };
  issue?: { iid?: number; title?: string };
}

export interface GitLabFlowStartInput {
  projectId: string | number;
  consumerId?: number;
  workflowDefinition?: string;
  goal: string;
  additionalContext: AdditionalContextItem[];
  mergeRequestId?: number;
  issueId?: number;
  sourceBranch?: string;
}

export interface GitLabStatusCheck {
  id: number;
  name: string;
  status: ExternalStatus;
  external_url: string;
}
