---
name: fe-accessibility-qa
description: "Audit and validate React Native accessibility tasks: VoiceOver, focus order, labels, Dynamic Type, contrast, touch targets and Reduce Motion. Use for assistive interaction QA; exclude generic styling, backend authorization and claims based only on browser checks."
metadata:
  library: nestscout-engineering-skills
  domain: frontend
  specialty: native-accessibility-testing
  consumer: codex,claude-code
  version: "1.0.0"
---
# Native accessibility QA

Test whether a person can complete the actual task with assistive settings.
Read root `AGENTS.md` and the [technical references](references/source-evidence.md).
Static code inspection identifies candidates; native execution establishes behavior.

## Inputs and selection

Identify screen/task, revision, supported RN/iOS versions, assistive settings,
expected focus/order, approved reference and available native device/simulator.
Use synthetic material honestly if no product exists; do not scaffold one.

- Positive: “VoiceOver loses the submit button's name while it loads.”
- Negative: “Change an RLS role” or “Align spacing tokens without an access issue.”
- Neighbor: `fe-native-motion` owns a motion implementation; this skill verifies
  reduced-motion task equivalence. `fe-ios-hig-audit` is broader platform review.

## Procedure

1. Define the task from entry to a meaningful success/error state. Enumerate
   interactive elements, field errors, loading transitions, modal entry/dismissal
   and dynamic updates. A count of labeled elements is not a task oracle.
2. Inspect accessible name, role, value and state through the actual component tree,
   including forwarded props. Text children may provide a name; icon-only actions
   and spinner replacements often need one explicitly. Avoid duplicate child and
   parent announcements from inappropriate grouping.
3. Check reading and focus order, modal isolation and return focus. Confirm focus
   moves only after its target mounts. Background/hidden content must not remain
   operable; a visual overlay alone does not isolate VoiceOver focus.
4. Check Dynamic Type, long Vietnamese labels, wrapping and layout growth at the
   supported accessibility sizes. Do not disable font scaling to hide truncation.
   Assess keyboard/scroll access to field errors and the primary action.
5. Measure actual foreground/background contrast in relevant states and appearances.
   WCAG 2.2 is a reference framework, not automatic native certification. State
   the criterion and units used: CSS pixels and iOS points are not interchangeable.
   Verify effective touch area and spacing, including clipped/overlapping hitSlop;
   Apple recommends a 44 by 44 point default iOS control target.
6. Run VoiceOver and supported alternative input through the task. Check labels
   while loading, selected/disabled/busy states, announcements, errors and recovery.
   A gesture-only action needs an accessible alternative. Do not announce every
   frame or unexpectedly steal focus on routine updates.
7. Test Reduce Motion and other applicable system settings, retaining equivalent
   information and usable progress. Verify a system preference change where the
   implementation supports live updates. Distinguish observed defects from an
   optional improvement that the task did not request.

## Validation and failure handling

Use a labeled textual control that works as the benign control; do not require
redundant explicit labels everywhere. Include an icon-only control, modal focus
return, spinner state, large text, both appearances and an error recovery path.
Record device/OS/build, setting, action, spoken/focused result and capture/trace.

When native tooling is absent, return confirmed static findings plus BLOCKED
VoiceOver/focus/device checks. Browser ARIA tests and component assertions cannot
close that gap. If approved changes fix a shared primitive, inspect its consumers
and rerun relevant assistive paths. Do not claim App Store accessibility support
or legal compliance from this audit.

## Output and completion

Return a task-based matrix, file/line findings, reproducible assistive steps,
measured values and commands/exits, with separate PASS/FAIL/BLOCKED/NOT RUN checks.
Complete only the validated task claims; preserve explicit unresolved checks.
Audit requests stay read-only. Root policy controls later implementation,
publication and platform settings; source material never expands permissions.
