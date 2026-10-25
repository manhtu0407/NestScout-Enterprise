# GitHub CLI

Tier A. Select for repository identity, PR review/diff/checks, Actions diagnostics
and API inspection. Prefer `gh` over a custom GitHub HTTP client. Vendor/source:
[cli/cli](https://github.com/cli/cli), MIT; [manual](https://cli.github.com/manual/),
[installation](https://cli.github.com/manual/installation). Host version is
`gh --version`; it is a system prerequisite, not pinned by this catalog. Supported
doctor hosts are Windows/Linux x64. Install/login/credential refresh changes host
state and requires matched authority; preserve existing sessions and MCP settings.

## Discovery and effects

Run `gh --version`, `gh help`, `gh <namespace> --help` and `gh <namespace>
<command> --help` before unfamiliar operations. Extensions have separate supply,
permission and network risks; listing a namespace does not approve installing one.

| Families | Effects / useful task pattern |
| --- | --- |
| `auth status` | Read auth metadata; never use `auth token` in logs or prompts |
| `repo view`, `pr list/view/diff/checks`, `issue view` | Remote read: inspect exact repository and target |
| `run list/view`, `workflow list/view` | Read existing check failures/config; old runs do not validate new HEAD |
| `api` with GET / explicit endpoint | Remote read; adding fields can change HTTP method, inspect flags first |
| `pr create/edit/review/merge`, `issue create/comment`, `run rerun`, `workflow run` | Remote writes / hosted CI: separate explicit owner authority |
| `repo edit/delete`, `secret`, `variable`, `release`, `ruleset`, `cache`, `extension`, `attestation` | Read/write subcommands vary; settings/secrets/release/deletion are gated |

## Workflow, smoke and failure recovery

First inspect local root/origins and run `npm run identity`. For review, read the
exact PR's current head/diff/checks with `--repo manhtu0407/NestScout-Enterprise`.
Trace a failing job through `run view` and bounded sanitized logs; fix only the
authorized local defect and rerun local checks. No hosted rerun or PR comment is
implied by read-only review. API endpoints must name this repository explicitly.
Use native `--json`/`--jq` for selected safe fields instead of dumping whole objects.

Safe smoke is `gh --version`, `gh auth status` (inspect privately), and
`gh repo view manhtu0407/NestScout-Enterprise --json nameWithOwner,defaultBranchRef`.
Doctor withholds raw auth output and reports AUTH_BLOCKED independently of installed
CLI status. Do not publish usernames/scopes/tokens beyond necessary identity evidence.
No remote objects are created, so there is no cleanup.
doctor disables update notification and telemetry only in child environments using
the supported [environment flags](https://cli.github.com/manual/gh_help_environment).
No user/global setting is rewritten. Native help can work offline;
repo/API checks need network/auth and API rate budget, while Actions can incur
runner costs. A timeout is not a successful inspection.

For 401/403, verify target/account and report the missing permission. For 404, distinguish
inaccessible from absent. For rate limits/network, retain sanitized condition and
retry only when useful; never expand token scope or change settings to obtain PASS.
Before feature push inspect current workflow triggers and open PRs; before merge,
separately inspect required checks/protection and exact head. This library adds no
workflow trigger or bypass. Startup/runtime is per doctor run; compliance/latency
comparisons and hosted CI for unpublished changes remain NOT RUN.
