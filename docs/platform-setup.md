# ShipSafe Platform Setup

## 1. Project prerequisites

- GitLab project in the hackathon-accessible namespace.
- Maintainer access to the project.
- GitLab Duo Agent Platform enabled.
- A service account or bot user that the flows will author notes as.
- Hosted or custom runners available for flows.

## 2. Environment variables

Copy `.env.example` to `.env` and set:

- `GITLAB_TOKEN`
- `GITLAB_WEBHOOK_SECRET`
- `GITLAB_STATUS_CHECK_SHARED_SECRET`
- `GITLAB_PROJECT_ID`
- `GITLAB_GROUP_ID`
- `SHIPSAFE_FLOW_SERVICE_USERS`
- `GITLAB_MR_FLOW_CONSUMER_ID`, `GITLAB_ISSUE_FLOW_CONSUMER_ID`, `GITLAB_RELEASE_FLOW_CONSUMER_ID` if you want to skip GraphQL lookup
- `SHIPSAFE_MR_FLOW_NAME`, `SHIPSAFE_ISSUE_FLOW_NAME`, `SHIPSAFE_RELEASE_FLOW_NAME` if your enabled flow names differ from the defaults

## 3. Import the flows

GitLab officially supports custom flows in `.gitlab/duo/`, and ShipSafe keeps the canonical flow `definition` bodies in:

- `.gitlab/duo/flows/shipsafe-mr-review.yaml`
- `.gitlab/duo/flows/shipsafe-issue-triage.yaml`
- `.gitlab/duo/flows/shipsafe-release-gate.yaml`

ShipSafe's current runtime starts flows through the Flows API by `ai_catalog_item_consumer_id`, so the practical requirement is that the flows exist as enabled catalog items in the project.

If you are using the GitLab `Agents and Flows` template path, publishable flows live in separate template-based projects with `flows/flow.yml`.
If you are creating flows directly in GitLab instead, use the YAML in `.gitlab/duo/flows/*.yaml` as the source definition and then enable those flows in the project.

For each ShipSafe flow:

1. Create a separate template-based flow project.
2. Rename `flows/flow.yml.template` to `flows/flow.yml`.
3. Copy the matching YAML from this repo into that wrapper project's `definition:` block.
4. Set the wrapper metadata.

You can also let ShipSafe render those wrapper projects for you:

```bash
npm run render:flow-projects
```

That creates:

- `gitlab-template-projects/shipsafe-mr-review/flows/flow.yml`
- `gitlab-template-projects/shipsafe-issue-triage/flows/flow.yml`
- `gitlab-template-projects/shipsafe-release-gate/flows/flow.yml`

The wrapper shape should match the template you now have access to:

```yaml
name: "ShipSafe MR Review"
description: "ShipSafe flow for merge request review"
public: true
definition:
  version: "v1"
  environment: ambient
  components:
    ...
  prompts:
    ...
  routers:
    ...
  flow:
    entry_point: "announce_review"
```

Important:

- the wrapper project owns `name`, `description`, and `public`
- this repo owns the full `definition` body
- do not paste the wrapper keys into `.gitlab/duo/flows/*.yaml` in this repo

Use these exact published flow names:

- `ShipSafe MR Review`
- `ShipSafe Issue Triage`
- `ShipSafe Release Gate`

## 4. Enable the flows

Enable the flows for the project, then either:

- Record the `ai_catalog_item_consumer_id` values from GitLab and place them in `.env`, or
- Let ShipSafe resolve them by GraphQL using the enabled flow names.

If your enabled flow names differ from the defaults, set:

- `SHIPSAFE_MR_FLOW_NAME`
- `SHIPSAFE_ISSUE_FLOW_NAME`
- `SHIPSAFE_RELEASE_FLOW_NAME`

## 5. Webhooks

Create one project webhook pointing to `https://your-app/webhook` with:

- Merge request events
- Issue events
- Note events
- Tag push events

Use `GITLAB_WEBHOOK_SECRET` as the webhook secret.

## 6. External status check

Create a status check service named `ShipSafe` targeting `https://your-app/status-checks/hook`, set the HMAC shared secret to the same value as `GITLAB_STATUS_CHECK_SHARED_SECRET`, then enable `Status checks must succeed` in project merge request settings.

ShipSafe sets this check to:

- `pending` when a review starts
- `failed` when the verdict blocks merge
- `passed` when the verdict approves merge

ShipSafe launches MR reviews from the main project webhook, not from the status-check callback. This avoids duplicate MR reviews.

Verdict transport note:

- each ShipSafe flow posts a normal GitLab note plus a hidden `shipsafe-verdict:v1:` marker
- the marker contains the full ShipSafe verdict envelope as raw JSON
- the server ignores markers from users not listed in `SHIPSAFE_FLOW_SERVICE_USERS`

## 7. Optional custom chat agents

If you want reusable chat agents for the demo, create separate template-based agent projects using `agents/agent.yml`. These are optional and are not required for ShipSafe's main runtime path.

The agent wrapper follows the template you shared:

```yaml
name: "ShipSafe Defender"
description: "Optional reusable ShipSafe agent for interactive review demos"
public: true
system_prompt: |
  ...agent prompt...
tools:
  - read_file
  - read_files
```
