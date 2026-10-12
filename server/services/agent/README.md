# Read tools

Construct `new ToolRegistry(createReadTools({ newsService, signalService,
creatorStore, sourceRegistry }))` with initialized application dependencies.
No tools call HTTP routes, execute SQL, refresh sources, or expose raw records.
This module registers declarations; it does not enable a provider, runtime,
endpoint, MCP server, or autonomous execution.

Call `registry.execute(name, input, { scopes, signal })`. Scopes must come from
trusted server authorization, never model arguments. The declaration's single
required scope is enforced before execution. News and health require `news:read`,
Signal topics and opportunities `signals:read`, Creator tools `creators:read`,
and the cross-source research brief `content:read`.

Each declaration has name, semantic version, description, input/output schemas,
read effect, scope, timeout, byte limit, and executor. Names are unique even across
versions; create a new registry to change a pinned tool version. `list()` returns
defensive copies of metadata with no executor.

Schema support is deliberately restricted to closed objects (`properties`,
`required`, `additionalProperties: false`), bounded arrays, bounded strings,
bounded finite numbers/integers, booleans, null, nullable type unions, and scalar
string/number enums. Unsupported keywords fail registration. No coercion,
defaults, regexes, references, or unrestricted objects are accepted.

Successful results are `{ ok: true, data }`, with recursively sorted object keys.
Failures are `{ ok: false, error: { code, message } }`; codes are `unknown_tool`,
`forbidden`, `invalid_input`, `invalid_output`, `output_too_large`, `tool_failed`,
`timeout`, and `aborted`. Messages are fixed constants; internal errors and stack
traces are never copied. Invalid declarations throw `TypeError('invalid_declaration')`.

Input JSON has a 16 KiB cap, structural depth and node caps. Initial tools have
5-second deadlines and 128 KiB output data budgets measured as serialized UTF-8
bytes. Lists allow at most 50 results; nested evidence and text have their own
schema limits. Byte overflow fails instead of truncating JSON. Timers and caller
abort listeners are removed on completion, failure, timeout, or abort. A timeout
settles even an executor that ignores its propagated AbortSignal; it cannot stop
synchronous event-loop blocking or undo work already started by a service.

Public projections recursively allowlist fields, including nested metrics and
evidence. They omit source setup/configuration, raw event payloads, source
cursors, error details, and generated prompts. Evidence URLs allow public HTTPS
DNS names without credentials, custom ports, IP literals, fragments, or private
host suffixes. Only bounded `v`, `id`, and `p` query identifiers survive. Links
are citation data, not network destinations; this is not a DNS/SSRF fetch policy.
Some unusual valid citation URLs may lose query parameters under this policy.
External titles and summaries remain untrusted source content for later runtimes.

`ContentResearchService.buildBrief(query, { signal })` preserves the legacy brief
route's coercion, deduplication, status code, and envelope. The tool further
projects that response, removes unusable citations, recomputes diversity, and
returns `insufficient_evidence` when fewer than two public citations remain.
Legacy Agent context shares the evidence projection and safe link selection.
