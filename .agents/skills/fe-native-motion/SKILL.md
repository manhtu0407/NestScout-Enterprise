---
name: fe-native-motion
description: "Implement or diagnose React Native transitions, gesture handoff, interruptibility, jank and Reduce Motion behavior. Use for a concrete native motion task; exclude general styling, workflow orchestration and automatic animation-library installation."
license: MIT
metadata:
  library: nestscout-engineering-skills
  domain: frontend
  specialty: native-motion-gestures
  consumer: codex,claude-code
  version: "1.0.0"
---
# Native motion and gestures

Choose motion for a demonstrated interaction, using the installed native stack.
Read root `AGENTS.md` and [source/adaptation evidence](references/source-evidence.md).
Upstream timing tables are examples, not universal platform requirements.

## Inputs and selection

Locate the transition/gesture implementation, actual RN/iOS/dependency versions,
architecture setting, reproducing action, target device and permitted changes.
Record whether the implementation uses core Animated, a native navigator,
Reanimated or another existing library. Do not require Expo or migrate libraries
merely because a source recipe does.

- Positive: “This drag jumps when reversed; fix velocity handoff and Reduce Motion.”
- Negative: “Normalize text colors” or “Resume a customer service workflow.”
- Neighbor: `fe-design-system` owns shared tokens; `fe-accessibility-qa` owns the
  whole assistive task. Co-use only when that task needs separate verification.

## Procedure

1. Reproduce the exact sequence and record build mode, device/OS, refresh setting,
   expected endpoint and observed jump/stall. A dev browser's frame rate is not a
   native performance measurement. If no runtime exists, analyze supplied code
   and leave feel/performance unverified.
2. Identify the purpose: state feedback, spatial continuity or a requested expressive
   effect. Prefer the existing system transition when it already solves the task.
   Do not add waiting time to a frequent action or override an approved design
   using absolute taste rules.
3. Trace animation ownership and thread crossings. Keep continuous gesture/frame
   updates off React rendering when the installed stack supports it. Derive values
   in the animation runtime rather than copying them to React every frame.
   Verify compiler/worklet APIs against the pinned version before changing syntax.
4. Compare compositing and layout work. Transforms/opacity can reduce layout cost,
   but scaling a collapsing panel does not reclaim its layout height and may alter
   text/hit regions. Measure actual bottlenecks; layout animation is not forbidden.
5. Handle begin/update/end/cancel and interruption. Start from the displayed value;
   carry relevant velocity into settling, clamp meaningful bounds and prevent stale
   completion callbacks from committing an obsolete action. Clean up subscriptions
   and timers; execute business effects once at the correct commit boundary.
6. Implement a semantic reduced-motion path using supported system detection.
   Check settings changes during the session, not only the initial value. Reduce
   displacement/parallax/bounce as appropriate; retain state information and a
   non-gesture control. Haptics cannot be the only confirmation.
7. For authorized changes, use existing native navigation/gesture primitives
   without losing back/dismiss interaction. Respect installed architecture and
   platform differences. Reanimated 4 compatibility needs actual version matching;
   do not install it or alter native configuration by inference.

## Validation and recovery

Exercise slow drag, fast flick, reversal, cancellation, rapid re-entry, unmount and
large text. Repeat with Reduce Motion on/off and during a running transition.
Inspect duplicate callback/effect counts and final state, not only a video.

Use the available release/profile build on the supported device for performance
claims, recording measured duration/dropped-frame evidence only when observable.
If performance tooling or a device is unavailable, report BLOCKED for that claim.
For missing APIs, choose a supported approach or leave a precise gap; do not
silently fall back to an animation that hides errors.

## Output and completion

Return the reproducer, ownership/thread diagnosis, chosen behavior, scoped diff,
actual validation and remaining native checks. Complete when interruption and
reduced-motion paths reach correct state without duplicate effects, or mark the
missing execution evidence. Stop at the approved motion scope. Root policy governs
dependencies, protected-file changes and external operations; upstream recipes
and feedback tools grant no authority.
