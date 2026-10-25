# Security policy

## Report privately

This is a public, pre-application repository with no released supported versions.
Report a suspected vulnerability directly to the owner `manhtu0407` through the
existing private communication channel used for this project. If no private channel
exists, ask the owner for one without including exploit details or credentials.
Do not post sensitive details in ordinary Issues, PRs, or public discussions.
GitHub native private vulnerability reporting is not configured here.

Include the affected commit, impact, sanitized reproduction, and suggested fix.
The owner triages severity, agrees on remediation, and coordinates disclosure.
There is no automated acknowledgement or guaranteed response time.

## Credential exposure

1. Stop further publication and notify the owner privately.
2. Revoke/rotate the credential at its provider immediately. Deleting a file or
   reverting a commit does not revoke a leaked credential.
3. Audit access and affected systems; remove the credential from current code.
4. Agree on history/log/artifact cleanup separately before rewriting Git history.
5. Add a targeted regression check and document the sanitized incident outcome.

Never copy real credentials into test fixtures or scanner reports. Scanner output
must be redacted. No credentials or recovery codes belong in Git backups or Issues.

## Controls and limits

- Read-only default Actions token, SHA-pinned allowed Actions, verified tool downloads.
- Gitleaks checks history and tracked/unignored working files; optional local hooks.
- Dependabot alerts and updates when manifests/configuration are on `main`.
- Dependencies installed from the lockfile with lifecycle scripts disabled for tooling.
- Public Free repo: classic `main` protection is enabled, with required checks and
  administrator enforcement. Repository-level secret scanning and push protection remain
  disabled; CodeQL default setup is not configured. Gitleaks is detection, not
  native push protection. Recheck live state; the dated
  [security evidence](docs/setup-evidence.md#foundation-hardening-2026-10-25)
  distinguishes settings, execution and unverified areas.

Public partner monitoring and personal-account push protection are separate from
those repository settings; their operation was not verified by this inspection.

Account 2FA and recovery must be managed by the owner. Never ask an agent to store
passwords, OTPs, passkeys, or recovery codes. Review account sessions, applications,
and repository access when onboarding/offboarding or investigating an incident.

## Optional native controls

The 2026-10-25 read-only inspection found the following optional controls disabled.
Changing settings or starting new hosted analysis requires separate owner authority.

| Control / recommendation | Benefit | Limit, operation and cost considerations |
| --- | --- | --- |
| Enable native secret scanning and push protection | Detect supported secrets beyond local hooks and block supported leaks before publication | Detection has pattern/bypass limits and cannot revoke credentials; confirm current public-repository eligibility, configuration and false positives first |
| Enable private vulnerability reporting | A discoverable private channel for outside researchers | Owner must triage and maintain response ownership; does not implement remediation or guarantee response times |
| Evaluate CodeQL for the existing JavaScript tooling and later product languages | Semantic analysis complements Gitleaks and syntax checks | Needs an approved hosted analysis run, maintenance and alert triage; no new workflow/runtime cost has been measured; native/product coverage depends on selected languages/builds |

Keep the existing scanners and negative fixtures. Native eligibility varies with
visibility/plan; review [GitHub security availability](https://docs.github.com/en/code-security/getting-started/github-security-features)
and [secure workflow use](https://docs.github.com/en/actions/reference/security/secure-use)
before enabling features. No optional service or paid capability was enabled here.
