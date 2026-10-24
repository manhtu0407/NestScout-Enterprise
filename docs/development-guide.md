# NestScout development guide

Persistency on the tenth times...!

Public, new NestScout repository. The Delivery Project remains private. This repository contains development
workflow and security tooling; the application stack has not been selected.

## Repository identity

- Owner/repository: `manhtu0407/NestScout-Enterprise`
- GitHub repository ID: `1432052547`
- Default branch: `main`
- Visibility and plan: public, GitHub Free (explicitly approved by the owner)

Run `npm run identity` before remote writes. It verifies both origin URLs,
repository ID, visibility, default branch, authenticated account, and admin access.
Always pass `--repo manhtu0407/NestScout-Enterprise` to GitHub CLI write commands.

## Start here

Requirements: Git, GitHub CLI authenticated as `manhtu0407`, Node.js 24 LTS,
npm, and `tar`. Pinned native tools support Windows/Linux x64.

```sh
git clone https://github.com/manhtu0407/NestScout-Enterprise.git
cd NestScout-Enterprise
npm ci --ignore-scripts
npm run identity
npm run tools:install
npm run check
npm run verify:negative
```

Node/npm are repository tooling, not a choice of application stack. There is no
application server, application build, typecheck, or unit suite yet. Tool downloads
are version-pinned and SHA-256 checked; dependency installation uses the lockfile.

Optional local hooks (affect only this checkout):

```sh
git config --local core.hooksPath .githooks
```

Hooks can be bypassed and are not server-side protection. Secret checks cover Git
history plus tracked/unignored working files. Keep local secrets in ignored files.

## Work and delivery

Supabase local tooling and agent connection setup are documented in
[Supabase development](supabase-development.md). This does not select a product
application stack or authorize hosted operations.

1. Create an Issue with acceptance criteria; prioritize it in the private
   [NestScout Delivery project](https://github.com/users/manhtu0407/projects/3).
2. Create a short branch, implement the scoped change, and run the checks.
3. Open a PR linked to the Issue; include evidence and rollback steps.
4. The owner reviews the exact commit and CI results, then chooses whether to merge.
5. Release only when there is an application/artifact and a verified source commit.

See [CONTRIBUTING](../CONTRIBUTING.md), [security reporting](../SECURITY.md),
[operations and recovery](operations.md),
[root engineering policy](../AGENTS.md),
[workflow coverage](workflow-coverage.md), and
[setup evidence](setup-evidence.md).

## GitHub Free limits

Public repositories can use standard GitHub-hosted runners without consuming private
repository minutes. Branch protection and required status checks are now eligible
under GitHub Free, but are not configured by the visibility-change task. Checks alone
do not enforce a server-side merge gate. Auto-merge remains off.

Public visibility changes eligibility for native security features and attestations;
do not infer their activation from this change. Gitleaks CI detects secrets after
upload and is not native GitHub push protection. No paid services or AI API jobs
are configured. The management Project remains private.

## Ownership

No open-source license has been selected. The owner will decide licensing separately.
