# ShipSafe Architecture

ShipSafe is a GitLab-integrated review and remediation system. It watches project events, starts GitLab Duo custom flows for the AI reasoning, receives machine-readable verdicts back through trusted note webhooks, and turns those verdicts into real GitLab actions.

The product promise is simple:

- bad code is detected
- the merge is blocked
- an issue is created
- a fix MR is generated automatically when the patch is small and exact

This document explains the full implementation, the moving parts, and the tradeoffs in the current codebase.

## 1. Product Goals

ShipSafe is built to solve a very specific problem: code review is often too dependent on one reviewer’s perspective. If that reviewer misses a security bug, logic edge case, or boundary failure, production inherits the mistake.

ShipSafe changes that by splitting review into three opposing roles:

- Defender: finds the strongest honest case that the change is safe
- Skeptic: hunts for the strongest reasons the change should not merge
- Pragmatist: evaluates both and produces the final verdict

The system is designed around outcomes, not commentary. The important result is not “three agents debated.” The important result is that risky code is blocked and fixable defects are turned into real GitLab work items automatically.

## 2. High-Level Architecture

ShipSafe has two major layers:

1. GitLab Duo reasoning layer
   - lives in `.gitlab/duo/flows/`
   - uses GitLab Duo custom flows for MR, issue, and release analysis
   - produces a human-readable note plus a hidden machine-readable verdict marker

2. ShipSafe execution layer
   - lives in `src/`
   - receives GitLab webhooks
   - launches flows through the GitLab Flows API
   - validates verdict notes
   - performs GitLab REST and GraphQL actions
   - updates external status checks, issues, labels, releases, and memory

The key design choice is that AI reasoning and GitLab write-side execution are separated.

GitLab Duo decides.
ShipSafe acts.

## 3. Runtime Components

### 3.1 Express server

File: `src/server.ts`

The server exposes three endpoints:

- `GET /health`
  - simple liveness endpoint
- `POST /webhook`
  - primary entrypoint for GitLab project webhooks
  - merge request, issue, note, and tag push events arrive here
- `POST /status-checks/hook`
  - optional external status check callback endpoint
  - verifies GitLab's `X-Gitlab-Signature` HMAC when `GITLAB_STATUS_CHECK_SHARED_SECRET` is configured
  - does not launch a second MR review, which avoids duplicate flow runs

Both POST endpoints return `200` immediately and continue processing asynchronously. That avoids GitLab webhook timeouts.

### 3.2 Orchestrator

File: `src/orchestrator.ts`

This is the traffic controller for the product. It decides what kind of event arrived and which runtime path to execute.

It handles:

- MR open and meaningful MR update events
- issue open events
- tag push events
- note events from trusted ShipSafe flow service accounts

The orchestrator has two distinct responsibilities:

1. start analysis
2. consume verdicts

Those are separate because flows run asynchronously. ShipSafe cannot assume the result exists in the same request that started the review.

### 3.3 GitLab client

File: `src/gitlab/client.ts`

This is the integration layer for GitLab APIs. It wraps:

- REST API calls
- GraphQL lookups
- GitLab Flows API calls
- external status check responses

Important responsibilities:

- load merge requests, issues, diffs, files, labels, commits, releases
- create comments, labels, issues, branches, commits, and merge requests
- resolve enabled flow consumer IDs
- start flows through `POST /api/v4/ai/duo_workflows/workflows`
- post external status check results

The client uses:

- REST at `${GITLAB_HOST}/api/v4`
- GraphQL at `${GITLAB_HOST}/api/graphql`

### 3.4 Context builders

Files:

- `src/context/mr-builder.ts`
- `src/context/issue-builder.ts`
- `src/context/release-builder.ts`
- `src/context/file-selector.ts`

These modules create deterministic context packages before ShipSafe launches a flow. They do not call any model directly.

Their job is to turn noisy GitLab payloads into compact, review-ready context:

- MR builder:
  - MR metadata
  - formatted diff
  - changed files
  - small-file full contents
  - relative import signatures
  - CODEOWNERS
  - prior verdict memory
  - linked issue summary
- Issue builder:
  - issue title and description
  - candidate files from file tree keyword matching
  - compact file signatures
  - similar open issues
- Release builder:
  - tag name and message
  - recent commits
  - touched files
  - open high-priority issues
  - verdict memory for recently touched files

These builders feed two outputs into the flow launch:

- `goal`
  - a compact text instruction plus context bundle
- `additional_context`
  - structured metadata attached to the flow launch request

## 4. Flow Architecture

ShipSafe ships three custom flow files:

- `.gitlab/duo/flows/shipsafe-mr-review.yaml`
- `.gitlab/duo/flows/shipsafe-issue-triage.yaml`
- `.gitlab/duo/flows/shipsafe-release-gate.yaml`

Each flow uses Flow Registry v1 style components.

Important packaging note:

- these files are the canonical ShipSafe flow `definition` bodies
- GitLab officially supports custom flow definitions in `.gitlab/duo/`
- ShipSafe's current runtime still starts flows through the Flows API by `ai_catalog_item_consumer_id`, so the flows must exist as enabled catalog items in the project
- the template-based GitLab `Agents and Flows` publishing path packages flows in separate projects using `flows/flow.yml`
- those wrapper projects usually start from `flows/flow.yml.template`, which you then rename to `flows/flow.yml`
- optional reusable chat agents follow the same pattern with `agents/agent.yml.template` and `agents/agent.yml`
- when using that template path, ShipSafe's YAML from this repo belongs under the wrapper project's `definition:` key

### 4.1 MR flow

The MR flow performs:

1. post review-start note
2. Defender analysis
3. Skeptic analysis
4. Pragmatist verdict
5. note-builder transformation
6. final note post

The current flow design is sequential in YAML, but Defender and Skeptic still operate on the same source context and do not consume each other’s output. Pragmatist is the only role that sees both prior analyses.

### 4.2 Issue flow

The issue flow performs:

1. post triage-start note
2. readiness analysis
3. clarification analysis
4. final triage arbitration
5. note-builder transformation
6. final issue note post

This is designed to classify issues into:

- `READY_FOR_DEVELOPMENT`
- `NEEDS_CLARIFICATION`

### 4.3 Release flow

The release flow performs:

1. post release-review start note to the release-control issue
2. positive release summary
3. release risk analysis
4. release arbiter verdict
5. note-builder transformation
6. final note post

The release flow does not post directly onto the release object itself. Instead, it reports into a release-control issue, which gives ShipSafe a stable note target and a reliable webhook path for verdict consumption.

## 5. Why Verdict Notes Exist

A core design problem is that the flow result must come back into the execution layer in a way the server can trust and automate against.

ShipSafe solves that with hidden verdict markers embedded inside GitLab notes:

```html
<!-- shipsafe-verdict:v1:... -->
```

The note body is both:

- human-readable for maintainers
- machine-readable for ShipSafe

### 5.1 Verdict transport format

The server supports two encodings:

- base64-encoded JSON
- raw JSON fallback

The utility lives in `src/utils/verdict-marker.ts`.

The current flow YAML instructs the note-builder agent to embed the full ShipSafe verdict envelope as raw JSON directly in the hidden marker. That choice is deliberate: asking the model to reliably base64-encode large payloads is brittle. The server still supports base64 markers because that transport is cleaner if later flow behavior becomes reliable enough.

### 5.2 Trust boundary

ShipSafe only trusts verdict markers when the note author is in `SHIPSAFE_FLOW_SERVICE_USERS`.

That means a normal developer cannot trigger automatic blocking or fix generation simply by posting a hand-crafted hidden marker comment.

## 6. Event Flows

### 6.1 Merge request flow

The MR runtime is the center of the product.

Sequence:

1. GitLab sends MR webhook to `/webhook`
2. `src/orchestrator.ts` decides the event is actionable
3. `src/context/mr-builder.ts` builds deterministic context
4. ShipSafe posts an in-progress MR comment
5. ShipSafe sets the external status check to `pending`
6. ShipSafe resolves the enabled flow consumer ID
7. ShipSafe starts the MR flow through the Flows API
8. GitLab Duo runs Defender, Skeptic, Pragmatist, and note-builder
9. GitLab posts the verdict note to the MR
10. GitLab emits a note webhook
11. ShipSafe validates the note author and hidden verdict marker
12. `src/execution/engine.ts` applies the verdict:
    - fail or pass the status check
    - label the MR
    - create an issue if needed
    - create the fix branch, commit, and fix MR if possible
    - post backlink comments
13. `src/memory/store.ts` writes summarized verdict history to `memory/verdicts.json`

### 6.2 Issue flow

Sequence:

1. GitLab sends issue-open webhook
2. ShipSafe builds deterministic issue context
3. ShipSafe posts a triage-start note
4. ShipSafe starts the issue flow
5. Flow posts a verdict note on the same issue
6. ShipSafe validates the note and executes:
   - apply `shipsafe::ready` or `shipsafe::needs-clarification`
   - create up to 3 gap issues when clarification is required
   - post an execution summary

### 6.3 Release flow

Sequence:

1. GitLab sends tag-push webhook
2. ShipSafe creates or reuses a release-control issue
3. ShipSafe posts a review-start note to that issue
4. ShipSafe builds release context from commits, files, open issues, and memory
5. ShipSafe starts the release flow and attaches it to the release-control issue
6. Flow posts a verdict note on that issue
7. ShipSafe validates the note and executes:
   - `GO`: create or update the GitLab release description
   - `NO_GO`: create a blocker issue and mark the release description as blocked when a release already exists

## 7. Merge Blocking Strategy

ShipSafe uses GitLab external status checks as the real merge gate.

This is an important architectural choice.

Why not rely only on labels?

- labels are visible but not enforceable

Why not rely only on approvals?

- approvals are useful, but status checks are a cleaner explicit “pass/fail gate” for this product

### 7.1 Status check lifecycle

The helper lives in `src/execution/engine.ts` as `setStatusCheckState`.

ShipSafe sets the status check to:

- `pending` when review starts
- `failed` when the verdict blocks merge
- `passed` when the verdict approves merge

GitLab also sends merge request payloads to the configured external status check service. ShipSafe acknowledges those callbacks and verifies their HMAC signature, but it starts MR reviews from the main project webhook so the same MR does not trigger two parallel reviews.

If the project does not have the configured external status check present, ShipSafe logs a warning and continues with labels/comments. That means the product still works functionally, but the hard gate is not enforced until project setup is corrected.

## 8. Action Execution Layer

File: `src/execution/engine.ts`

This is the write-side authority for ShipSafe.

It contains three main entry points:

- `executeMergeRequestVerdict`
- `executeIssueVerdict`
- `executeReleaseVerdict`

### 8.1 MR action logic

For merge requests, ShipSafe can:

- fail or pass the external status check
- unapprove the MR
- apply `shipsafe` and approval/block labels
- create a severity issue
- open a fix MR
- add scan and architectural notes

### 8.2 Issue action logic

For issues, ShipSafe can:

- apply readiness labels
- create child issues for missing acceptance criteria
- post outcome notes

### 8.3 Release action logic

For releases, ShipSafe can:

- create or update the GitLab release description
- create blocker issues on `NO_GO`
- post the final execution summary to the release-control issue

## 9. Auto-Fix Architecture

File: `src/execution/fix-generator.ts`

This is the “killer feature” implementation.

ShipSafe expects the Pragmatist verdict to carry inline `fix_code_changes`, where each change includes:

- `file_path`
- `old_content`
- `new_content`

### 9.1 Safety model

The fix generator is conservative:

1. load current content from the MR source branch
2. verify that `old_content` exists exactly
3. replace only when the exact substring is present
4. skip any change that does not match exactly
5. abort fix MR creation if no valid changes remain

That protects against applying a patch to the wrong file state.

### 9.2 Branching strategy

ShipSafe creates the fix branch from the MR source branch, not the target branch. That is intentional.

Reason:

- the bug being fixed usually lives in the proposed MR branch
- creating from the target branch would often miss the exact buggy content the patch expects

The generated fix MR still targets the original target branch.

### 9.3 Failure handling

Every step is wrapped defensively:

- file load
- old-content match
- branch create
- commit create
- fix MR create
- backlink comments

If anything critical fails, ShipSafe posts a manual-fix fallback comment instead of crashing the overall debate flow.

## 10. Memory System

Files:

- `src/memory/store.ts`
- `src/memory/retriever.ts`
- `memory/verdicts.json`

ShipSafe keeps a lightweight memory system inside the repository itself.

Why this design:

- no external database
- auditable history
- easy to inspect in Git
- naturally versioned with the project

### 10.1 What gets stored

Per file path, ShipSafe stores a rolling window of verdict summaries:

- outcome
- summary
- timestamp
- MR IID
- key findings

### 10.2 How memory is used

During MR and release context construction, ShipSafe retrieves recent verdict summaries for the touched files. That gives later reviews a compact “what has gone wrong here before?” memory without requiring a separate storage service.

## 11. Configuration Model

File: `src/config.ts`

ShipSafe reads runtime config from environment variables. Important ones:

- `GITLAB_TOKEN`
- `GITLAB_WEBHOOK_SECRET`
- `GITLAB_PROJECT_ID`
- `GITLAB_GROUP_ID`
- `GITLAB_HOST`
- `GITLAB_DEFAULT_BRANCH`
- `SHIPSAFE_FLOW_SERVICE_USERS`
- `GITLAB_MR_FLOW_CONSUMER_ID`
- `GITLAB_ISSUE_FLOW_CONSUMER_ID`
- `GITLAB_RELEASE_FLOW_CONSUMER_ID`
- `SHIPSAFE_EXTERNAL_STATUS_CHECK_NAME`
- feature flags for blocking, fix MR creation, memory, and the optional reviewer bridge

### 11.1 Consumer ID resolution

Flow consumer IDs can be supplied directly, but they do not have to be.

If an env var is missing, ShipSafe:

1. queries `aiCatalogConfiguredItems` by GraphQL
2. finds the configured item by flow name
3. caches the resulting consumer ID in memory

That means local deployment is easier when the flow names are stable.

## 12. Security Model

ShipSafe’s main trust boundaries are:

- GitLab webhook secret validation at the HTTP layer
- trusted-service-user validation for verdict notes
- exact content matching for auto-fix patches
- explicit external status check lookup by name

Important security behaviors:

- user-authored notes are ignored, even if they contain a valid-looking verdict marker
- invalid JSON markers are ignored
- unknown status checks do not trigger blind writes
- fix patches are never applied when `old_content` does not match exactly

## 13. Failure Handling Philosophy

ShipSafe is designed to fail soft, not fail blind.

Examples:

- if a flow fails to start:
  - ShipSafe posts a visible failure note
  - MR status is failed when possible
- if a verdict note is malformed:
  - ShipSafe ignores it instead of executing partial actions
- if a fix patch is not exact:
  - ShipSafe blocks the MR but skips fix MR generation
- if labels do not exist:
  - ShipSafe creates them
- if status checks are missing:
  - ShipSafe continues with comments and labels but logs the setup problem

The goal is that reviewers always see a visible outcome, even when a fully automatic action could not be completed.

## 14. Testing Strategy

Tests live under `test/` and cover the critical contracts:

- verdict marker encoding and decoding
- trusted note-author validation
- MR, issue, and release context construction
- flow consumer lookup and cache behavior
- fix generation success and failure
- memory store and retrieval
- webhook behavior and note-driven action execution

This gives the project confidence in:

- the machine-readable transport
- the orchestration path
- the auto-fix path
- the cache/config logic

## 15. Repository Map

Key files and what they do:

- `src/server.ts`
  - Express entrypoint
- `src/orchestrator.ts`
  - event routing, flow launch, verdict intake
- `src/gitlab/client.ts`
  - GitLab API wrapper
- `src/execution/engine.ts`
  - write-side business logic
- `src/execution/fix-generator.ts`
  - auto-fix MR creation
- `src/context/*.ts`
  - deterministic context construction
- `src/memory/*.ts`
  - verdict memory read/write
- `src/utils/verdict-marker.ts`
  - hidden verdict transport
- `.gitlab/duo/flows/*.yaml`
  - GitLab Duo reasoning flows
- `docs/platform-setup.md`
  - manual GitLab configuration steps
- `demo/auth/jwt.ts`
  - seeded demo bug

## 16. Known Implementation Notes

These are important if you are extending the system:

- The current flow YAML asks the note-builder agent to embed the full ShipSafe verdict envelope as raw JSON into the hidden marker. The server supports base64 too, but the YAML currently uses the raw JSON fallback for reliability.
- `/status-checks/hook` verifies the `X-Gitlab-Signature` HMAC when `GITLAB_STATUS_CHECK_SHARED_SECRET` is configured. Without that secret, the callback is accepted but used only for logging.
- The reviewer bridge exists in code as an optional fallback, but the primary automatic-start mechanism is the GitLab Flows API.
- If you are using the GitLab `Agents and Flows` template path, publishable flows and agents live in separate template projects using `flows/flow.yml` and `agents/agent.yml`.

## 17. End-to-End Summary

At runtime, the full story looks like this:

1. GitLab emits an event.
2. ShipSafe receives it immediately and acknowledges the webhook.
3. ShipSafe builds deterministic context.
4. ShipSafe starts the matching GitLab Duo flow.
5. The flow performs multi-role reasoning.
6. The flow posts a verdict note.
7. ShipSafe validates the note author and decodes the hidden verdict marker.
8. ShipSafe executes the verdict as real GitLab actions.
9. ShipSafe records short memory for future reviews.

That is the heart of the product:

GitLab Duo decides what the risk is.
ShipSafe turns that decision into action.
