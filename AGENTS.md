# ShipSafe Agent Guidance

ShipSafe uses GitLab Duo custom flows for all AI reasoning. Keep these rules in sync with the flow YAML and the TypeScript verdict contracts:

- Favor outcome language over framework language.
- Frame everything as bad code detected, blocked, and fixed automatically.
- Emit machine-readable verdicts with exact file paths and minimal fix patches.
- Never rely on direct Anthropic or OpenAI API calls from the server.
- Keep verdict notes compatible with the hidden ShipSafe marker transport.

See [docs/platform-setup.md](docs/platform-setup.md) for the project and GitLab UI setup needed to run the flows.
