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
is no application naming policy until an application/module is approved.

Disposable evidence belongs in ignored task-owned `.cache/` directories or outside
the checkout. Forced staging still fails. Permanent PDF/ZIP input is accepted only
at `docs/artifacts/<kebab-name>.pdf` or `.zip`, registered in the existing
`package.json` under `repositoryHygiene.artifacts`. Each entry needs `path`,
`sha256` (lowercase SHA-256), `purpose`, and `source`; register only actual approved
artifacts. Blobs must fit the checker's 32 MiB read limit; retain larger inputs
outside Git. Both index and working manifests must match their own bytes. Review
licensing, provenance and publication authority; a hash cannot establish them.
The reader caps each index/working snapshot at 128 MiB (unique blobs for the index).

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
Existing comments are never deleted automatically. Reviewers must still assess
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

Do not add comments to source or executable configuration files: no explanatory or
inline notes, block or documentation comments, `TODO`/`FIXME`/`HACK` annotations, or
lint/typecheck suppression directives. Express intent through names, types, tests and
structure. `npm run check:comments` compares each proposed state with its base and
fails on any comment that the base does not already contain in the same file:

- Every commit of the committed range (`origin/main` to `HEAD`, or the exact pull request
  or push range in hosted CI) is compared with its own parent, so a comment that one
  commit adds and a later commit removes is still reported, naming the introducing commit.
  Fix it in the commit that adds it; on an unpublished task branch that means amending or
  reordering before publication, never rewriting published history without owner
  authority.
- A merge commit is judged by what none of its parents already contain: content that
  arrives from another parent, such as the base branch, is baseline content, while a
  comment first appearing in the merge itself (for example in a conflict resolution) is
  reported. Commits reachable from the range's base are never inspected, so existing
  history stays valid.
- A root commit is compared with the empty tree.
- The staged index is compared with `HEAD` and the working tree with `HEAD`. The staged
  index is judged on its own blobs, so a clean working file cannot hide a staged comment.

Unchanged, moved and reindented comments pass, and an edited comment counts as new.
Renamed files keep their comments only when the old and new names use the same comment
inspector (for example `.mjs` to `.cjs`, or `.yml` to `.yaml`); a rename across inspectors
such as `.mjs` to `.ts` treats every comment as new. The exempt generated file
`supabase/database.types.ts` is skipped in every commit.

Only these pass automatically:

- Technically mandatory directives: a leading shebang line, TypeScript triple-slash
  `reference` and `amd-*` directives before any code, JSX pragmas (`@jsx`, `@jsxFrag`,
  `@jsxImportSource`, `@jsxRuntime`), and the version tag (for example `# v7` or
  `# v7.1.2`) that Dependabot maintains after a full-SHA `uses:` pin in workflow YAML.
- Legally required notices: `Copyright <year> <holder>` and
  `SPDX-License-Identifier: <expression>`.
- The machine-generated `supabase/database.types.ts`, which `db:types:check` verifies
  by regeneration.

Anything else needs the owner's explicit approval, and that approval is the owner's
decision to merge a `package.json` change into the trusted baseline, not a string in the
proposed change. `repositoryHygiene.commentExceptions` entries (`file`, `text` with the
exact comment, and `reason`) are read only from the trusted baseline: `origin/main`
locally, and the pull request base or the push's previous commit in hosted CI. An
exception added or edited in the same changeset, in an earlier commit of the same branch,
in the staged index or in the working tree authorizes nothing, and with no trusted
baseline available no exception applies. The comment can therefore be added only after
a change containing just the exception has been merged. Each baseline entry authorizes
one occurrence in that file across the whole range, and suppression directives are never
treated as mandatory. Agents never self-approve an exception. The checker, its tests and
the workflow are themselves part of the proposed change, so changes to them need the
owner's review, and a `Copyright` or `SPDX-License-Identifier` line is accepted by form
only; reviewers must still judge that a new legal notice is genuine. A new source
language needs a comment inspector in `scripts/check-hygiene.mjs` in the same change as
its naming rule.

The gate inspects JavaScript, TypeScript, SQL, YAML (including shell inside `run:` block
scalars), TOML, JSONC and the `.githooks/` scripts. Markdown, JSON data and plain
configuration files such as `.gitignore` are not source files for it, and embedded
languages other than workflow `run:` shell (for example a `github-script` body) are not
parsed. It cannot recognize narrative that is moved into strings, identifiers or
documentation, so human review of usefulness and provenance still applies.

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
the working tree is judged at pre-push and in hosted CI. The other pre-commit gates keep
their existing scopes. The pre-push hook also
verifies that the push goes to `origin` at this repository's URL, refuses staged or
unstaged tracked changes so that local results describe the pushed commit, and runs
`npm run check` and `npm run verify:negative`. Hosted CI runs `check:comments` and
`check:format` as separate steps of the existing `Repository checks` job before the
aggregate, on the exact pull request or push range; branch protection and triggers are
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
