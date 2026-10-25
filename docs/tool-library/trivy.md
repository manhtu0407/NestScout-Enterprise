# Trivy

Use Trivy for image OS packages, Dockerfile/IaC misconfiguration and SBOMs.
Use the [canonical pin](../../scripts/tools.json), project-local installer and
path resolver; installation is opt-in: `npm run tools:install -- --tool trivy`.
No global PATH, registry login or advisory database download is automatic.

## Provenance and prerequisites

Upstream [release](https://github.com/aquasecurity/trivy/releases/tag/v0.76.1)
is Apache-2.0; Windows/Linux x64 archives and their exact SHA-256 were matched
against the official release checksums and GitHub asset digests on 2026-10-25.
The release also publishes Sigstore bundles; this installation verifies SHA-256,
not a Sigstore identity. Versions and hashes live only in the canonical pin file.
The installer rejects unsafe archive paths, links, duplicate members and missing
binary names before replacing an installed binary. Only the binary is extracted.
Trivy embeds configuration checks. Vulnerability scans additionally need the
advisory DB; Java analysis can require a separate Java index. Online preparation
consumes bandwidth/storage and must be deliberately targeted to an owned cache.

## Installed command discovery

`npm run tools:help -- trivy` obtains the real installed help. Append `image`,
`filesystem`, `config`, `rootfs`, `sbom` or `clean` for native subcommand help.
These help requests do not execute scans or cleanup. For all other installed
flags/subcommands, resolve `toolPath('trivy')` and consult native help directly.
The helper is an allowlisted convenience, not a universal executor or a limit on
native CLI capabilities. [Upstream CLI reference](https://trivy.dev/docs/latest/guide/references/configuration/cli/trivy/)
complements installed-version help.

| Task/family | Invocation effects and target | Evidence / failure |
| --- | --- | --- |
| `image --input <owned.tar>` | Reads owned local archive; no image pull required | Image parser result; bound archive size |
| `filesystem`, `rootfs` | Reads selected files; package resolution can need network | Select scanners explicitly; no product implied |
| `config` | Reads selected IaC/Dockerfile; writes cache/report | Embedded checks with `--skip-check-update` |
| `sbom` | Reads an existing SBOM for analysis | Advisory DB still required for vulnerability analysis |
| `image --format cyclonedx` / `spdx-json` | Generates owned output; CycloneDX defaults disable vulnerability scanning | SBOM is inventory, not a clean vulnerability result |
| `--severity`, `--exit-code`, `--format`, `--output` | Filter/classify output and preserve failure | Findings exit code differs from operational errors |
| `image --download-db-only --cache-dir <owned>` | External read + local cache mutation | Explicit opt-in; may be NETWORK_BLOCKED |
| `--skip-db-update`, `--offline-scan` | Prevent DB update / dependency API calls | Missing DB must fail, never mean zero findings |
| `clean` | Deletes selected cache data | Inspect help and exact owned cache; no global sweep |

## Repeatable operational verification

Run `npm run tools:doctor -- --tool trivy`, then `npm run tools:trivy:smoke`.
Doctor distinguishes binary/version, project DB metadata presence, rules and
unexecuted scan status. Metadata presence does not prove freshness or integrity.
Smoke isolates config/cache in an owned temporary root, removes inherited proxy,
credential and Trivy target overrides, disables updates, and bounds subprocesses.
It checks a non-root Dockerfile (exit 0), root-user violation (exit 7), a synthetic
local Docker archive to CycloneDX (exit 0), and absent advisory DB rejection
(exit 1). It removes only its own cache/fixtures/output, including on failure.
These are synthetic tooling tests, not product/image vulnerability findings.
No advisory DB is downloaded. Database-backed scans remain DATABASE_MISSING.

An execution policy restriction remains BLOCKED_HOST_POLICY. Download failures,
checksum mismatch, missing DB, unavailable rules and scan errors are separate
failures; inspect sanitized local evidence before retrying. Never change scanner
rules, host policy or exclusions just to obtain PASS.

## Select scanners by question

| Tool | Primary coverage | Overlap / limit |
| --- | --- | --- |
| Gitleaks | Staged blobs, working files and Git history secrets | Canonical secret gate; Trivy is not its replacement |
| OSV / npm audit | Ecosystem/lockfile vulnerability advisories | Network/host-policy constraints; no image OS proof |
| Trivy | Image OS packages, IaC, image inventory/SBOM | DB needed for advisories; optional secret coverage overlaps Gitleaks |
| Hadolint | Dockerfile construction and best practices | Complements Trivy configuration checks |

Run the scanner that answers the task. The library does not run every overlapping
scanner for every change. Windows execution is recorded separately from Linux
archive provenance and deterministic fixtures; no native Linux smoke is claimed.
