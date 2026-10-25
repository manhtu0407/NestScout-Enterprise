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
Doctor distinguishes binary/version, task DB inspection, rules and unexecuted
scan status. It does not search peer caches or infer DB readiness from presence.
Smoke isolates config/cache in an owned temporary root, removes inherited proxy,
credential and Trivy target overrides, disables updates, and bounds subprocesses.
It checks a non-root Dockerfile (exit 0), root-user violation (exit 7), a synthetic
local Docker archive to CycloneDX (exit 0), and absent advisory DB rejection
(exit 1). It removes only its own cache/fixtures/output, including on failure.
These are synthetic tooling tests, not product/image vulnerability findings.
No advisory DB is downloaded by that smoke. Its missing-DB negative stays valid
even when another task has a prepared database.

## Opt-in advisory matching and offline replay

```sh
npm run tools:trivy:db -- prepare TASK
npm run tools:trivy:db -- scan TASK
npm run tools:trivy:db -- clean TASK
```

Choose a unique lowercase task ID, at most 48 characters. `prepare` is an explicit
network read from the official `ghcr.io/aquasecurity/trivy-db:2` OCI distribution,
including its HTTPS registry/token/blob delivery endpoints. It uses Trivy's native
download/validation, not a custom feed. No registry login, credential forwarding,
mirror, daemon or global cache is involved. Allow up to 180 seconds per process
(150-second native timeout), an 8 MiB captured-output ceiling and several GiB free
disk per task. The observed database was 1,636,610,048 bytes expanded; compression,
network time and future size vary. The 2 GiB accepted DB ceiling is checked after
the native download, not a streaming network quota. A failed download stays failed.

The existing path resolver selects the pinned engine. The advisory executor in
`scripts/advisory-workflows.mjs` owns `.cache/advisories/TASK`, records root/task
ownership, holds an exclusive operation lock across asynchronous work and rejects
linked ancestors/DB files. It never reaps a peer lock. Use a different task ID
instead of deleting a busy cache. Child HOME/config/temp locations are isolated;
inherited scanner, proxy, registry and credential overrides are removed.

Preparation returns `PREPARED_NOT_VERIFIED`: schema 2, finite ordered timestamps,
size, scanner version, DB SHA-256 and metadata digest form a snapshot seal. Scans
recheck that seal and execute the installed scanner against an immutable data-only
CycloneDX inventory of `lodash@4.17.20`. No vulnerable code is installed or run.
An observed `CVE-2021-23337` is required; totals can change with advisory snapshots.
Native JSON must include real package names/versions and findings consistent with
native exit 7. Summary exit 0 means the **fixture assertion** passed with findings,
not a safe artifact. Operational errors, invalid JSON, empty inventories and absent
DBs cannot become clean results. Raw JSON remains in the ignored owned directory.

`scan` performs no DB refresh, telemetry or dependency-resolution requests. It uses
the native `sbom` flags; `--skip-check-update` belongs to image/config and is not a
valid SBOM flag in the pinned release. Repeating `scan` demonstrates offline reuse
of that exact snapshot. `STALE_OFFLINE_SNAPSHOT` records expired NextUpdate honestly;
usable offline data does not establish current advisory freshness. Java/image
analysis has different prerequisites and is not proven by this npm SBOM fixture.

`clean` removes only this task's known data under its lock, retaining the ownership
record. Summaries distinguish retained evidence from completed cleanup. Preparation
and scanning are opt-in and excluded from the aggregate check and automatic CI.
The [official DB guide](https://trivy.dev/docs/v0.76/guide/configuration/db/) and
installed help own native syntax. No untrusted target or cache-path override is
accepted by this bounded fixture workflow; authorized native CLI use remains broad.

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
scanner for every change. Windows and native Linux evidence are recorded separately
in [setup evidence](../setup-evidence.md#engineering-tool-library-v3-2026-10-25).
Production artifact assurance remains NOT RUN.
