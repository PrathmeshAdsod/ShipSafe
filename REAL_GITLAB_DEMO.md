# Real GitLab Demo Guide

This guide is for the most believable ShipSafe demo setup:

- ShipSafe lives in its own repository
- the demo application lives in a separate GitLab project
- GitLab events come from that demo application project
- ShipSafe reviews, blocks, and fixes code in that project

That setup is usually better than demoing against the ShipSafe repo itself because it feels like a real customer workflow.

## 1. Recommended Demo Structure

Use two separate repositories:

1. `shipsafe`
   - contains the ShipSafe server, flow YAML, docs, and tests
   - runs locally or on a hosted URL

2. `shipsafe-demo-app`
   - contains a small realistic app
   - is the GitLab project where you open issues, merge requests, and tags
   - is the project that ShipSafe watches and acts on

This separation makes the demo easier to understand:

- one repo is the product
- one repo is the customer codebase

## 2. What The Demo App Should Look Like

Keep the demo app small enough to understand in under a minute.

Good choices:

- a tiny Node/TypeScript auth service
- a small Express API with `auth/`, `routes/`, and `utils/`
- a minimal app with 8-20 files

The app should include:

- one auth-related file
- one or two tests
- a realistic folder structure
- a `README`

Recommended example structure:

```text
shipsafe-demo-app/
├── auth/
│   └── jwt.ts
├── routes/
│   └── session.ts
├── utils/
│   └── time.ts
├── test/
│   └── auth.test.ts
├── package.json
└── README.md
```

## 3. Best Demo Bug

The best MR demo is still the JWT expiry boundary bug:

```ts
if (payload.exp > Date.now() / 1000) {
```

Correct version:

```ts
if (payload.exp >= Date.now() / 1000) {
```

Why it works well:

- easy to explain
- easy to miss in human review
- easy for ShipSafe to describe clearly
- tiny auto-fix patch
- looks real, not synthetic

## 4. Prepare The Demo App Repo

In the demo app project:

1. Put the correct version on `main`.
2. Make sure `auth/jwt.ts` contains `>=` on `main`.
3. Optionally add a basic test that suggests expiry logic matters.
4. Create a normal-looking commit history.

Do not keep the buggy version on `main`.

For the MR demo to feel real:

- `main` should look stable
- the demo branch should introduce the bug

## 5. Point ShipSafe At The Demo App Project

Your ShipSafe `.env` should target the demo app project, not the ShipSafe repo.

Set:

```env
GITLAB_PROJECT_ID=<demo app project id>
GITLAB_GROUP_ID=<demo app group id>
GITLAB_DEFAULT_BRANCH=main
```

Also make sure:

- the three ShipSafe flows are enabled for the demo app project
- `SHIPSAFE_FLOW_SERVICE_USERS` contains the real flow-note usernames
- the demo app project webhook points to your ShipSafe server
- the demo app external status check points to your ShipSafe server

## 6. Minimum Real Demo Setup

Before recording, make sure all of this is true in the demo app project:

- Merge request events webhook enabled
- Issue events webhook enabled
- Note events webhook enabled
- Tag push events webhook enabled
- ShipSafe external status check exists
- `Status checks must succeed` is enabled
- the three flows are enabled
- ShipSafe can resolve or is configured with the correct flow consumer IDs

## 7. Create Three Demo Moments

The best full demo usually has three short moments instead of one long confusing run.

### Demo moment 1: Issue triage

Create an issue like:

`JWT expiration handling is inconsistent near token expiry boundary`

Show:

- ShipSafe posts a triage-start note
- ShipSafe marks it ready or needs clarification

This proves ShipSafe is not only an MR bot.

### Demo moment 2: MR review and auto-fix

This is the main demo.

Create a branch from `main` and change:

```ts
if (payload.exp >= Date.now() / 1000) {
```

to:

```ts
if (payload.exp > Date.now() / 1000) {
```

Open an MR with a believable title, for example:

`refactor: simplify JWT expiry check`

Show this sequence:

1. MR opens
2. ShipSafe start comment appears
3. status check becomes `pending`
4. flow verdict note appears
5. status check becomes `failed`
6. `shipsafe::blocked` label appears
7. severity issue appears
8. fix MR appears
9. fix MR contains the one-character patch

This is the strongest “bad code detected, blocked, and fixed automatically” moment.

### Demo moment 3: Release gate

After the MR demo, push a tag in the demo app project.

Show:

- release-control issue creation or reuse
- release-review note
- GO or NO_GO behavior

This is optional in a short demo, but useful if you want to show broader SDLC coverage.

## 8. Best Recording Order

If you are making a video, use this order:

1. Show the demo app repo briefly
2. Show the ShipSafe server running
3. Show the GitLab webhook and external status check in the demo app project
4. Open the seeded MR
5. Wait for ShipSafe to act
6. Open the created issue
7. Open the fix MR
8. Show the tiny diff
9. End with the blocked original MR

This order makes the story easy to follow.

## 9. What To Say During The Demo

Keep the narration simple and outcome-focused.

Good framing:

- “This is a real GitLab project, not the ShipSafe codebase.”
- “I’m opening a merge request with a subtle auth bug.”
- “ShipSafe starts a GitLab Duo flow automatically.”
- “It doesn’t just comment. It blocks the merge.”
- “It creates the issue.”
- “And because the fix is small and exact, it opens the fix MR automatically.”

Avoid spending too much time on internal flow mechanics at the start.
Lead with the result first.

## 10. Pre-Demo Checklist

Run this checklist right before recording:

- ShipSafe server is running and reachable over HTTPS
- demo app project webhook deliveries are healthy
- external status check is configured and active
- flows are enabled for the demo app project
- `SHIPSAFE_FLOW_SERVICE_USERS` is correct
- `main` contains the correct `>=` line
- demo branch contains the buggy `>` line
- the MR diff shows the one-character regression clearly
- issue creation is enabled
- fix MR generation is enabled

## 11. Fast Dry Run

Before the real recording, do one full dry run and verify:

- ShipSafe start comment appears
- verdict note appears
- external status check changes state
- issue is created
- fix MR is created
- fix MR branch and patch look correct

If anything fails, debug before recording. Do not rely on live debugging during the real demo.

## 12. If You Want The Demo To Feel More Real

Small details help:

- give the demo app a real name
- use believable MR titles
- add a short issue description
- keep commit messages normal
- show one passing test file in the demo app
- avoid obviously fake filenames like `bug-demo.ts`

Good repo names:

- `session-service`
- `token-gateway`
- `account-api`

## 13. Recommended Final Approach

Yes, your instinct is correct:

- keep ShipSafe in its own repo
- create a separate GitLab demo app project
- configure ShipSafe to watch that project
- run the MR auto-fix demo there

That will feel much more real to judges or viewers than demoing directly inside the ShipSafe repository.

## 14. Suggested Next Step

Once your demo app repo exists, follow:

- [`SETUP.md`](./SETUP.md) for the full technical setup
- this file for the demo-specific structure and recording flow

The core idea is simple:

- ShipSafe is the product
- the demo app is the customer codebase
- the MR in the demo app is where the “bad code detected, blocked, and fixed automatically” story happens
