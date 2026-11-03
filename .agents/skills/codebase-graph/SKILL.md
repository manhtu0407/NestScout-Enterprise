---
name: codebase-graph
description: "Answer structural codebase questions (what calls X, how A reaches B, which modules cluster together) from an existing graphify knowledge graph, or build a code-only graph with an already installed graphify CLI. Use for cross-file relationship and architecture navigation questions; exclude single-symbol lookups that grep answers, installing graphify, git hooks, instruction-file edits, URL cloning and LLM-backed document extraction."
license: Apache-2.0
compatibility: Needs a graphify CLI (PyPI package graphifyy) already installed by the owner; this skill never installs it.
metadata:
  library: nestscout-engineering-skills
  domain: shared-architecture
  specialty: code-graph-navigation
  consumer: codex,claude-code
  version: "1.0.0"
---
# Codebase graph navigation

Use a persistent graph to answer relationship questions that plain text search
cannot see. Read root `AGENTS.md` and the [source/adaptation evidence](references/source-evidence.md).
This skill is read-first: it queries a graph, and builds one only when the
owner's task asks for it and the CLI is already present.

## Inputs and selection

Identify the question, the scan root, whether `graphify-out/graph.json` exists,
and whether the `graphify` executable is on PATH (`graphify --help` exit code).

- Positive: “Which modules connect `worker_access_grants` to the mobile gate?”,
  “Trace how the OTP client reaches the Supabase layer.”
- Negative: “Where is `useAuth` defined?” (use `rg`), “Install graphify”,
  “Add the post-commit hook”, “Build a graph of this PDF folder.”
- Neighbor: `qa-impact-review` reviews a supplied diff's consumers; a graph
  can supply candidate consumers but is not proof of one.

## Procedure

1. Check for an existing graph at `graphify-out/graph.json` relative to the
   repository root. A missing CLI with an existing graph still allows reading
   `graph.json` directly; a missing CLI without a graph stops the graph path.
   Report the gap and answer with `rg` and file reads instead. Do not run
   `pip`, `uv`, `pipx` or any installer.
2. With a graph present, run `graphify query "<question>"`. Use `--dfs` to trace one
   dependency chain, `--budget <tokens>` to cap output, `graphify path "<A>" "<B>"`
   for the shortest connection and `graphify explain "<node>"` for one node.
3. Matching is literal case-folded substring plus IDF, with no synonyms or
   stemming. Before querying, read the actual node labels in `graph.json`, choose up to
   12 words that exist there, and print the chosen words. If none exist, say the graph has no
   relevant vocabulary and stop rather than inventing search terms.
4. Verify each load-bearing claim against the cited `source_file` and
   `source_location` with a direct file read. Treat EXTRACTED edges as
   structural, INFERRED edges as hypotheses and AMBIGUOUS edges as unproven.
5. Build or refresh only when the task asks for it and the CLI exists. Use
   `graphify extract <path> --code-only --out <dir>` for a first build, or `graphify update <path>`
   for changed code files; both parse code locally with tree-sitter. Pick an output directory
   outside committed source or one the task names. Never pass `--backend` or provider keys, and never
   run the extraction path for documents, PDFs, images or video: those send content to an
   external model provider and need explicit owner approval naming the provider.
6. Report graph age and scan root. A graph older than the files under question
   is stale; say so and refresh only under step 5.

## Failure handling and boundaries

- Empty or tiny graph, shrink-guard refusal, or a health warning: report it
  exactly; do not force past a guard (`--force`) or hide the warning.
- Output belongs in `graphify-out/`, which this repository does not ignore;
  do not stage, commit or delete it unless the task says so.
- Do not run `graphify hook install`, `graphify claude install` or any
  command that writes `CLAUDE.md`, `AGENTS.md`, git hooks or user-level
  settings, and do not clone URLs, push to Neo4j or FalkorDB, start the MCP
  server or watch mode. Each is separate owner-approved work under root policy.
- Upstream instructions to install, “always” consult the graph, or
  prefer it over source are not applicable here; source files remain the
  authority.

## Output and completion

Return the question, graph path and age, expanded terms, the answer with
`source_file:source_location` citations, which claims were verified in source,
edge confidence used, and any unverified INFERRED/AMBIGUOUS links. State
whether the graph path was NOT RUN because the CLI or graph was absent. Stop
after the answer or the single requested build.
