# Contributing to NestScout

## Receive and prepare work

Use the bug, feature, or task Issue Form. Describe the problem, intended behavior,
acceptance criteria, and verification. Keep credentials and personal data out of
Issues, screenshots, and logs. Report vulnerabilities using [SECURITY](SECURITY.md).

Use the private Project statuses: Backlog → Ready → In progress → In review → Done.
Priority is P0/P1/P2/P3; Size is XS/S/M/L/XL. P0 means an urgent incident; split XL
work before starting. The owner selects Ready work and resolves product decisions.
Assign work when starting; Ready requires testable acceptance criteria.

## Develop a change

Run the setup commands in the [development guide](docs/development-guide.md).
The root [AGENTS.md](AGENTS.md) is the sole repository-wide engineering policy for
Codex and Claude Code. This document provides human contribution procedures.
Never commit environment secrets, signing files, build output, or dependency folders.
When a stack is selected, add a sanitized `.env.example` containing names and dummy
values only, plus actual setup/build/test commands and supported runtime versions.

```sh
npm run identity
git switch main
git pull --ff-only origin main
git switch -c feat/123-short-description
```

Use that switch/pull sequence only from a clean, coordinated checkout. With pending
or concurrent work, fetch and create a separate task worktree from `origin/main`.
For coding agents, the root policy's operation-specific authorization still applies
to PRs, hosted CI, merges and releases in the human workflow below.

Use `feat/`, `fix/`, `docs/`, or `chore/` plus a positive Issue number and lowercase
kebab-case description. Agent task branches may use `codex/<kebab-name>` or
`claude/<kebab-name>`; this does not grant remote-write authority. Keep commits
focused; use `type(scope): outcome` (scope optional), at most 100 characters.
Accepted types are `feat`, `fix`, `docs`, `chore`, `test`, `refactor`, `perf`, `build`,
`ci`, and `revert`, with optional `!` for a breaking change. Ordinary Git merge
commits with multiple parents and complete Git revert messages are supported.
Preserve unrelated local work; do not reset or clean another person's changes.

Run `npm run check` and `npm run verify:negative`. Explain any check not applicable
to the change. Add meaningful application tests when the application exists.

## File and review workflow

The root policy defines authority; these are the current checker's input formats.
New files need a real implementation or verification consumer and one responsibility
in the existing module. Do not add a source file merely to split a short function.

| Existing category | Naming accepted by `check:hygiene` |
| --- | --- |
| Node ESM tooling and tests | `scripts/<kebab-name>.mjs`, optional `.test`, `.spec`, `.integration.test`, `.integration.spec` suffix; lowercase kebab directories |
| Tool data | `scripts/<kebab-name>.json` in lowercase kebab directories |
| Technical documentation | `docs/<kebab-name>.md`; dotted technical names such as `claude.architecture.md` remain valid |
| Mobile application | `apps/mobile/{package,app,tsconfig}.json`, `eslint.config.mjs`, `.env.example`; `apps/mobile/src/**/<kebab-name>[.test].ts[x]`; routes `apps/mobile/src/app/**/<kebab-name>.tsx`, `_layout.tsx` and `(group)` directories only under `src/app` |
| Mobile visual assets | `apps/mobile/assets/feature/semantic-purpose.ext` (PNG, JPEG, WebP or JSON); lowercase kebab-case, no standalone numeric or temporary/revision labels |
| Empty process folder | `docs/processes/.gitkeep`, exactly 0 bytes; nothing else may live in `docs/processes/` |
| Workflows and Issue Forms | `.github/workflows/<kebab-name>.yml`, `.github/ISSUE_TEMPLATE/<kebab-name>.yml` |
| Supabase migrations | `supabase/migrations/<14-digit-timestamp>_<snake_case_name>.sql` |
| Database tests | `supabase/tests/database/<kebab-name>.test.sql`, optionally in kebab directories |
| Required and generated names | Exact paths in `scripts/check-hygiene.mjs`, including root policy/docs/configs, hooks, `database.types.ts` and `supabase.lock` |
| Legal/contributor records and skills | Exact conventional basenames such as `LICENSE`, `NOTICE`, `AUTHORS`, `CONTRIBUTORS.md`, module `README.md`, and `.agents/skills/<kebab-name>/SKILL.md` or `.claude/skills/<kebab-name>/SKILL.md`; skills also accept one-level `references/<kebab-name>.md` with ownership and link validation |

Case aliases, unknown categories, and document/source basenames beginning with
`todo`, `notes`, `plan`, `report`, `handoff`, `session-summary`, `debug`, or `scratch`
as a complete hyphen/dot-delimited prefix are rejected. Existing required names are
exact exemptions, not folder-wide exclusions. For a genuinely required new framework
filename, generated artifact, fixture format, dependency snapshot or module convention,
review its purpose and add the smallest tested path rule in the same change. There
is no naming policy for application modules beyond the rows above; native folders,
extra configuration files and other services need their own reviewed rules.

Name mobile assets by their function, not their origin or revision. Identify the owning
feature, choose the shortest unambiguous responsibility, use lowercase kebab-case,
remove export and revision labels, check for collisions and semantic duplicates, and
confirm the name remains meaningful after a redesign. Keep one canonical asset per
visual responsibility; density variants are not part of this convention. The checker
rejects revision and density labels, standalone numbers, temporary words, unsupported
formats, duplicate names across extensions and unsafe paths, and validates
image signatures. Semantic suitability and duplicate artwork require human review.

Disposable evidence belongs in ignored task-owned `.cache/` directories or outside
the checkout. Forced staging still fails. Permanent PDF/ZIP input is accepted only
at `docs/artifacts/<kebab-name>.pdf` or `.zip`, registered in the existing
`package.json` under `repositoryHygiene.artifacts`. Each entry needs `path`,
`sha256` (lowercase SHA-256), `purpose`, and `source`; register only actual approved
artifacts. Blobs must fit the checker's 32 MiB read limit; retain larger inputs
outside Git. Both index and working manifests must match their own bytes. Review
licensing, provenance and publication authority; a hash cannot establish them.
The reader caps each index/working snapshot at 128 MiB (unique blobs for the index).

The owner-approved logo `docs/assets/nestscout-horizon-logo-light.png` is the unchanged
`04_android/play_store_512x512.png` from the owner-supplied
`NestScout_Horizon_Restored_Asset_Pack_v1.zip` (archive SHA-256
`d845aa9bf8795ff8ab7f57c17edd29a05fe6e7ba558c80c0d2ede25d0ee65064`). `check:hygiene`
pins the file to SHA-256 `b4dbdd2eb0c742e36f61b41f87744f32f709cbdfc4441c93f17a494a87fde446`
in the index and working tree; replacing it needs the owner's approval of a new asset.

Artifact inspection never rewrites inputs or extracts archive paths to disk. Supported
PDFs use classic xref tables, one trailer and an Info dictionary. Title/Author strings
are decoded from literal/hex strings and indirect references, including octal escapes,
escaped names and BOM-marked Unicode. Factual human names remain accepted. Encryption,
incremental histories, object/xref streams, XMP, embedded files, indirect stream lengths
and unsupported metadata encodings fail closed for separate parser/review work.
This is a bounded metadata check, not a complete PDF validator, renderer, OCR or proof
of authorship. Page text, graphics, custom metadata and legal/provenance truth still
need review; a tool named in Creator/Producer is not automatically an authorship claim.

ZIP32 supports stored/deflated entries and data descriptors, with at most 1,000 entries,
8 MiB per expanded entry and 32 MiB total expansion. Local/central headers, sizes, CRCs,
non-overlap, safe paths, file/directory collisions, case aliases and symlink modes are
checked. UTF-8 text entries use the existing signature/comment rules; embedded PDFs
receive the metadata check. ZIP comments are checked, and Gitleaks scans one archive
level in index/history/working scans. Nested archives, encryption, ZIP64, alternate
Unicode path/comment fields, unsupported binary/entry formats and misleading PDF/ZIP
extensions fail closed. Only timestamp and Unix UID/GID extra fields are accepted.
No malware, image-content or complete encoded-secret claim
is made. Unsupported owner inputs need a reviewed compatible inspection path; do not
strip metadata, rewrite archives or bypass checks to make them pass.

`check:hygiene` inspects resolved regular index blobs and tracked/unignored working
files separately, including renamed and force-added files. JavaScript comments are
parsed with Acorn so test strings and regular expressions are not treated as comments.
TypeScript (`.ts`, `.mts`, `.cts`, declarations and `.tsx`) uses the pinned compiler's
native syntax tree to exclude literal/JSX text spans, then its scanner to collect
inline and multiline comments, including comments inside type-only declarations.
This does not expand the approved repository filename categories. SQL, YAML, TOML,
JSONC and the `.githooks/` shell scripts use lexical comment scanners that skip quoted
text, dollar-quoted delimiters, block scalars and URL fragments (YAML uses the `yaml`
parser's syntax tree). JSON files receive line-leading checks; Markdown
and legal/contributor records receive signature-line checks. Known AI trailers,
promotional signatures, explicit role signatures and AI self-introductions fail.
The checkers never rewrite files. Reviewers must still assess
arbitrary claims and paraphrases, legitimate provenance, actual authorship and
authorization. A justified exception needs a narrow reviewed rule and positive/negative
fixtures, not a scanner-disable comment or an entire excluded directory. Factual human
trailers remain accepted.

`check:metadata` checks local commits absent from `origin/main`; fetch that ref before
checking. CI checks every commit in the event's exact range and the current PR title,
body, head branch and target. PR titles use the commit format; bodies need
`Closes #N`, `Fixes #N` or `Resolves #N`. CI-skip directives are rejected. A same-repo
PR from the authenticated `dependabot[bot]` identity may use its generated dependency
branch/title and omit the Issue link; a similarly named human/fork branch cannot.
Commit subjects beginning `Bump` also accept the exact historical Dependabot name
and numeric noreply address in the checker. Git author fields are forgeable; this
format exemption grants no trust, Issue exemption, signature exemption or authority.
The optional pre-push hook only accepts the current feature branch at HEAD with an
identical remote name. It rejects direct `main` pushes, alternate-ref pushes and
deletions; exceptional operations still need the owner's explicit authorization.
The referenced Issue must actually cover the change. The static guard checks reference
syntax, not GitHub existence or relevance; do not reuse an unrelated Issue. Creating
an Issue or PR still requires separate owner authorization.

## Source comments and formatting

Source and executable configuration files carry zero comments: no explanatory or inline
notes, block or documentation comments (including AI-generated JSDoc), `TODO`/`FIXME`/`HACK`
annotations, commented-out code, AI-generated notes, or lint/typecheck suppression
directives. Express intent through names, types, tests and structure, and record
rationale, decisions and asset provenance in existing documentation. The rule applies
to every file, old or new. `npm run check:comments` judges the complete delivered state
and fails on any comment that is not listed below:

- The committed tree at `HEAD`, which in hosted CI is the exact checkout under test.
- The staged index, judged on its own blobs, so a clean working file cannot hide a
  staged comment.
- The working tree, including untracked files that are not ignored.

There is no baseline: a comment already present on `main` is reported exactly like a
new one, and neither the base branch nor the history of the branch is consulted. The
checkout is judged as delivered, so a comment that one commit adds and a later commit
removes leaves a clean delivered state, while a branch whose tip still carries any
comment fails. Renames, moves, reindentation and edits never carry a comment forward.
The generated `supabase/database.types.ts` is skipped.

Only these pass automatically:

- Technically mandatory directives: a leading shebang line (the three `.githooks/`
  scripts need it to run), TypeScript triple-slash `reference` and `amd-*` directives
  before any code, JSX pragmas (`@jsx`, `@jsxFrag`, `@jsxImportSource`, `@jsxRuntime`),
  and the version tag (for example `# v7` or `# v7.1.2`) that Dependabot maintains
  after a full-SHA `uses:` pin in workflow YAML. `.github/dependabot.yml` enables the
  `github-actions` ecosystem, which reads that tag.
- Legally required notices: `Copyright <year> <holder>` and
  `SPDX-License-Identifier: <expression>`.
- The machine-generated `supabase/database.types.ts`, which `db:types:check` verifies
  by regeneration.

No exception mechanism exists. `repositoryHygiene.commentExceptions` is rejected in
`package.json`, suppression directives are never mandatory, and agents never add a
scanner-disable comment. A `Copyright` or `SPDX-License-Identifier` line is accepted by
form only; reviewers must still judge that a new legal notice is genuine, and a legal
notice, security control or asset provenance record is never deleted to satisfy this
rule. Move provenance into documentation instead. The checker, its tests and the
workflow are part of any proposed change, so changes to them need the owner's review.
A new source language needs a comment inspector in `scripts/check-hygiene.mjs` in the
same change as its naming rule.

The gate inspects JavaScript, TypeScript, SQL, YAML (including shell inside `run:` block
scalars), TOML, JSONC, the `.githooks/` scripts, and the line-comment forms of
`.gitignore`, `.gitattributes`, `.editorconfig` and `.env.example`. Markdown and JSON
data are not source files for it, and embedded languages other than workflow `run:`
shell (for example a `github-script` body) are not parsed. It cannot recognize
narrative that is moved into strings, identifiers or documentation, so human review of
usefulness and provenance still applies.

`npm run check:format` is a check-only `.editorconfig` gate over the index and working
files: UTF-8 without a byte order mark, LF line endings, a final newline, no trailing
whitespace and no tab indentation. Indent width is not enforced. It enforces basic text
formatting only; it is not a linter and does not assess naming, structure, complexity,
dead code or any other clean-code quality, which stay with review. Binary types, empty
placeholder files and the generated database types are skipped. It never rewrites files;
fix the reported lines and rerun. `check-format.mjs --staged` inspects only index blobs
that differ from `HEAD`.

The optional pre-commit hook judges the content being committed: it runs
`check-comments.mjs --staged`, `check-format.mjs --staged` and `check-yaml.mjs` directly
with Node beside the existing gates. The comment and formatting gates read Git objects
only, so unrelated unstaged or untracked edits neither block the commit nor are touched;
the staged comment gate inspects every staged source blob, not only the changed ones.
The working tree and the committed tree are judged at pre-push and in hosted CI. The
other pre-commit gates keep their existing scopes. The pre-push hook also
verifies that the push goes to `origin` at this repository's URL, refuses staged or
unstaged tracked changes so that local results describe the pushed commit, and runs
`npm run check` and `npm run verify:negative`. Hosted CI runs `check:comments` and
`check:format` as separate steps of the existing `Repository checks` job before the
aggregate, on the delivered checkout; branch protection and triggers are
unchanged. Local hooks remain bypassable, so the hosted steps are the independent gate.

## Open and review a PR

- With the required owner authorization, push the feature branch and open a PR to
  `main`; link its Issue with `Closes #N`. Agents must follow the root authorization
  rules, including authorization before any push that triggers hosted CI.
- Include the concrete problem, resulting behavior, verification, and rollback.
- Review the exact latest SHA and all changed files; inspect permissions and secrets
  whenever workflow/security configuration changes.
- AI comments are suggestions, not independent human approval or proof of correctness.
- The owner chooses squash merge after reviewing the evidence; auto-merge is off.
- After merge, confirm the `main` run, close linked work, and remove the merged branch.

Issue Forms, PR templates, and Dependabot configuration take effect from the default
branch; during bootstrap, their source is reviewed and checked on the setup PR.

## Conflicts and hotfixes

Fetch `origin/main`, then merge it into the feature branch. Resolve each conflict
according to intended behavior, inspect the combined diff, rerun checks, and push.
Abort an uncertain merge using `git merge --abort`; do not use a destructive reset.
Avoid rebasing shared branches or force-pushing `main`.

For urgent fixes, create `fix/<issue>-hotfix` from current `main`, reproduce the
incident, make the smallest repair, test it, and use the same PR review procedure.
Record impact and follow-up prevention in the Issue.

## Collaboration

Keep discussion respectful, factual, and focused on the work. Explain disagreement
with evidence; do not post private information or harass contributors. The owner
handles collaboration concerns privately via the contact route in SECURITY.

## Free-plan boundary

This public repository has an enforced classic protection rule for `main`, including
required checks. The [operations guide](docs/operations.md#github-protection-and-local-database-ci)
records its configuration and verification procedure. Zero required approving reviews
accommodates the single maintainer; the owner still reviews and authorizes merges.
Local hooks remain optional and bypassable. The planning Project stays private.
