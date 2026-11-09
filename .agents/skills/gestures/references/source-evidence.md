# Source evidence: gestures

Reviewed 2026-11-09 (Asia/Saigon). Local package version 1.0.0; adoption mode
**ADAPTED** (format and packaging only). This records source and static review, not
runtime efficacy.

## Decision and file scope

Adopted at the owner's request for interface design work on the React Native app.
The upstream instructions are kept as written. Edits are limited to: LF line endings,
portable frontmatter (license and string metadata), a pointer to this file, and
no further structural change
Local files: `SKILL.md` and this reference.
Upstream files reviewed: SKILL.md. No executable resources, hooks, agent metadata,
symlinks or binaries are installed. Web-oriented examples remain in the text; apply
them through the project's React Native equivalents.

## Immutable upstream evidence

- [emilkowalski/skills: skills/gestures](https://github.com/emilkowalski/skills/tree/715c1807e08c497cfd1dc4feb450a2a3300ef2a9/skills/gestures)
  revision `715c1807e08c497cfd1dc4feb450a2a3300ef2a9` (committed 2026-11-09T12:07:26Z), maintainer Emil Kowalski, MIT.
  The revision identifies content; no independent signature audit is claimed.

The whole repository tree at that revision was inventoried: only Markdown files plus
a zero-byte file named `.pl` that is not installed. The selected files were searched for
download-and-execute, credential, telemetry and hidden-instruction patterns. Findings:
text recommends `npx expo install` and links to public documentation; nothing is
executed by the package, and install commands remain subject to the root policy.
The upstream "Initial Response" greeting is retained and applies only when the skill
is invoked with no question.

## Update and recovery

Compare the pinned revision with the new one, re-inspect every changed file and
notices, then refresh `npm run check:skills`. Restore the previous package diff from Git
for recovery without touching unrelated skills.

## Legal notices

```text
MIT License

Copyright (c) 2026 Emil Kowalski

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
