# ShipSafe

> Every merge is challenged. Every bug is caught.
> Critical fixes are generated automatically.

ShipSafe watches GitLab events, launches GitLab Duo custom flows for the AI reasoning, and executes the result as real GitLab actions. When risky code is detected, ShipSafe fails the merge gate, creates the issue, and opens the patched fix MR automatically.

## What it does

- Starts a GitLab Duo MR review flow on merge request open and meaningful updates.
- Trusts only verdict notes posted by configured ShipSafe service accounts.
- Fails or passes a GitLab external status check to block or allow merges.
- Creates issues, labels the MR, and opens a fix MR from inline `fix_code_changes`.
- Stores short verdict history in `memory/verdicts.json` for future debates.

## Project layout

- `src/`: Express server, orchestrator, GitLab client, execution engine, memory, and context builders.
- `.gitlab/duo/flows/`: Canonical custom flow YAML files for MR, issue, and release review.
- `memory/verdicts.json`: Versioned verdict memory.
- `docs/platform-setup.md`: GitLab UI setup for flows, service users, and external status checks.

## Quick start

```bash
npm install
cp .env.example .env
npm run dev
```

Set the GitLab values in `.env`, then:

1. Enable GitLab Duo flows in your project.
2. Choose your flow-management path:
   - Use GitLab's native flow management and enable flows from Automate or AI Catalog.
   - If your hackathon setup includes template-based flow projects, run `npm run render:flow-projects` and use the generated `flows/flow.yml` wrappers under `gitlab-template-projects/`.
3. Configure the three custom flows from the path your GitLab environment supports.

ShipSafe's current runtime starts flows through the Flows API by `ai_catalog_item_consumer_id`, so the flows must be available as enabled catalog items in the project.
4. Enable a ShipSafe service account and add its username to `SHIPSAFE_FLOW_SERVICE_USERS`.
5. Add project webhooks for merge requests, issues, notes, and tag pushes to `/webhook`.
6. Configure an external status check pointing at `/status-checks/hook`, set an HMAC shared secret that matches `GITLAB_STATUS_CHECK_SHARED_SECRET`, and enable `Status checks must succeed`.

For the full step-by-step setup and demo path, see [`SETUP.md`](./SETUP.md).

## Demo path

Seed `memory/verdicts.json`, open the demo MR containing the `demo/auth/jwt.ts` `>` bug, and ShipSafe should:

1. Launch the MR review flow.
2. Receive the verdict note webhook.
3. Fail the external status check.
4. Create a severity issue.
5. Open a one-character fix MR.

## Built with

GitLab Duo Agent Platform, GitLab Flows API, GitLab REST API, TypeScript, Express, Vitest.
