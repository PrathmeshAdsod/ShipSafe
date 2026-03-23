# ShipSafe Setup Guide

This guide takes you from a fresh clone to a working ShipSafe installation, then shows you how to run a clean end-to-end demo.

By the end, you should be able to:

- run the ShipSafe server
- publish and enable the three GitLab Duo flows
- connect GitLab webhooks to ShipSafe
- receive verdict notes back from the flows
- see ShipSafe block or pass merge requests
- create issues and fix MRs automatically
- run the seeded JWT boundary-condition demo

## 1. What You Need

Before you start, make sure you have:

- Node.js 20 or newer
- npm
- a GitLab project where you have Maintainer access
- GitLab Duo Agent Platform access for that project or group
- one of these flow-management options:
  - native GitLab flow management in `Automate > Flows` and the AI Catalog
  - access to the hackathon-style `Agents and Flows` template projects
- a GitLab personal access token with `api` scope
- a public HTTPS URL for the ShipSafe server

The public HTTPS URL can be:

- a deployed app URL
- a tunnel to your local machine

ShipSafe does not work end to end unless GitLab can reach your server over HTTPS.

## 2. Clone And Install

From the repo root:

```bash
npm install
```

Verify the codebase before touching GitLab:

```bash
npm run build
npm test
```

## 3. Create Your GitLab Token

In GitLab:

1. Go to your avatar menu.
2. Open `Edit profile`.
3. Open `Access tokens`.
4. Create a token with at least:
   - `api`
5. Copy the token value immediately.

ShipSafe uses this token for:

- starting flows
- reading files, diffs, issues, and merge requests
- posting comments
- creating labels
- creating issues
- creating branches, commits, and fix MRs
- updating releases

## 4. Collect Project Values

You need these values for `.env`:

- `GITLAB_PROJECT_ID`
- `GITLAB_GROUP_ID`
- `GITLAB_DEFAULT_BRANCH`
- `GITLAB_HOST`

How to find them:

1. Open your GitLab project.
2. Go to `Settings > General`.
3. Copy the project ID.
4. Open the parent group and copy the group ID from `Settings > General`.
5. Note the default branch from the project settings.

If you are using GitLab.com:

- `GITLAB_HOST=https://gitlab.com`

## 5. Create `.env`

Copy the example file:

```bash
cp .env.example .env
```

Fill it with real values:

```env
GITLAB_TOKEN=your_token_here
GITLAB_WEBHOOK_SECRET=choose_a_random_secret_string
GITLAB_STATUS_CHECK_SHARED_SECRET=choose_a_second_random_secret
GITLAB_PROJECT_ID=12345678
GITLAB_GROUP_ID=87654321
GITLAB_HOST=https://gitlab.com
GITLAB_DEFAULT_BRANCH=main

PORT=3000

ENABLE_MR_BLOCKING=true
ENABLE_ISSUE_CREATION=true
ENABLE_FIX_MR=true
ENABLE_AUTO_APPROVE=false
ENABLE_AUTO_MERGE=false
ENABLE_MEMORY=true
ENABLE_CODEBASE_SCAN=true
ENABLE_PLATFORM_TRIGGER_BRIDGE=false
ENABLE_STATUS_CHECKS=true

GITLAB_MR_FLOW_CONSUMER_ID=
GITLAB_ISSUE_FLOW_CONSUMER_ID=
GITLAB_RELEASE_FLOW_CONSUMER_ID=
SHIPSAFE_MR_FLOW_NAME=ShipSafe MR Review
SHIPSAFE_ISSUE_FLOW_NAME=ShipSafe Issue Triage
SHIPSAFE_RELEASE_FLOW_NAME=ShipSafe Release Gate
SHIPSAFE_FLOW_SERVICE_USERS=
SHIPSAFE_FLOW_REVIEWER_ID=
SHIPSAFE_EXTERNAL_STATUS_CHECK_NAME=ShipSafe
```

Important notes:

- leave the three `GITLAB_*_FLOW_CONSUMER_ID` values blank at first unless you already know them
- ShipSafe can resolve flow consumer IDs automatically by GraphQL after the flows are enabled
- `GITLAB_STATUS_CHECK_SHARED_SECRET` should match the HMAC shared secret configured on the external status check in GitLab
- `SHIPSAFE_FLOW_SERVICE_USERS` must be filled later, after you enable the flows and learn which usernames actually post the verdict notes

## 6. Start ShipSafe

Run the server:

```bash
npm run dev
```

You should see:

```text
ShipSafe listening on port 3000
```

Test the health endpoint:

```bash
curl http://localhost:3000/health
```

Expected response:

```json
{"status":"ok","service":"shipsafe"}
```

## 7. Expose The Server Over HTTPS

GitLab must be able to reach your server.

Use either:

- a deployed public app URL
- a tunnel to `http://localhost:3000`

After you have a public HTTPS base URL, write it down:

```text
https://your-public-url
```

You will use it for:

- project webhooks
- external status checks

## 8. Understand The Flow And Agent Template Path

GitLab officially supports custom flow definitions in `.gitlab/duo/` and can execute them through enabled flows or trigger configuration.

This repository keeps the canonical ShipSafe flow definitions in:

- `.gitlab/duo/flows/shipsafe-mr-review.yaml`
- `.gitlab/duo/flows/shipsafe-issue-triage.yaml`
- `.gitlab/duo/flows/shipsafe-release-gate.yaml`

ShipSafe's current server runtime starts flows through the Flows API by `ai_catalog_item_consumer_id`, so the flows must exist as enabled catalog items in the project.

That means the practical setup paths for this codebase are:

- create or manage the flows in GitLab and enable them in the project
- or use your hackathon-style `Agents and Flows` template projects to publish those flows, then enable them in the project

The template-based publishing path uses projects that contain files like:

- `flows/flow.yml.template`
- `agents/agent.yml.template`

After you start using them, the actual expected file names become:

- `flows/flow.yml`
- `agents/agent.yml`

Important distinction:

- this ShipSafe repo stores the canonical flow **definition bodies** in `.gitlab/duo/flows/*.yaml`
- the template-based path wraps those same definition bodies in separate projects with `flows/flow.yml` or `agents/agent.yml`
- once published or created, the flows must be enabled in the project so ShipSafe can resolve their `ai_catalog_item_consumer_id` values

That means ShipSafe setup always includes:

1. this application repo
   - webhook server
   - orchestration
   - GitLab API actions
2. one GitLab flow-definition path
   - GitLab-managed custom flows, or
   - separate template-based flow projects

## 9. Choose How You Will Publish The Flows

Choose one of these paths:

### Option A: Create or manage the flows directly in GitLab

Use this if you want to create the custom flows in GitLab itself.

In that case:

1. Use the YAML bodies in `.gitlab/duo/flows/*.yaml` as the source of truth.
2. Create the corresponding custom flows in GitLab.
3. Enable those flows in the target project.

### Option B: Use hackathon-style template flow projects

Use this if your environment gives you the `Agents and Flows` template projects and you want the flows managed through those wrappers.

## 10. Create The Three Flow Projects

You need three separate flow projects in the template-based path:

- one for MR review
- one for issue triage
- one for release gating

For each one:

1. Create a new project from the `Agents and Flows` template.
2. If the project contains `flows/flow.yml.template`, rename it to `flows/flow.yml`.
3. Replace the placeholder content.
4. Commit and push the changes.
5. Follow the template project's review or sync process so the flow becomes available in GitLab.

If you want ShipSafe to generate the wrapper files for you first, run:

```bash
npm run render:flow-projects
```

That command writes ready-to-copy flow projects to:

- `gitlab-template-projects/shipsafe-mr-review/flows/flow.yml`
- `gitlab-template-projects/shipsafe-issue-triage/flows/flow.yml`
- `gitlab-template-projects/shipsafe-release-gate/flows/flow.yml`

Use these exact flow names in the wrapper metadata:

- `ShipSafe MR Review`
- `ShipSafe Issue Triage`
- `ShipSafe Release Gate`

Those names matter because ShipSafe uses them when it auto-resolves enabled flow consumer IDs.

## 11. Understand The Template Wrapper Exactly

The template you shared is the real wrapper shape GitLab expects.

Your flow project starts from something like this:

```yaml
name: "AI Hackathon Flow"
description: "A flow to..."
public: true
definition:
  version: v1
  environment: ambient
  components:
    ...
  prompts:
    ...
  routers:
    ...
  flow:
    entry_point: "my_agent"
```

For ShipSafe, the key rule is:

- everything from this repo's `.gitlab/duo/flows/*.yaml` file goes under `definition:`
- the wrapper project's top-level `name`, `description`, and `public` stay outside `definition:`

So you are not copying the whole template into this repo.
You are taking the ShipSafe YAML body from this repo and placing it inside the template wrapper project.

## 12. Map This Repo Into The Flow Templates

For each template-based flow project, take the matching YAML body from this repo:

- `.gitlab/duo/flows/shipsafe-mr-review.yaml`
- `.gitlab/duo/flows/shipsafe-issue-triage.yaml`
- `.gitlab/duo/flows/shipsafe-release-gate.yaml`

Then place that YAML under the template wrapper's `definition:` key.

The wrapper project supplies:

- `name`
- `description`
- `public`
- `definition:`

The ShipSafe repo supplies:

- the full `definition` body itself

Conceptually, your published `flows/flow.yml` should look like:

```yaml
name: "ShipSafe MR Review"
description: "ShipSafe flow for merge request review"
public: true
definition:
  version: v1
  environment: ambient
  components:
    ...
  prompts:
    ...
  routers:
    ...
  flow:
    entry_point: ...
```

### Example: MR flow wrapper

This is the shape you should create in the MR flow template project:

```yaml
name: "ShipSafe MR Review"
description: "ShipSafe flow for merge request review, blocking, and auto-fix decisions"
public: true
definition:
  version: "v1"
  environment: ambient
  components:
    - name: announce_review
      type: DeterministicStepComponent
      tool_name: create_merge_request_note
      inputs:
        - from: "context:project_id"
          as: "project_id"
        - from: "context:merge_request_id"
          as: "merge_request_iid"
        - from: "ShipSafe is reviewing this merge request now.\n\nBad code is being checked for real blockers, issue creation, and auto-fix eligibility."
          as: "body"
          literal: true
    ...
  prompts:
    ...
  routers:
    ...
  flow:
    entry_point: "announce_review"
```

Do the same pattern for:

- `ShipSafe Issue Triage`
- `ShipSafe Release Gate`

The easiest workflow is:

1. run `npm run render:flow-projects`
2. open the generated `gitlab-template-projects/.../flows/flow.yml`
3. copy that file into the matching template-based flow project
4. commit and publish that template project

## 13. Optional Custom Agent Projects

If you also want reusable chat agents for the demo, create separate template-based agent projects using `agents/agent.yml`.

This is optional.

ShipSafe's main runtime only requires the three flows.

If you do create agent projects, you would typically make:

- a Defender agent
- a Skeptic agent
- a Pragmatist agent

Your agent template starts from a wrapper like:

```yaml
name: "AI Hackathon Agent"
description: "An agent to..."
public: true
system_prompt: |
  Only reply with "I'm a placeholder agent, please change my prompt"
tools:
  - read_file
  - read_files
```

For ShipSafe, these agent projects are optional demo assets only.
They are useful if you want to show standalone roles in GitLab chat, but they are not required for the main webhook-plus-flow runtime.

## 14. Enable The Flows In GitLab

After the template-based flow projects are synced and available:

1. Open your target GitLab project.
2. Go to the place where AI Catalog items or flows can be enabled for the project.
3. Enable:
   - `ShipSafe MR Review`
   - `ShipSafe Issue Triage`
   - `ShipSafe Release Gate`

Once enabled, ShipSafe can either:

- auto-resolve the enabled flow consumer IDs by GraphQL, or
- use the `GITLAB_*_FLOW_CONSUMER_ID` values if you fill them manually

## 15. Find The Flow Service Account Usernames

ShipSafe trusts verdict notes only from configured flow service users.

You must populate:

- `SHIPSAFE_FLOW_SERVICE_USERS`

How to get the usernames:

1. Enable each flow.
2. Run each flow once from GitLab UI, or let ShipSafe start it once.
3. Open the note that the flow posts.
4. Record the username of the author.

If there is one shared service account, your env value may look like:

```env
SHIPSAFE_FLOW_SERVICE_USERS=shipsafe-bot
```

If there are multiple flow-specific service accounts, use a comma-separated list:

```env
SHIPSAFE_FLOW_SERVICE_USERS=shipsafe-mr-bot,shipsafe-issue-bot,shipsafe-release-bot
```

After you update `.env`, restart the server.

## 16. Optional: Set Flow Consumer IDs Manually

Usually you can leave these blank:

- `GITLAB_MR_FLOW_CONSUMER_ID`
- `GITLAB_ISSUE_FLOW_CONSUMER_ID`
- `GITLAB_RELEASE_FLOW_CONSUMER_ID`

ShipSafe will try to resolve them automatically from the enabled flow names.

If your published flow names differ from the defaults, set:

- `SHIPSAFE_MR_FLOW_NAME`
- `SHIPSAFE_ISSUE_FLOW_NAME`
- `SHIPSAFE_RELEASE_FLOW_NAME`

Only fill them manually if:

- GraphQL lookup fails
- the enabled flow names do not match the expected names
- your GitLab setup restricts the lookup behavior

## 17. Configure GitLab Webhooks

In your target project:

1. Go to `Settings > Webhooks`.
2. Add a new webhook.
3. Set:
   - URL: `https://your-public-url/webhook`
   - Secret token: your `GITLAB_WEBHOOK_SECRET`
   - SSL verification: enabled

Enable these event types:

- Merge request events
- Issue events
- Note events
- Tag push events

Save the webhook.

### Why note events are required

The flow does not call the server directly with a verdict.
Instead, it posts a GitLab note containing a hidden ShipSafe verdict-envelope marker.

That means ShipSafe needs note webhooks to receive the verdict and execute actions.

### Important MR-trigger note

ShipSafe launches MR reviews from the project webhook at `/webhook`.

The external status check endpoint at `/status-checks/hook` exists for GitLab's status-check service and request verification. It is not a second review trigger. This avoids duplicate MR reviews.

## 18. Configure The External Status Check

ShipSafe uses an external status check as the real merge gate.

In your project:

1. Go to `Settings > Merge requests`.
2. Find the external status checks section.
3. Create a new external status check.
4. Set:
   - Name: `ShipSafe`
   - URL: `https://your-public-url/status-checks/hook`
   - HMAC shared secret: the same value as `GITLAB_STATUS_CHECK_SHARED_SECRET`
5. Enable `Status checks must succeed`.

If you change the status check name in GitLab, also change:

```env
SHIPSAFE_EXTERNAL_STATUS_CHECK_NAME=YourCustomName
```

Then restart the server.

### Important behavior note

GitLab external status checks default to `pending`, and GitLab documents that pending checks fail after two minutes if they are never updated.

ShipSafe responds by setting the final `passed` or `failed` state through the External Status Checks API after the verdict is processed.

## 19. Restart ShipSafe

Any time you change `.env`, restart the app:

```bash
npm run dev
```

## 20. First End-To-End Sanity Check

Before the demo, do one simple live MR check.

### Merge request sanity check

1. Create a branch in the target project.
2. Make a small code change.
3. Open an MR.

Expected sequence:

1. GitLab sends the MR webhook.
2. ShipSafe posts a "reviewing now" comment.
3. The ShipSafe status check becomes `pending`.
4. ShipSafe launches the MR flow.
5. The MR flow posts a verdict note.
6. ShipSafe receives the note webhook.
7. ShipSafe updates the status check to `passed` or `failed`.
8. If the verdict blocks merge, ShipSafe may:
   - label the MR
   - create an issue
   - create a fix MR

### Where to debug if it fails

Check these in order:

1. your local or deployment logs
2. `Settings > Webhooks > Recent deliveries`
3. `Automate > Sessions`
4. whether the flow note author is in `SHIPSAFE_FLOW_SERVICE_USERS`
5. whether the external status check name matches `SHIPSAFE_EXTERNAL_STATUS_CHECK_NAME`

## 21. Full Feature Verification

If you want to verify every ShipSafe path, run these three live checks.

### A. Merge request review

Open a merge request with a small code change.

Verify:

- ShipSafe posts the start comment
- the status check goes to `pending`
- the flow posts the verdict note
- ShipSafe processes the verdict

### B. Issue triage

Open a new issue with a feature or bug request.

Verify:

- ShipSafe posts the start note
- the issue flow posts a verdict note
- ShipSafe applies:
  - `shipsafe::ready`, or
  - `shipsafe::needs-clarification`
- if clarification is needed, ShipSafe may create up to 3 gap issues

### C. Release gate

Push a Git tag in the project.

Verify:

- ShipSafe creates or reuses a release-control issue
- ShipSafe posts the start note there
- the release flow posts a verdict note there
- ShipSafe:
  - updates or creates the GitLab release on `GO`
  - creates a blocker issue on `NO_GO`

## 22. Demo Preparation

ShipSafe already includes:

- seeded verdict memory in `memory/verdicts.json`
- a demo bug file at `demo/auth/jwt.ts`

The demo bug is:

```ts
if (payload.exp > Date.now() / 1000) {
```

The intended auto-fix is:

```ts
if (payload.exp >= Date.now() / 1000) {
```

### Important demo detail

For a real MR demo, the buggy line must be introduced by the MR.

That means the target branch should contain the correct version, and the demo branch should change it to the buggy version.

Because this repository currently ships the buggy demo file as an example artifact, do one of these before recording the demo:

1. Use a separate demo project where the target branch already has the corrected `>=` line.
2. Or temporarily fix `demo/auth/jwt.ts` on the target branch first, then create a demo branch that changes it back to `>`.

If both source and target branches already contain the bug, there is no diff for ShipSafe to review, so the demo loses its main "aha" moment.

## 23. Demo Script

Use this sequence for a strong demo.

### Step 1: Confirm ShipSafe is healthy

Show:

- `npm run dev`
- `GET /health`

### Step 2: Show the GitLab setup

Show:

- the three published flow projects or enabled flows
- the webhook configuration
- the external status check

### Step 3: Open the seeded demo MR

The MR should introduce the `>` bug in the JWT expiry check.

### Step 4: Wait for ShipSafe to run

Expected visible sequence:

1. ShipSafe start comment appears
2. ShipSafe status check becomes `pending`
3. flow verdict note appears
4. ShipSafe marks the status check `failed`
5. ShipSafe adds `shipsafe::blocked`
6. ShipSafe creates a severity issue
7. ShipSafe creates the fix MR

### Step 5: Open the fix MR

Show the tiny diff:

- `>` becomes `>=`

That is the clearest proof that ShipSafe:

- found a bug a human could miss
- blocked the risky merge
- generated the fix automatically

## 24. Expected Demo Outcomes

For the ideal MR demo, verify all of these:

- MR has a ShipSafe start comment
- MR has a ShipSafe verdict note
- external status check is `failed`
- MR has `shipsafe::blocked`
- a severity issue exists
- a fix MR exists
- the fix MR contains the one-character patch

## 25. Common Problems And Fixes

### Flow does not start

Check:

- the published flow exists and is enabled
- the flow name matches:
  - `ShipSafe MR Review`
  - `ShipSafe Issue Triage`
  - `ShipSafe Release Gate`
- the GitLab token has `api` scope
- `Automate > Sessions` for flow errors

### Flow starts but ShipSafe does nothing after the note appears

Check:

- Note events are enabled in the webhook
- the verdict note author username is listed in `SHIPSAFE_FLOW_SERVICE_USERS`
- the note still contains the hidden `shipsafe-verdict:v1:` marker

### MR comment appears but no block/pass status

Check:

- the external status check exists
- its name matches `SHIPSAFE_EXTERNAL_STATUS_CHECK_NAME`
- `Status checks must succeed` is enabled

### Issue gets created but no fix MR appears

Check:

- the verdict included `fix_code_changes`
- `old_content` exactly matches the file content on the MR source branch
- `ENABLE_FIX_MR=true`

### GraphQL consumer lookup fails

Fix:

- set the three `GITLAB_*_FLOW_CONSUMER_ID` values manually

## 26. Useful Commands

Local development:

```bash
npm run dev
```

Build:

```bash
npm run build
```

Test:

```bash
npm test
```

## 27. Recommended Setup Order

If you want the smoothest path, follow this order exactly:

1. `npm install`
2. `npm run build`
3. `npm test`
4. fill `.env`
5. start ShipSafe
6. expose it on a public HTTPS URL
7. choose either direct `.gitlab/duo/flows` usage or template-based flow projects
8. publish or enable those flows
9. discover and set `SHIPSAFE_FLOW_SERVICE_USERS`
10. create the project webhook
11. create the external status check
12. open a normal MR for sanity testing
13. run the seeded bug demo

Once those steps are complete, you should have a full ShipSafe installation and a repeatable demo path.
