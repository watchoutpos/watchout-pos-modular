# WatchOut POS — Development Rules

Version: 0.1
Status: Initial proposal

## 1. Protect the existing project

The existing WatchOut POS project is a reference only.
Do not copy over, modify or delete it as part of this workspace setup.
Do not access its database unless a specific comparison is approved.

## 2. Safe changes

- Work only in the confirmed modular workspace.
- Inspect files and Git status before making changes.
- Prefer small, reviewable changes over large replacements.
- Do not delete data or run destructive database commands without approval.
- Never automatically push commits or deploy to production.
- Do not commit .env files, credentials, database files or customer data.
- Back up important work before schema or data changes.

## 3. Implementation workflow

For each task:
1. State the requirement and acceptance criteria.
2. Inspect relevant files and dependencies.
3. Propose the smallest safe implementation.
4. Implement the change.
5. Run relevant tests and inspect the results.
6. Review the diff for unintended changes.
7. Document the outcome and remaining limitations.

## 4. Quality gates

- Lint and build must pass when configured.
- Unit tests cover business rules.
- Integration tests cover API and database behavior.
- End-to-end tests cover critical user workflows.
- Security and permission checks are required for protected actions.
- Persistence must be tested across reloads and restarts.
- Regression tests are required for fixes to previously broken behavior.

## 5. Dependency and environment rules

- Record supported Node.js and package-manager versions.
- Pin and review dependencies through the lockfile.
- Do not install unnecessary packages.
- Use example environment files without real credentials.
- Keep development, test and production configuration separate.

## 6. Requirement status

Use these distinct statuses:
- Planned: documented, not implemented.
- Implemented: code exists, not fully verified.
- Tested: defined tests passed.
- Pilot-verified: tested in the agreed pilot environment.
- Deferred: intentionally postponed with a reason.

Never mark a feature complete based on a screenshot alone.