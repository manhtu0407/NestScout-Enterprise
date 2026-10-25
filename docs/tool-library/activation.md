# Product activation and architectural references

These entries remain discoverable before a product exists. Doctor reports
NOT_APPLICABLE, installed/available unknown and verified false; it performs no installs or app
commands. No empty application, fake service, app test config or product schema is
created to exercise a CLI. Pick versions/licenses/platforms after an actual consumer
and owner-approved SDK/architecture exist; use the same manifest/lockfile principle.
All product smoke, performance and native behavior below are NOT RUN; costs and
reliability are NOT MEASURED. A local CLI version cannot change those statuses.

## Tier C selection and activation workflows

For each entry: inspect actual product/SDK/target first, review maintained upstream
release/license/host compatibility, pin in the actual manifest, inspect native help,
run the bounded real path and its failure case, fix at the owning layer, validate
consumers, and clean only task-owned output/processes. No hosted release, paid API
or global SDK installer is authorized by discovery. Native iOS requires a supported
Mac/device build; Windows browser/static evidence cannot prove it.

| Trigger / preferred tool | Provenance, native discovery and families | Prerequisite, smoke and failure boundary |
| --- | --- | --- |
| Expo / React Native app lifecycle | [Expo CLI](https://docs.expo.dev/more/expo-cli/) / [source](https://github.com/expo/expo) MIT; [React Native](https://reactnative.dev/docs/environment-setup) MIT. Installed `expo --help`: start, export, run, config, prebuild, install; doctor is SDK-specific tooling | Actual SDK, app, target and approved native runtime. Start a real app, verify revision/rendered path; prebuild/install mutate native/dependency files. No `npx` auto-fetch before compatible pin |
| Lint / format application source | [ESLint](https://eslint.org/docs/latest/use/command-line-interface) MIT; inspect `eslint --help`, print-config, lint paths, fix/config/cache options | Actual compiler/source/config. Pin selected linter, assert valid and invalid app example; fix writes files, new config/rules need real consumers. Existing Markdown/YAML checks remain canonical |
| Unit / component behavior | [Jest](https://jestjs.io/docs/cli) MIT / [Vitest](https://vitest.dev/guide/cli.html) MIT / [RNTL](https://callstack.github.io/react-native-testing-library/) MIT; help, run/watch, reporters, coverage, selection | Choose with Expo/RN compatibility, not two redundant runners. Real component/user-visible assertion plus denied/failure case; timers/resources clean up. Snapshot PASS alone is weak behavior evidence |
| Device end-to-end | [Maestro](https://docs.maestro.dev/) Apache-2.0 / [Detox](https://wix.github.io/Detox/) MIT; installed help for build/test/device/record/diagnostics | Choose one after real simulator/device app and harness exist. Drive real flow and capture device output; no device build is BLOCKED. Do not claim CLI/help smoke proves native UI |
| Runtime performance/debugging | [React Native DevTools](https://reactnative.dev/docs/react-native-devtools), RN MIT; supported DevTools UI and profiler, inspector/network/performance families depend on RN version | Running app and supported device. Capture reproducible trace and user flow before/after; private logs/heap artifacts need bounded retention. No unsupported device claims |
| Source security | [CodeQL](https://codeql.github.com/docs/) / [CLI terms](https://github.com/github/codeql-cli-binaries/blob/main/LICENSE.md), [Semgrep](https://semgrep.dev/docs/) / [source](https://github.com/semgrep/semgrep) LGPL-2.1 engine plus separate rule/service terms. Inspect database/analyze/query or scan/rule help | Real source/languages/rules and license review. Known positive/negative findings with false-positive baseline; hosted/private use and commercial rules may differ. No secret upload or paid job |
| API performance / load | [k6 docs](https://grafana.com/docs/k6/latest/) / [source](https://github.com/grafana/k6), AGPL-3.0; help for run, inspect, archive, output and cloud | Actual safe endpoint/contract, request budget, bounded load and cleanup. Local synthetic endpoint first. Cloud/production load is separate approval; latency from a fake endpoint is not backend readiness |

If installation/SDK/device access is missing, keep it BLOCKED or NOT RUN and name
the prerequisite; do not add mocks disguised as production integrations. Shell,
build, network, profiler and screenshot artifacts belong to the actual task-owned
directory/harness. Future CI/product scripts must join the existing selected-test
and aggregate contracts without bypasses.

## Tier D: borrow mechanisms, not products

| Reference | Transfer now | Install gate / licensing research entry |
| --- | --- | --- |
| [Bazel](https://bazel.build/) | Repeatable inputs and commands | Demonstrated build graph/cache need; Apache-2.0 |
| [Buck2](https://buck2.build/docs/) | Clear dependency/ownership boundaries | Measured monorepo need; Apache-2.0/MIT source terms |
| [Chromium presubmit](https://www.chromium.org/developers/how-tos/depottools/presubmit-scripts/) | Targeted feedback plus mandatory positive/negative gates | No Chromium checkout/review system needed |
| [Backstage catalog](https://backstage.io/docs/features/software-catalog/) | Discoverable capability/owner references | Real multi-service catalog need; Apache-2.0 |
| [Spinnaker](https://spinnaker.io/docs/) | Verification and deployment approval are separate | Actual delivery platform need; Apache-2.0 |
| [Cadence](https://github.com/cadence-workflow/cadence) | Durable lifecycle, retries, recovery when justified | Genuine durable workflow consumer; MIT source |
| [Sorbet](https://stripe.com/blog/sorbet-stripes-type-checker-for-ruby) | Early static type feedback | Ruby consumer; Apache-2.0 source, not a TypeScript substitute |

No Tier D tool has a repo installer, executable probe, smoke or npm integration:
NOT APPLICABLE is intentional. If a real need arises, inspect current native help,
maintenance, distribution, license and target permission before designing a task.
The historical [Netflix Conductor repository](https://github.com/Netflix/conductor)
is archived; famous provenance is not proof of maintenance. No workflow engine,
developer portal, Docker replacement or universal shell interpreter is introduced.
