# NestScout development guide

Persistency on the tenth times...!

Private, new NestScout project. This repository currently contains development
workflow and security tooling; the application stack has not been selected.

## Repository identity

- Owner/repository: `manhtu0407/NestScout-Enterprise`
- GitHub repository ID: `1432052547`
- Default branch: `main`
- Visibility and plan: private, GitHub Free

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

1. Create an Issue with acceptance criteria; prioritize it in the private
   [NestScout Delivery project](https://github.com/users/manhtu0407/projects/3).
2. Create a short branch, implement the scoped change, and run the checks.
3. Open a PR linked to the Issue; include evidence and rollback steps.
4. The owner reviews the exact commit and CI results, then chooses whether to merge.
5. Release only when there is an application/artifact and a verified source commit.

See [CONTRIBUTING](../CONTRIBUTING.md), [security reporting](../SECURITY.md),
[operations and recovery](operations.md),
[AI working guide](ai-working-guide.md),
[workflow coverage](workflow-coverage.md), and
[setup evidence](setup-evidence.md).

## GitHub Free limits

CI can fail, but this private Free repository cannot enforce protected branches,
required PR reviews, or required status checks. Maintainers can still push/merge.
Do not describe the workflow as a mandatory server-side gate.

Native private Code scanning, Secret Protection, merge queues, and private artifact
attestations are not enabled. Gitleaks CI detects secrets after upload; it is not
native GitHub push protection. No paid services or AI API jobs are configured.

## Ownership

This private repository has no open-source license. Do not publish or redistribute
its contents without the owner's permission.
