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
`toolCalls` is empty for other stop reasons. `max_tokens` may have empty text,
including when the entire budget was consumed by thinking; empty terminal
`end_turn`/`stop_sequence` responses remain invalid. Tools use registry declarations
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
The complete serialized MiniMax request body has a separate fixed 2 MiB UTF-8
limit, including messages, system text, tools, and the provider envelope. Exactly
2 MiB is accepted; larger requests fail with `invalid_request` before HTTP runs.

## Continuation and thinking

After a response, append `provider.assistantMessage(result)` to the in-memory
conversation, then append each tool result in exact call order, with no duplicates,
missing results, unknown IDs, or intervening messages. MiniMax and FakeProvider
enforce this same sequencing contract.

Complete MiniMax assistant blocks, including interleaved thinking, live only in
instance-local WeakMaps. There is no exposed continuation token. The exact
assistant message object returned by `assistantMessage` is bound to its original
visible text, the first user message object's identity, the complete preceding
transcript, and the ordered pending tool IDs. Its public `continuation: true`
marker makes copied or JSON-reconstructed messages fail closed without exposing
thinking. Mutating the original result or continued assistant message also fails.

Keep the first user message and all genuine continued assistant objects unchanged
throughout an in-memory run. They can be reused as history in later model turns,
including multiple completed tool rounds and subsequent user follow-ups. Do not
clone or JSON-roundtrip these objects. Store/publicize the four normalized result
fields only; never persist, log, or expose provider thinking. Continuations cannot
be replayed across conversations, provider instances, or process restarts; future
run recovery must restart from durable public evidence instead.

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
