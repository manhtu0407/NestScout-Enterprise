---
name: fe-design-system
description: "Create, extend or audit an existing React Native design system: semantic tokens, component variants and interaction states across screens. Use for shared visual consistency; exclude single-screen HIG audits, motion tuning and app scaffolding."
license: MIT
metadata:
  library: nestscout-engineering-skills
  domain: frontend
  specialty: native-design-tokens
  consumer: codex,claude-code
  version: "1.0.0"
---
# Native design system

Keep visual decisions in the existing styling system and verify their consumers.
Read root `AGENTS.md` and [source/adaptation evidence](references/source-evidence.md).
Expo is optional; do not install a styling library to follow this workflow.

## Inputs and selection

Locate the real source directories, styling dependency/version, token owner,
approved visual reference, affected screens and permitted changes. A missing
theme directory is not evidence of drift if another configuration owns tokens.
Without an app/design, return an inventory gap or a conditional proposal.

- Positive: “Consolidate these screens' repeated colors into our existing theme.”
- Negative: “Tune a spring” or “Review a transaction.”
- Neighbor: `fe-ios-hig-audit` decides platform convention; this skill decides
  consistent reuse. `fe-native-motion` validates motion behavior; this skill may
  store its already approved settings.

## Procedure

1. Discover actual token/config imports and rendered consumers with `rg`.
   Inspect aliases, platform branches and styling-library conventions. Reuse the
   current owner; do not add a parallel theme, wrapper tree or folder skeleton.
2. Build a small map of repeated values to semantic intent: surface, primary text,
   muted text, destructive action, spacing relationship and typography role.
   Distinguish intentional one-off geometry from escaped shared decisions.
   Raw literal counts are search leads, never a visual quality score.
3. Check light/dark and higher-contrast resolution, disabled/pressed/loading/error
   states, font scaling and long localized labels. Keep semantic platform colors
   distinct from runtime-selected brand values; do not call hooks at module scope.
   Preserve approved brand colors while checking readable foreground pairs.
4. Inspect shared component contracts at call sites. Add variants for observed
   needs, not hypothetical combinations. Separate visual intent from state;
   loading retains an accessible name and blocks repeated submission where needed.
   Honor forwarded accessibility props and existing style precedence.
5. For an authorized change, migrate the smallest coherent consumer set. Keep
   public prop behavior, type inference and layout overrides intact. Use actual
   React Native style types; avoid unsafe casts that conceal incompatible dynamic
   color or animated values. Do not impose a new 4-point scale or fixed type ramp
   over the approved system.
6. Inspect consumers of changed exports, including tests, navigation chrome and
   platform-specific files. A token rename requires updating every real consumer;
   a search with a nonexistent directory cannot establish absence.
7. Run the existing relevant type/component checks and capture representative
   screens in matching states. Recheck behavior, not just token imports. Record
   browser output separately from native appearance.

## Verification and recovery

Use a shared button in default, pressed, disabled and loading states as a control;
verify its label, busy/disabled semantics and actual event suppression. Check a
consumer that overrides layout and a legitimate local value so the audit does not
turn every literal into a violation. Exercise long text and theme switching.

If a change breaks a consumer, repair the token/component contract within scope
and rerun affected checks. If the SDK does not support a suggested style property,
retain the supported implementation; do not upgrade dependencies implicitly.
No available app/device means visual verification BLOCKED, even with clean types.
Never invent a component gallery, fixture metrics or brand identity.

## Output and completion

Return the canonical token/component owner, confirmed escapes with consumers,
before/after mapping, authorized diff, commands/exits and rendered-state evidence.
Label recommendations, failures and unverified appearances separately.
Complete when changed consumers preserve behavior and observed states are checked
or explicitly blocked. An audit remains read-only; root policy, not upstream
feedback commands or example commit plans, governs later operations.
