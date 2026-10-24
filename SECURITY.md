# Security policy

## Report privately

This is a private, pre-application repository with no released supported versions.
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
- Private Free repo: no enforced branch protection, native secret scanning/push
  protection, or native Code scanning dashboard. CI cannot stop an authorized direct push.

Account 2FA and recovery must be managed by the owner. Never ask an agent to store
passwords, OTPs, passkeys, or recovery codes. Review account sessions, applications,
and repository access when onboarding/offboarding or investigating an incident.
