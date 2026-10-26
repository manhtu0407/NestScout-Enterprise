# QA02 evidence readiness and benchmark audit

Date: 2026-10-26. Starting revision:
`e977bd0e77d0e5c8750e537dda00c551e6ddc365`, branch
`codex/skill-research-batch-a-20261026` in `manhtu0407/NestScout-Enterprise`,
ID `1432052547`. Actual checkout: the repository root resolved by `git rev-parse --show-toplevel`.
Both origins and npm run identity matched. The Desktop path supplied by the app
is not the Git checkout. This record is under the sole root policy and existing
[SRES procedure](skill-research-evaluation-standard.md), not another policy.

**Readiness preparation only. No new scored model session, QA02 package, R4
comparison, skill-necessity verdict or independent human approval is claimed.**
The [v2 protocol](qa-impact-review-r3-v2-protocol.md) preregisters the next baseline;
the original v1 protocol, pack, results and raw evidence remain untouched.

## R3-v1 integrity and limitations audit

The original manifest SHA-256 still equals
`b458bfa88ead7714749ec62eefd71b4b47220ba30b14e68f6cded38964b5935c`;
all **156** listed files match their original hashes. The seal remains
`21ae828ff2c5e44b3c6ebc21be6d486d70e54dcb0a37b8e7af61982ee5892e7f`.
Fresh verifyEvaluation checks also passed on **10/10** retained original
checkout/peer snapshots. A new source-pack-only replay of the unchanged nominal
smoke passed on both arms, **20/20**. These do not rewrite v1's observed outcomes
or repair its missing preflight retrospectively.

| Limitation | Evidence checked now | Consequence |
| --- | --- | --- |
| Ceiling effect | v1 final answers replay to TP 4/FN 0, FP 0/TN 4; only three tiny defect families, one repeated | No measured residual outcome gap; no QA02 necessity or benefit inference |
| Sixteen nonzero exits | Derive command events from JSONL rather than trusting trace-audit.json; match starts/completions by ID | 13 probe TypeErrors, 2 Git NUL failures, 1 missing-path bundle; recoveries remain visible |
| PowerShell bundle exits | Native controlled exit-7 probe returns 0 with a trailing successful Write-Output, 7 when captured/propagated | Shell exit is not every subcommand's exit; missing constituent status stays unknown |
| Masked Git failures | v1 C04 item_7 and C06 item_13 print fatal NUL errors despite bundle exit 0; native reproduction confirms the mechanism | Do not call the entire verification sequence clean; preserve final model disclosures and evaluator preservation separately |
| Missing base smoke preflight | Original prepare.mjs executes head smoke only; original post-run record has both arms, 20/20 | Late coverage cannot establish before-run qualification; v2 requires both arms before any session |
| Reproducibility | v1 pack stores source strings but preparation/dispatch/grading live only in ignored evidence; uses current copies, temporary paths and uncontrolled commit dates | Source-level witnesses/smoke are reconstructible; exact execution context and provenance still depend on local custody |

The 16 entries by case/item are C01 item_6/7/8; C05 item_5;
C06 item_5/7/8/9; C08 item_2; C09 item_7/8/9/10/16; C10 item_5/6.
The two nonzero NUL bundles are C01 item_6 and C09 item_16. C08's bundle
contains both a missing package.json read and missing test/test-directory searches;
it is one nonzero shell event, not one underlying diagnostic.

There are 73 unique command starts and 73 matching completions, with commands and
numeric exits retained. Completion order differs from start order; pairing by
array position would be incorrect. The exporter flags zero-exit diagnostics for
review, but its regex is not an exhaustive error parser. A warning about an
inaccessible global ignore file is not automatically a failed required check;
inspect each actual command and output rather than treating all matches alike.

Native qualification in `.cache/qa02-runtime-qualification/qualification.json`
observed Node 24.19.0 and recorded the installed PowerShell version:

- Direct JSON object argv: exit 0; deliberately double-encoded JSON string: exit 1
  with the same undefined-property TypeError family. This establishes a plausible
  input-shape mechanism, **not the exact original Codex/PowerShell transport cause**.
  Original traces lack the process argv received by Node; do not assert a fully
  isolated serialization root cause or blame a review skill.
- Native Node process exit 7; trailing-success PowerShell bundle exit 0;
  captured/propagated exit 7. All subprocess outputs are retained.
- Git core.excludesFile=NUL status: native exit 128 and fatal diagnostic;
  same command followed by Write-Output: bundle exit 0 with the fatal text.
  Original Codex bundles reported their own exits (including 1); do not substitute
  native 128 for those observed values.

No model was called to reproduce these shell mechanisms. This qualification is
outside the Codex read-only sandbox and does not attest sandbox argument transport,
future runtime loading, provider routing or writable-session safety.

## Sanitized evidence export method

[qa-impact-review-evidence.mjs](../scripts/qa-impact-review-evidence.mjs) is a
bounded export/audit utility, not a model evaluator. The hardening section below
supersedes the historical export mechanics and package digest. From the delivery checkout:

```sh
node scripts/qa-impact-review-evidence.mjs export-v1 ABSOLUTE_PRIVATE_MAPPING_JSON
node scripts/qa-impact-review-evidence.mjs audit-v1 ABSOLUTE_SANITIZED_DIRECTORY TRUSTED_MANIFEST_SHA256
```

Export requires the retained `.cache/qa02-r3/`, the post-run smoke record, pinned
Git objects, and the existing Gitleaks 8.30.1 binary. Audit requires only the
sanitized directory, delivery code, pinned v1 source pack, Node and Git; it never
reads the raw directory. Neither command uploads, sends messages, changes auth,
executes commands from traces or runs a model. Do not execute exported legacy
dispatch/preparation helpers: they are evidence to inspect, not review commands.

The original exporter first verified the hard-coded original manifest digest and all 156
regular files; absent/modified/nonregular inputs stop the export. It makes a new
owned ignored output directory, never overwrites or edits the raw one. JSON and
JSONL are decoded before string transformation. All event types, order, item IDs,
commands, outputs, numeric exits, final answers, manual labels and helper source
are retained. JSON whitespace/escaping is normalized. The only transformations
are explicitly mapped user-home prefixes (including short/URL forms), fixture
directory identifiers and ephemeral thread identifiers. Replacements are stable
tokens, with replacement counts in the manifest; an unknown Windows user path
stops the export. Relative file/consumer paths and behavior-bearing text survive.

The original package contains all 156 transformed files plus raw-hashes.json (the original
manifest bytes), commands-derived.json and post-run-smoke.json: **159 hashed
payload files**, plus sanitized-manifest.json itself. The last supplement is
explicitly outside the original 156-file manifest/seal and has its own original
digest. The manifest records original provenance, every sanitized hash, mapping
counts and scanner result. The raw-to-sanitized mapping and original file digests
are links for a custodian to compare, not a cryptographic proof that an independent
recipient has seen authentic unredacted execution.

The native scanner runs with redaction and must exit 0; no scanner exclusions,
weakened assertions or automatic success substitution are added. Arbitrary secret
formats or sensitive prose may evade it. **Human privacy/content review remains
REQUIRED BEFORE SHARING**, explicitly recorded in the package. If it finds a secret,
stop distribution, handle it under the existing security procedure and use a new
versioned redaction rule/export. Do not delete commands, failure outputs or a case
to obtain a clean package. No evidence package or raw log is committed here.

Before hardening, two exports produced the same sanitized manifest SHA-256:
`553cb633e101ed9c7bb803899ab09a93be6d93b3be9c662ff1533ac67e06020c`.
The first is retained at
`.cache/qa02-r3-sanitized-M18zh6/`;
the second at `.cache/qa02-r3-sanitized-aFfPWE/`.
Both audits validated all 159 payload hashes, derived 73 commands/16 nonzero exits
and replayed all four final defect witnesses from the pinned pack, without
consulting trace-audit.json's PASS labels. The final audit also reconstructs all
ten reference case comparisons and twenty base/head smoke executions directly
from the pinned pack, without raw helper scripts or original temp fixtures.
A tampered disposable copy failed with
exit 1 at C01/trace.jsonl's integrity check. Original exports/raw evidence were
preserved. Export provenance/results are in `.cache/qa02-independent-export.json`
and `.cache/qa02-export-reconstruction.json`.

## Independent review handoff and evidence boundaries

A reviewer can start at the delivery commit and compare the package manifest hash
with this record, audit every payload hash, recompute command/exits from complete
JSONL, and replay findings against the fixed source pack. Then inspect complete
commands, stdout/stderr, final answers, prompts and the frozen protocol; challenge
consumer/impact claims, false positives, negative-task expansion, missing events,
masked errors, grading decisions and redaction semantics. Record agreement,
disagreement and unavailable evidence per case. An audit exit 0 proves its narrow
assertions, not every manual process/safety decision or reviewer approval.

| Assertion | Independently checkable from source/sanitized package | Remaining dependency |
| --- | --- | --- |
| Changed source, contracts, v1 witnesses and v2 mutations | Immutable Git source and deterministic replay/preparation | Source retrieval and trusted delivery revision |
| Observed command text/order, final process exits and four findings | Complete sanitized traces and replay, separate from model assertions/old PASS labels | Authenticity of the original captured stream and trustworthy redaction custody |
| Original raw bytes, original seal ordering and exact invocation paths | Original hashes are supplied | Raw local evidence/custodian comparison; no independent attestation or signed timestamp |
| v1 preservation | Hashed snapshot/baseline records are exported | Live verifyEvaluation also requires retained original temp fixtures; current fresh 10/10 result is implementer-run |
| Constituent PowerShell exits | Some are observable, errors remain visible | Unrecorded constituent exits cannot be recovered from shell exit 0 |
| Independence and safety | Reviewer can challenge artifacts without model statements | Independent human review, privacy approval, hidden/transient external effects and complete runtime inventory remain NOT VERIFIED |

The new mechanical checks are independent of the model's claims and old summary
grader, but were written/run by the same implementer. No separate human or model
reviewer was dispatched. Sharing has not occurred; no recipient access, review
agreement or privacy approval is invented. Files retained only in ignored local
storage are not durable remote evidence. Supply the reviewed sanitized directory
through an owner-authorized channel for actual independent review; the public
repository carries the method and design, not raw/private payloads.

## V2 preparation and delivery checks

The [case adapter](../scripts/qa-impact-review-benchmark.mjs) reuses the existing
harness and guards their exact source hashes. The [case pack](../scripts/fixtures/qa-impact-review-r3-v2.json)
contains twelve preregistered cases and the response schema. Source pin, prompts,
oracles, allowed observations, prohibited actions, TP/FP/negative/dispute handling
and the runtime proposal are defined before any scored result. Cases use actual
repository modules; no application, external service or dependency is introduced.

Final adapter execution returned exit 0 on Windows/Node 24.19.0:

- Two reconstructions of twelve cases: **24/24** checkout/peer preservation checks,
  equal logical fingerprints and exact review base/head commits between rounds.
- **48/48** oracle processes and **48/48** base/head nominal smoke processes
  completed with exit 0; evaluator assertions confirmed the registered differing
  genuine outputs and equivalent benign/negative outputs. These are successful
  measurements of intentionally broken variants, not claims that those variants
  are correct. Source tracked bytes, HEAD/refs/index/status remained unchanged.
- **Zero scored model sessions**; all twelve model outcomes remain NOT RUN.
- Final adapter SHA-256:
  `963b7b29eb54d10049e5a07cc7f2e519d6fbe0b37b43de3aabc80f501f6c691d`;
  pack SHA-256:
  `a691142537a6497c6f07d54e33f5d338bc15d2eaf7f15135a39c3a8c8aee8d74`.
- Local preparation record:
  `.cache/qa02-r3-v2-preparation-gpkyGn/preparation.json`, SHA-256
  `2126f9f404d71e00cb346e795c91abd7af9e14238430328ac77b240aa1ebf477`.
  It includes both rounds, temp paths, actual probe outputs/exits, refs, physical
  snapshot hashes and preservation results. Summary/stderr:
  `.cache/qa02-v2-final-preparation.json` and
  `.cache/qa02-v2-final-preparation.stderr.log` (empty).

These are fixture qualification, never model outcome or skill-effectiveness scores.
The staged/working sentinel in the snapshot family is a JSON record with an
invalid/valid marker; the measured defect is loss of the index API representation.
It is not an executed YAML/skill validation bypass. Those downstream filters and
per-state consumers are source-inspected only, an explicit remaining coverage limit.

Required local checks returned exit 0: npm run check, including foundation
**63/63**, and npm run verify:negative, including **83/83**. Logs:
`.cache/qa02-readiness-check.log` and `.cache/qa02-readiness-negative.log`.
Final native Gitleaks 8.30.1 scan over the complete sanitized package also returned
exit 0, no leaks; `.cache/qa02-sanitized-final-scan.log`. The method's actual
export/audit, deterministic replays, tamper rejection, two-round preparation and
native shell probes exercise the new utilities without a new test framework or
manifest change. Ordinary Git hooks remain enabled.

The controlled diff adds only this audit, the v2 protocol/pack and two bounded
task utilities. Existing v1/research/foundation, harness/shared helpers, protected
root files/configurations, dependencies and installed skills remain unchanged.
No PR, hosted CI, merge, deployment, authentication change or evidence upload
was performed. Separate independent human/content review remains pending.

Preliminary preparation failures were retained, not accepted as readiness passes:
the first smoke compared Windows short and canonical long path spellings; it was
corrected to assert the canonical parent path. A later exploratory two-round run
reached the final source-preservation check and correctly rejected concurrent
addition of this task's protocol document. The final run must use unchanged input
bytes and complete preservation checks. No scored output existed before these
preparation corrections.

Before scored runs: finish independent review/privacy handoff, review unresolved
limitations and obtain owner authorization, confirm the proposed runtime/access
without changing authentication/settings, freeze a committed run seal and perform
both-arm preflight in fresh fixtures. A changed environment or substantive design
revision requires explicit versioning. Do not reuse old outcomes as evidence that
QA02 is necessary, effective or ready for R4.

## Export hardening after independent design review

Starting commit: `9580020be2293ce1e6a9da0d21d5203767dcbc68` on the same
feature branch. This section supersedes the export instructions and package
identity above; earlier exports remain historical local artifacts. No R3-v1
protocol, fixture, result, trace or seal was rewritten. The R3-v2 protocol, pack,
case adapter, labels, oracles and scoring criteria are byte-identical to that
commit. There are still zero R3-v2 scored sessions and no QA02 package or R4 run.

### Path and sanitization boundary

The former reader checked only each final file for a symlink; an ancestor
junction could redirect it. Its lexical member check also lacked a portable
Windows alias boundary, and unvalidated case.out paths selected metadata reads.
The former sanitizer embedded the operator's Windows profile identifiers.
These are verified implementation weaknesses, not evidence of an observed leak.

The hardened reader walks every component from the filesystem anchor before
opening a file, including the supplied package root and its ancestors. It rejects
symlinks/junctions, nonregular files, lexical dot traversal, network/device paths,
alternate data streams and ambiguous Windows components. Manifest members have
a restricted portable grammar; case aliases and unlisted payloads are rejected.
Reads check the opened descriptor against the inspected inode/device and use
O_NOFOLLOW where supported. Mapping files, raw manifest/payloads, supplements,
sanitized manifest/payloads and output parents use the same checks. Outputs use
exclusive creation beneath a fresh task-owned directory. Case metadata paths and
traced commands are text only; the utility never follows or executes them.

Supply an absolute path to a private task-local JSON file outside tracked source:

```json
{
  "profilePrefixes": [
    "D:/Users/Synthetic Reviewer",
    "D:/Users/SYNTHR~1"
  ]
}
```

These are synthetic examples. The custodian supplies exact long/short aliases
observed in the sealed evidence; the utility does not infer identity from the
reviewer's current profile. No private mapping values or mapping file digest are
published in the package. Spaces, URL spaces, slash spellings and doubled
backslashes are handled by the declared mappings. Unknown conventional profile
paths, unsupported encoded path separators, surviving mapped identity labels,
duplicate mappings and sanitized object-key collisions stop export. All private
path validation finishes before an output directory is created. No command,
event, numeric exit, finding or reproduction record is filtered out.

The two personal absolute paths in this document were replaced with repository
relative locations. Review of the other new protocol/pack/adapter found no
personal profile path or email requiring alteration; the fixture email uses the
reserved example.invalid domain. Existing GitHub repository identifiers remain
necessary source provenance. Historical commits and frozen R3-v1 retain their
original bytes; their past profile references were not removed from history.

### Integrity, isolated audit and actual exits

The hardened format is QA02-v1-export-v2. Audit now requires the expected
sanitized-manifest SHA-256 received from a trusted handoff record before parsing
member paths. It checks the pinned original manifest bytes, exact 159-payload
inventory and every digest, complete 156-file raw/sanitized hash linkage, and
the command ledger against the complete JSONL streams. Export also recomputes
every transformation from sealed raw bytes, compares the actual output bytes,
and verifies raw/supplement preservation. These comparisons establish what this
custodian transformed; they do not independently authenticate the original run.

Two hardened exports returned exit 0 and the same manifest digest:
`055b58ec3650b5e7d27e82e338a4df43c54a5745edc5097fe9ec2dcc1fa0d26a`.
The first is `.cache/qa02-r3-sanitized-IxRlQD/`. The complete package, including
the final manifest, passed native Gitleaks 8.30.1 with exit 0. The private mapping
file and all raw execution logs remain outside Git.
All 159 sanitized payload digests also match the historical M18zh6 export: the
new task-local sanitizer changes no payload bytes. Replacement counts remain
583 home prefixes, 234 fixture identifiers and 10 thread identifiers; only the
manifest format/integrity metadata changes.

An isolated local Git clone checked out 9580020, with only the hardened evidence
utility overlaid for this check. It contained the pinned source objects and no
raw evidence, private mapping file or node_modules. A copied package was audited
from an external temporary directory twice, both exit 0: 159 payloads, 73 command
events, 16 nonzero exits (13 TypeErrors, 2 NUL failures, 1 missing-path bundle),
4 reproduced findings, 10 source-reference comparisons and 20 smoke arms.
This demonstrates independence from the custodian's raw directory, not an
independent person's review. The final committed utility can be used directly
from a fresh checkout for the same audit command.

| Executed negative scenario | Raw process exit | Observed refusal |
| --- | --- | --- |
| Append bytes to C01 trace | 1 | Payload digest mismatch |
| Edit manifest but retain trusted digest | 1 | Manifest digest mismatch |
| Remove a payload | 1 | Exact directory inventory mismatch |
| Add an unlisted payload | 1 | Exact directory inventory mismatch |
| Alter raw-to-sanitized hash link and recompute package digest | 1 | Mapping mismatch |
| Edit command ledger and recompute its/package digests | 1 | Re-derived command ledger mismatch |
| Add traversal member and recompute package digest | 1 | Unsafe relative path |
| Supply unrelated profile mappings | 1 | Unmapped identity; no output directory created |

These eight disposable mutations left the genuine package untouched; its second
audit succeeded. Persistent regressions were added to the existing selected
check-verification.test.mjs, requiring no manifest or runner change. Four evidence
test groups ran three consecutive times: all four passed each time, runner exits
0/0/0, no skips. They exercise actual Windows junctions at package/ancestor/leaf
and mapping-input boundaries, CLI rejection with exit 1, preserved outside
targets, traversal/ADS/device/alias members, trusted digest rejection, unknown
identities and preservation of behavior-bearing fields during replacement.

Raw logs and per-command argv/exits are retained under
`.cache/qa02-hardening-tZfZbQ/`: independent-results.json, export-final-1.json,
export-final-2.json, targeted-exits.json and preservation.json. Fresh preservation
checks matched all 156 original raw digests and the original manifest/seal;
verifyEvaluation passed all 10 retained original checkout/peer snapshots. All
Initially all 106 tracked files outside the first three-file diff matched 9580020
bytes. The first npm run check then returned exit 1: the donor-isolation test
still expected exactly 12 check-verification tests, while its child process
successfully ran all 16 after these four additions. Updating that single exact
count to 16 in git-environment.test.mjs is the fourth delivery file. Assertions
requiring child exit 0, zero failures/skips/cancellations/todos and unchanged
donor snapshots remain intact. No shared harness implementation changed.
The subsequent full-source comparison confirmed all 105 tracked files outside
the four-file delivery allow-list still match 9580020 byte for byte; record:
`.cache/qa02-hardening-tZfZbQ/source-preservation-final.json`.
After the exact-count correction, npm run check returned exit 0, including
foundation 63/63, and npm run verify:negative returned exit 0, 87/87 with no
skips. Final logs are `.cache/qa02-hardening-check.log` and
`.cache/qa02-hardening-negative.log`; the initial aggregate exit 1 is preserved
in `.cache/qa02-hardening-check-first.log`. Node syntax checks and git diff
--check also returned exit 0. No scanner or behavioral assertion was weakened.

### Retention decision and remaining handoff gates

Keep both utilities as bounded research artifacts for reproducing this dossier.
The evidence utility has an actual custodian/reviewer consumer and meaningful
regressions; it is not a general privacy sanitizer. The benchmark adapter has an
actual preparation consumer and pinned reproducibility evidence; it is not a
second evaluator. Neither should become an installed skill, production service,
stable general-purpose API or tool-library capability without a separate reviewed
need. No framework, registry, loader or dependency was added. Retaining their
source does not require retaining every temporary preparation directory forever;
raw research retention remains under the existing evaluation procedure.

Technical export/integrity/replay checks are satisfied for the identified package.
**Actual external handoff remains NOT READY pending human privacy/content review
and an owner-authorized delivery channel; nothing was sent.** Generic secret
scanning and path rules cannot prove absence of arbitrary personal prose or
unknown credential formats. The package explicitly retains REQUIRED BEFORE
SHARING. The recipient needs the trusted digest through the approved handoff,
the delivery source revision with pinned Git objects, Node 24 and the complete
sanitized directory; private mappings and original temp fixtures are unnecessary.

No adversarial concurrent-filesystem race qualification was run. Component
checks and descriptor verification reject static links and many replacements,
but portable Node lacks an atomic openat-style traversal guarantee for all
ancestors. Run against quiescent, access-controlled task-owned copies; hostile
concurrent ancestor replacement is outside the verified boundary. Windows is
the executed platform; Linux-specific behavior is not established here. Original
raw authenticity, manual safety grading, unrecorded PowerShell constituent exits
and independent human agreement retain the limitations documented above.
