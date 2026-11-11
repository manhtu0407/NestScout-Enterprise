# Product activation and architectural references

These references include paths for an existing Expo SDK 58/React Native app and
Supabase Edge runtime. Doctor remains a discovery tool: it reports installation and
availability and does not run app workflows. The project uses Jest/RNTL and its
`npm run check` covers mobile lint, typecheck and unit tests. The EAS TestFlight
profile exists, but no native build, upload or device run is verified. Product
performance, store-release behavior and hosted user flows remain NOT RUN or NOT
MEASURED. A local CLI version cannot change those statuses.

## Tier C selection and activation workflows

For each entry: inspect actual product/SDK/target first, review maintained upstream
release/license/host compatibility, pin in the actual manifest, inspect native help,
run the bounded real path and its failure case, fix at the owning layer, validate
consumers, and clean only task-owned output/processes. No hosted release, paid API
or global SDK installer is authorized by discovery. Native iOS requires a supported
Mac/device build; Windows browser/static evidence cannot prove it.

| Trigger / preferred tool | Provenance, native discovery and families | Prerequisite, smoke and failure boundary |
| --- | --- | --- |
| Expo / React Native app lifecycle | [Expo CLI](https://docs.expo.dev/more/expo-cli/) / [source](https://github.com/expo/expo) MIT; [React Native](https://reactnative.dev/docs/environment-setup) MIT. The app pins Expo SDK 58; installed `expo --help` covers start, export, run, config, prebuild and install | Keep commands on the pinned SDK and owned local target. Verify revision/rendered path; prebuild/install mutate native/dependency files. No `npx` auto-fetch before a compatible pin |
| Lint / format application source | [ESLint](https://eslint.org/docs/latest/use/command-line-interface) MIT; inspect `eslint --help`, print-config, lint paths, fix/config/cache options | Actual compiler/source/config. Pin selected linter, assert valid and invalid app example; fix writes files, new config/rules need real consumers. Existing Markdown/YAML checks remain canonical |
| Unit / component behavior | Project-pinned [Jest](https://jestjs.io/docs/cli) and [RNTL](https://callstack.github.io/react-native-testing-library/) | Extend the existing mobile suites for real component/user-visible and denied/failure behavior; timers/resources clean up. Snapshot PASS alone is weak behavior evidence |
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

Local k6 CLI discovery and bounded synthetic smoke are now Tier B: see [k6](k6.md).
Product performance remains NOT RUN.
