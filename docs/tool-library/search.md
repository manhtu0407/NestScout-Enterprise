# ripgrep and Git grep

Tier A. Triggers: find files, find caller/consumer, search error or symbol, map
blast radius. Prefer mature native search over a custom repository crawler.
Vendor/source: [BurntSushi/ripgrep](https://github.com/BurntSushi/ripgrep), MIT or
Unlicense with bundled notices; Git grep uses Git's license and installation.
Version sources: host `rg --version`, `git --version`. [Official releases](https://github.com/BurntSushi/ripgrep/releases)
provide host assets; installing globally or editing PATH requires matched host scope.
No repository download/install is performed by doctor. Windows/Linux x64 is the
validated doctor matrix; `git grep` remains an available alternative if rg is missing,
though the missing rg prerequisite is still reported truthfully.

## Native families and selection

Inspect `rg --help`, `rg --type-list`, and `git grep -h` for exact installed syntax.
Use `rg --files` for inventory, `rg -n` for locations, `rg -l` for filenames,
`rg -F` for literal text, `rg --glob` / `-t` for boundaries, `rg --hidden` for hidden
configuration and `rg --json` for structured integration. Regex/multiline/context/
encoding features are discoverable from help, not a frozen option whitelist.
`git grep -n PATTERN -- PATH` searches tracked content; `--cached` inspects the index,
and an explicit revision searches history. None of these commands writes files.

Start at the actual repo root, narrow to the owning module, find references and
inspect every affected caller before editing shared behavior. Follow config/manifest
edges rather than guessing an architecture from a symbol name. Use jq/gh JSON fields
for structured JSON rather than regex extraction where structure matters.

Offline synthetic smoke is a search of known source:

```sh
rg -n -F 'validateCapabilities' scripts/tool-library.mjs
git grep -n 'typecheck:db' -- package.json
```

Exit 0 means matches; rg/Git grep exit 1 means no matches, not an engine failure.
Higher errors mean invalid pattern, permission or I/O; inspect the exact path and
help, fix scope/pattern and rerun. Hidden/ignored files are not searched by default;
absence from default results does not prove module absence. Never broadly include
ignored secrets/node_modules just to increase recall. No-match evidence should state
the inspected paths and flags. Redact secret-bearing matching lines. Doctor probes
only version; actual search results provide the bounded smoke assertion.
No resources are created or cleaned. Startup/search runtime and selection quality
remain NOT MEASURED unless recorded for the actual task.
