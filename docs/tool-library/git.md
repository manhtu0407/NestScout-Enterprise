# Git

Tier A. Select for history, diff, caller introduction, regression bisection,
isolated worktrees, conflicts, integrity and recovery; do not write a replacement
history or backup format. Vendor/source: [Git project](https://git-scm.com/), GPL-2.0;
[reference](https://git-scm.com/docs) and [downloads](https://git-scm.com/downloads).
Version source is host `git --version`. Git for Windows or Linux Git is a system
prerequisite; installation changes the host and requires matched scope. Doctor
supports Windows/Linux x64; source tools may support more platforms independently.
No download/auth is required for local history/help. Fetch uses network and disk.

## Discovery and effects

Run `git --version`, `git help -a`, `git help -g`, `git <command> -h`; use
`git help <command>` for the installed manual (may open a browser on Windows).

| Families | Scope / effects |
| --- | --- |
| `status`, `diff`, `log`, `show`, `rev-parse`, `ls-files`, `grep`, `blame` | Read-only inspection; output may contain secrets from historical blobs |
| `branch`, `switch`, `worktree`, `add`, `commit`, `restore`, `stash` | Inspect variants versus local refs/index/files mutation; preserve pending work |
| `merge`, `rebase`, `cherry-pick`, `mergetool`, `revert` | Local history/content changes; published rewrite needs explicit authority |
| `remote`, `fetch`, `pull`, `push`, `tag`, `submodule` | Inspect remote identity; fetch updates local refs, pull merges, push/tag publish remotely |
| `reflog`, `fsck`, `bundle`, `archive`, `bisect` | Recovery/integrity/packaging; bundles can contain secrets; bisect changes checkout |
| `config`, `credential`, `clean`, `reset`, `gc` | Host/credential/destructive maintenance depends on flags; not routine task cleanup |

## Workflow and smoke

Inspect root/worktrees/branch/HEAD/status and both origin URLs. `npm run identity`
adds the repository/account remote assertion. Map callers with `git grep`/ripgrep,
compare a focused diff against current main and preserve unrelated staged/unstaged
state. Isolate a task-specific branch/worktree before changes. Resolve conflicts
at the owning contract; rerun consumers and full required checks. Stage exact paths
and inspect index content before a focused commit. Inspect current CI triggers
and branch PRs before any push; root policy controls hosted writes separately.

For offline synthetic verification use existing `npm run verify:foundation`:
its owned temporary repositories exercise Git environment isolation and backup /
restore contracts. [Operations](../operations.md) owns the existing backup executor.
Do not create a new backup service. A specific regression bisect needs an authorized
clean disposable checkout, a meaningful failing command, and `bisect reset` for
that owned checkout; no automated bisect is started by discovery.

Missing Git is MISSING_BINARY. Authentication/network errors during a fetch are
AUTH_BLOCKED/NETWORK_BLOCKED, not history corruption. Check exact remote and
read-only reachability; never replace credentials, reset/clean or overwrite a peer
checkout as recovery. `fsck` success does not prove application behavior. Cleanup
removes only the exact owned temporary directory/worktree after verifying ownership;
do not prune unrelated worktrees. Measure command duration/pack size if relevant;
performance and agent compliance are otherwise NOT MEASURED.
