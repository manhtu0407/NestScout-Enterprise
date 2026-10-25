# Docker, Compose and Buildx

Tier A, selected for container/runtime readiness, build failures, storage attribution,
ports, lifecycle, multi-service diagnostics and local environment reproduction.
Use the vendor tools instead of a container manager written for this repository.
Supabase lifecycle stays with [the existing executor](supabase.md).

## Provenance and bootstrap

Docker/Moby CLI and Engine, Compose and Buildx/BuildKit are separate components.
Their upstream sources are [Moby](https://github.com/moby/moby),
[CLI](https://github.com/docker/cli), [Compose](https://github.com/docker/compose)
and [Buildx](https://github.com/docker/buildx), under Apache-2.0 licenses.
[Docker Desktop](https://docs.docker.com/subscription/desktop-license/) has separate
subscription terms; verify organization eligibility before installation. No trial,
purchase, virtualization setting, Docker group or socket permission change is implied.

Host versions come from `docker --version`, `docker compose version` and
`docker buildx version`; no duplicate pin is stored here. Install through official
[Desktop Windows instructions](https://docs.docker.com/desktop/setup/install/windows-install/)
or [Engine Linux instructions](https://docs.docker.com/engine/install/), with explicit
host scope. Windows needs supported virtualization/WSL and Linux containers for the
provided smoke. Linux needs a reachable authorized socket. These host installs and
permission changes are approval-sensitive. Doctor supports Windows/Linux x64;
macOS/other architectures are not verified by this repository. Downloads/updates
cost bandwidth/disk, a running VM consumes RAM, and builds use shared disk cache.

## Complete native discovery

Inspect `docker --help`, `docker <namespace> --help`, `docker <namespace> <command>
--help`, `docker compose --help` and `docker buildx --help` on the installed version.
Use [CLI](https://docs.docker.com/reference/cli/docker/),
[Compose](https://docs.docker.com/reference/cli/docker/compose/) and
[Buildx](https://docs.docker.com/reference/cli/docker/buildx/) references alongside
that help. This map does not restrict native command access:

| Domain | Families / examples | Invocation effects and prerequisite |
| --- | --- | --- |
| Client, daemon, target | `version`, `info`, `context ls/show/inspect` | Read-only; context/environment may select remote Engine |
| Target configuration | `context create/use/update/rm`, `login/logout` | Host config/credentials change; separate matched scope |
| Images | `image ls/inspect/history`, `pull/tag/save/load/rm`, `push` | Inspect read-only; pull/load/network/cache mutation; push is remote publish |
| Builds | `build`, `buildx version/ls/inspect/build/du/imagetools` | Read-only discovery versus cache/image mutation and possible registry access |
| Builder management | `buildx create/use/stop/rm/prune/bake` | Builder/context/cache mutation; inspect actual backend and task ownership |
| Containers | `container ls/create/start/stop/restart/rm/wait`, `run` | Lifecycle mutation requires owned resource and target |
| Debugging | `inspect`, `logs --tail`, `stats --no-stream`, `top`, `exec`, `events` | Logs/inspect may expose secrets; exec changes state depending on command; bound events duration |
| Networks | `network ls/inspect/create/connect/disconnect/rm` | Inspect first; shared networks may link unrelated services |
| Volumes/mounts | `volume ls/inspect/create/rm`, `run --mount` | Mounts grant host access; never mount host root/socket or remove unknown data |
| Compose model | `compose version/config/ls/ps/images`, `config --services/--profiles` | Read-only model/status; interpolated config can expose secrets |
| Compose lifecycle | `up/down/start/stop/restart/logs/exec/run/pull/build` | Project/file/target must be explicit; `down -v` removes data |
| Storage | `system df`, `system df -v`, `buildx du` | Read-only attribution before considering any cleanup |
| Cleanup | `builder prune`, `image prune`, `volume prune`, `system prune` | Broad shared deletion is not smoke cleanup; separate approval/recovery |
| Advanced | `manifest`, `plugin`, `swarm`, `service`, `secret`, `stack`, `scout`, `debug`, `mcp` | Version/plugin/license/use-case dependent; discover with help, NOT APPLICABLE until justified |

New Buildx namespaces such as history/debug/policy may appear in newer versions;
help is authoritative. Do not infer installed support from current online docs.
Compose profiles are appropriate only when real services warrant them:
[profile reference](https://docs.docker.com/compose/how-tos/profiles/).
Compose's actual version is reported independently; do not assume a major number
from the phrase "Compose v2" or use the retired `docker-compose` standalone tool.

## Tier 0: read-only readiness

```sh
docker --version
docker version
docker info
docker context show
docker context ls
docker context inspect
docker compose version
docker buildx version
docker --help
docker compose --help
docker buildx --help
docker system df
npm run tools:doctor -- --tool docker
```

Inspect locally; retain only sanitized assertions. `--version` proves client
discovery. Engine availability requires both server version and info to succeed
against an inspected local endpoint. Plugin versions are independent probes.
Doctor omits raw context endpoint, host info, auth/log/env dumps. Run separate
`--tool compose` / `--tool buildx` probes for independent plugin results.
Remote TCP/SSH contexts and unknown targets are rejected for local smoke; even
loopback TCP is rejected because its owner is unproven. `DOCKER_CONTEXT` is accepted
when it matches an explicit requested context; a local `DOCKER_HOST` must match that
context's inspected socket/pipe. Conflicting case variants, TLS overrides and
`BUILDKIT_HOST` are rejected. An explicit non-current local context is supported:
every operation uses `--context`, without changing global selection.
No command here starts Docker Desktop, reconfigures a daemon or boots Supabase.

## Tier 1: owned offline smoke

First inspect available images and resources without pulling:

```sh
docker image ls
docker image inspect alpine:3 --format '{{.Id}} {{json .RepoDigests}}'
docker buildx inspect
```

EXAMPLE invocation: replace both values with the observed context and complete
immutable image ID. The command intentionally rejects a tag, missing image or
missing explicit context:

```text
npm run tools:smoke -- --context OBSERVED_LOCAL_CONTEXT --image sha256:EXISTING_LOCAL_IMAGE_ID
npm run tools:smoke -- --context OBSERVED_LOCAL_CONTEXT --image sha256:EXISTING_LOCAL_IMAGE_ID --builder INSPECTED_LOCAL_BUILDER
```

The approved task must permit local owned mutation. Inspect image provenance and
compatibility before selecting it; an image ID is immutable identity, not a signature
or a trust attestation. Prefer an already inspected small Alpine image with `/bin/sh`
and no declared volumes. No image exists? Report BLOCKED and request matched
network/supply approval before pulling. The runner never pulls or chooses an image
for the operator. It refuses non-Linux images and declared volumes.

The executor [tool-smoke.mjs](../../scripts/tool-smoke.mjs) checks context overrides,
socket/pipe, expected context, Linux Engine identity and memory/CPU. It requires the
named Buildx builder's driver to be `docker`, one running node and a proven local
endpoint. Node endpoints may be the selected context, its socket/pipe, or another
local context/socket reporting the same Engine ID. Different-Engine, remote,
unknown and multi-node builders are rejected. Builders using other drivers remain
discoverable but this offline smoke reports BLOCKED for them: bootstrapping a
`docker-container` builder could create a shared BuildKit container or pull images.
It does not bootstrap, switch or create builders. Unknown builder output fails
closed. At least 256 MiB host free/Engine allocated memory is required;
that guard does not guarantee resource availability under concurrent activity.

`--builder` or a matching child `BUILDX_BUILDER` can select an existing builder;
conflicting explicit/environment names are rejected. The builder is inspected again
immediately before build. Context-backed Docker builders use their own context for
the build invocation, after local socket/Engine equivalence is rechecked. This
supports native Buildx's special `default` builder without redirecting other task
operations or modifying user/global context settings. Local socket identity probes
strip ambient host/context selectors only from that child process.

It creates one unique OS temp directory, verifies Compose's synthetic model with
`config --services`, and runs a network-disabled `FROM scratch` COPY build through
that explicit builder. Build output is loaded to a uniquely labeled task image.
This verifies Buildx build/load without base downloads or running build instructions.
The Compose lifecycle is synthetic; no real product integration is demonstrated.

The container uses the operator-selected local immutable image, `--pull never`,
network none, read-only root, UID/GID 65534, no capabilities, no-new-privileges,
32 PID / 32 MiB / 0.25 CPU limits and no host mounts, ports or secrets. Its entrypoint
only prints an exact marker. Inspect must observe exit 0, stopped state and marker.
The same constraints are applied to a second uniquely labeled container through
Compose `up --pull never --no-build --abort-on-container-exit --exit-code-from smoke`.
Its exact output and stopped/exit state are inspected independently. No project
network or volume is created (`network_mode: none`); cleanup uses explicit ownership
and ID checks rather than `compose down`.
Commands have bounded output and timeouts (build 60 seconds; Compose lifecycle
30 seconds; other calls 15 seconds).

Cleanup inspects the exact task name/tag, confirms full object ID and ownership
label (plus exact container name), then removes only that ID. Context and endpoint
are rechecked before each mutation, including cleanup. Endpoint changes, ownership
mismatch or inspection failure prevent removal; failed cleanup remains FAIL with
the unique task name for recovery. No network/volume is created, so none is removed.
Container timeout recovery may force-remove only its verified owned container.
The temp directory is removed only after canonical-parent/symlink checks. A failed
smoke remains failed even if cleanup succeeds.

BuildKit may retain small shared cache for the scratch build. It is intentionally
not pruned because cache records lack the same safe per-task deletion contract.
Report `docker system df` before/after when measuring disk cost. Do not interpret
successful image cleanup as proof of zero shared cache bytes or zero concurrent
host activity. Docker socket access itself is high privilege: see
[Engine security](https://docs.docker.com/engine/security/). Rechecking context is a
local guard, not protection against a malicious administrator replacing a socket
between calls. No process should concurrently reconfigure the selected context.

## Workflows and failure routing

The installed help helper supports `docker container logs`, `docker container
stats`, `compose config` and `buildx du`, among other families. It only obtains
help. Run actual diagnostics against an inspected explicit context. These native
examples extend selection beyond the smoke's lifecycle:

```text
docker --context OBSERVED_LOCAL_CONTEXT container ls --all
docker --context OBSERVED_LOCAL_CONTEXT image ls --digests
docker --context OBSERVED_LOCAL_CONTEXT system df
docker --context OBSERVED_LOCAL_CONTEXT buildx ls
docker --context OBSERVED_LOCAL_CONTEXT buildx inspect INSPECTED_LOCAL_BUILDER
docker --context OBSERVED_LOCAL_CONTEXT buildx du --builder INSPECTED_LOCAL_BUILDER
docker --context OBSERVED_LOCAL_CONTEXT network ls
docker --context OBSERVED_LOCAL_CONTEXT volume ls
docker --context OBSERVED_LOCAL_CONTEXT compose --file OWNED_FILE --project-name OWNED_PROJECT config --services
docker --context OBSERVED_LOCAL_CONTEXT compose --file OWNED_FILE --project-name OWNED_PROJECT config --profiles
```

Compose profiles are reported by `config --profiles`, not a `compose profiles`
subcommand. Use `container logs --tail 100 ID`, `container stats --no-stream ID`,
selective inspect formats and bounded `events --since ... --until ...` only for
approved targets; logs/config can contain secrets. On Windows use
`Get-NetTCPConnection -State Listen` to identify port owners without killing them;
on Linux inspect `ss -ltnp` where available. No custom port or disk scanner is needed.

Docker supports `docker`, `docker-container`, `remote`, `cloud` and `kubernetes`
[Buildx drivers](https://docs.docker.com/build/builders/drivers/). The V1 offline
smoke deliberately exercises only an inspected local embedded `docker` builder;
that limit does not describe Docker's broader support. `docker-container` may
need a BuildKit image pull and creates daemon resources; remote/cloud/kubernetes
targets require separate identity and authority. No driver conversion is automatic.

Image digests identify content; use selective `image inspect`/`history`, while
`buildx imagetools` and provenance lookup may contact registries. Snapshot planning
distinguishes image `save/load`, container writable layers, mounted volumes and
database-consistent dumps. An image archive does not back up a database volume.
Restoration needs an inspected owned target and recovery verification; no broad
Compose teardown or shared cache prune occurs. GPU use needs actual driver,
runtime/toolkit and device evidence; GPU execution is NOT RUN in this foundation.

| Observed failure | Read-only inspection | Focused recovery and validation |
| --- | --- | --- |
| Client exists, Engine fails | `version`, `context ls/inspect`, `info` | Report NO_DAEMON, wrong context or permission; owner handles shared daemon startup |
| Wrong context / overrides | `context show/inspect`; inspect override names without printing values | Select authorized local target per invocation; no global `context use` by inference |
| Port collision | `container ls`, `compose ps`, OS port listing | Choose task port or obtain authority before disrupting existing service |
| Early container exit | `container ls -a`, `logs --tail 100`, selective `inspect` | Repair owned image/config; rerun bounded command, retain original exit |
| Compose model error | `compose --file FILE config` | Fix owning model; never replace the Supabase stack |
| Build failure | `buildx version/inspect`, bounded build logs, Hadolint if available | Repair Dockerfile/context; no cache-prune retry |
| Disk pressure | `system df -v`, `buildx du` | Attribute ownership; separate approval for shared reclaim |
| Smoke cleanup failure | Inspect the reported exact task name/tag and label | Resolve target/ownership first; never sweep a name prefix |

EXAMPLES only, when a real Dockerfile and compatible owned image exist:

```sh
docker build -t nestscout/example:local .
docker run -d --name nestscout-example --publish 127.0.0.1:8000:8000 nestscout/example:local
docker logs --tail 100 nestscout-example
docker stats --no-stream nestscout-example
```

`--name` names a container; `-p`/`--publish` maps ports. Do not copy invalid `-n`
port examples. GPU flags depend on verified host/runtime support. Real Compose
operations need an inspected file and explicit project/context; this library
creates no product Compose project. Product integration and native iOS evidence
remain NOT RUN until those real consumers exist.
