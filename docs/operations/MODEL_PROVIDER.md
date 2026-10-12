# Model provider contract

`AgentService` accepts `options.provider` and otherwise constructs `MiniMaxProvider`.
Legacy `apiKey`, `baseUrl`, `model`, `httpClient`, `retryDelay` and
`maxProviderAttempts` injection remain supported. Offline tests never need a key
or network connection; use `FakeProvider({ script: [...] })` with normalized results.

## Request and result

`generate({ messages, tools, signal, limits })` returns exactly these enumerable fields:

```js
{
  text: 'Answer [S1]',
  toolCalls: [{ id: 'call_1', name: 'news_search', input: { query: 'Agent' } }],
  usage: { inputTokens: 100, outputTokens: 50 },
  stopReason: 'tool_use'
}
```

`stopReason` is `end_turn`, `tool_use`, `max_tokens`, or `stop_sequence`.
`toolCalls` is empty for other stop reasons. Tools use registry declarations
(`name`, `description`, `inputSchema`); internal execution functions are never sent.
Messages use `{ role: 'system' | 'user' | 'assistant', content: string }` or
`{ role: 'tool', toolCallId: string, content: string }`. Returned call IDs and order
are preserved. Argument-schema and permission checks still belong to the registry
and runtime; a model call does not authorize execution.

Capabilities currently advertise `toolCalls: true`, `abort: true`, and
`streaming: false`. Defaults are 60 seconds total per generate call, 1,800 output
tokens, 2 MiB response bytes, and 10 tool calls. `limits` can override these with
positive integers, up to 120 seconds, 32,768 tokens, 2 MiB, and 10 calls.
Retry backoff and every HTTP attempt consume the same timeout. A cancellation
aborts the transport and stops retrying even if an injected transport ignores it.
Failures contain generic codes/messages, never raw HTTP errors or credentials.

## Continuation and thinking

After a response, append `provider.assistantMessage(result)` to the in-memory
conversation, then append each tool result in order. This preserves complete
MiniMax assistant blocks, including interleaved thinking, through an opaque,
non-enumerable continuation token backed by an instance-local WeakMap.
Do not clone or JSON-roundtrip this assistant message before the next model turn:
that deliberately removes the private continuation. Store/publicize the four
normalized result fields only; never persist, log, or expose provider thinking.
Continuation tokens cannot be replayed across provider instances or process restarts.
Future run recovery must restart from durable public evidence instead.

## MiniMax configuration

The default endpoint is `https://api.minimax.io/anthropic/v1/messages`.
Configure `MINIMAX_BASE_URL=https://api.minimax.cn/anthropic` for the China endpoint.
Existing `https://api.minimaxi.com/anthropic` configurations remain accepted as a
legacy compatibility alias; new deployments should use the official `.io`/`.cn`
endpoints. Only these exact HTTPS hosts and the `/anthropic` base path are allowed;
credentials, query strings, fragments, non-default ports, and redirects are rejected.
Requests use `Authorization: Bearer ...` and `anthropic-version: 2023-06-01`.
The existing `MiniMax-M2.5` model default is unchanged and can be configured through
`MINIMAX_MODEL`. No live provider request was used to validate this implementation.

Protocol references verified 2026-10-12:
[Anthropic-compatible API](https://platform.minimax.io/docs/api-reference/text-anthropic-api)
and [MiniMax function calls](https://platform.minimax.io/docs/guides/text-m3-function-call).

`citation-audit.js` checks reference IDs, required headings, and uncited lines.
It does not prove factual correctness. Legacy chat/content/diversity responses
remain withheld if the original draft and its single repair fail this audit.
