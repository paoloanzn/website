---
layout: layouts/post.njk
title: "Anthropic Defense Evasion"
date: 2026-08-08
tags: post
---

# Anthropic Defense Evasion

![img]({{ '/img/hero/knight-vs-dragon.png' | url }})

## Introduction

Anthropic has made a consequential distinction between its subscription quota and its API credits. The subscription quota is available through first-party clients such as Claude.ai and Claude Code, while current authentication and credential-use rules do not allow third-party software to spend that same quota.[^1] By “subscription quota”, I mean the usage included with a paid plan rather than credits charged through the API.

OpenAI’s Codex ecosystem, on the other hand, permits major third-party harnesses to use the code quota attached to ChatGPT subscriptions.[^2] By “harness,” I mean the agent program that coordinates the model, tools, and conversation. For users who want to choose their own harness, Anthropic’s policy creates a practical monopoly over how subscription quota may be consumed.

Anthropic appears to enforce the separation at the request layer. Requests that do not look like they came from an authorized first-party client are routed toward API credits instead of subscription quota. Claude Code therefore sends a request-dependent fingerprint that lets Anthropic distinguish the expected client shape from a third-party harness.

The evidence points to three pieces that together form this request fingerprint. Anthropic also uses defense mechanisms that make their construction harder to reverse engineer.

I approached the problem in three layers: (1) observing Claude Code’s API traffic through a local proxy, (2) statically analyzing its bundled JavaScript, and (3) tracing its native runtime with LLDB, the debugger used on macOS.

The next section describes the HTTP request shape in interactive mode and headless `-p` mode. After that, I reconstruct Anthropic’s defense and the fingerprinting path.

Anthropic’s [authentication and credential-use terms](https://code.claude.com/docs/en/legal-and-compliance#authentication-and-credential-use) are relevant here. The methods discussed in this post may violate those terms, and readers should not treat the reconstruction as permission to bypass billing controls or use credentials outside the conditions under which they were issued.

## How Claude Code Talks to Anthropic’s API

This section describes the request Claude Code sends to Anthropic’s Messages API: (1) the endpoint and streaming response, (2) the compact JSON body and its `system` blocks, (3) the headers, and (4) the differences between interactive mode and headless `-p` mode. By headless `-p` mode, I mean Claude Code’s non-interactive invocation.

Every main inference call is a `POST https://api.anthropic.com/v1/messages?beta=true` with a compact JSON body and a streaming Server-Sent Events (SSE) response. Both modes stream; headless `-p` mode aggregates the stream locally and prints JSON after completion. The abridged body below uses placeholders for omitted content:

```json
{
  "model": "claude-opus-5",
  "messages": [...],
  "system": [
    {"type": "text", "text": "<x-anthropic-billing-header, cc_entrypoint, cch>"},
    {"type": "text", "text": "<identity block>"},
    {"type": "text", "text": "<shared policy block>", "cache_control": {...}},
    {"type": "text", "text": "<session instructions>", "cache_control": {...}}
  ],
  "tools": [...],
  "metadata": {"user_id": "<JSON string of device_id, account_uuid, session_id>"},
  "max_tokens": 64000,
  "thinking": {"type": "adaptive", "display": "omitted"},
  "context_management": {...},
  "output_config": {"effort": "high"},
  "diagnostics": {"previous_message_id": null},
  "stream": true
}
```

The `system` array contains four blocks in a fixed order: (1) the attribution block, (2) a mode-specific identity line, (3) a shared cached policy block, and (4) the session instructions. The attribution block contains `cc_version`, `cc_entrypoint`, and a `cch=00000` placeholder. The next section explains how those fields contribute to the request fingerprint.

The headers:

```text
User-Agent: claude-cli/2.1.224 (external, sdk-cli)
Authorization: Bearer <redacted>
Content-Type: application/json
Accept: application/json
X-Claude-Code-Session-Id: <per-session UUID>
x-client-request-id: <per-request UUID>
x-app: cli
anthropic-version: 2023-06-01
anthropic-beta: <long list of feature flags>
X-Stainless-Arch: arm64
X-Stainless-Lang: js
X-Stainless-OS: MacOS
X-Stainless-Package-Version: 0.94.0
X-Stainless-Runtime: node
X-Stainless-Runtime-Version: v26.3.0
anthropic-dangerous-direct-browser-access: true
```

The `Authorization` header carries the account’s OAuth bearer token. The important distinction is that the request fingerprint is not carried by these HTTP headers; its attribution block sits inside the JSON `system` array.

Both modes use the same endpoint and request structure, but identify themselves differently across the headers and body:

| Field | Interactive mode | Headless `claude -p` mode |
|---|---|---|
| User-Agent | `claude-cli/2.1.224 (external, cli)` | `claude-cli/2.1.224 (external, sdk-cli)` |
| Entrypoint | `cli` | `sdk-cli` |
| Identity block | `You are Claude Code, Anthropic’s official CLI for Claude.` | `You are a Claude agent, built on Anthropic’s Claude Agent SDK.` |

We will reproduce the headless `-p` client. Its request is smaller because it omits interactive-only tools and facilities, which makes it the cleaner target, and it still spends subscription quota rather than API credits.[^3]

So the request surface consists of (1) the Messages API endpoint and SSE stream, (2) the JSON body with its four ordered `system` blocks, (3) the headers carrying credentials and identifiers, and (4) the fields separating interactive mode from headless `-p` mode.

## Anthropic Defense

This section explains (1) how Anthropic appears to use the request fingerprint to route billing, and (2) how its three components are constructed: the ordered attribution block, the `cc_version` suffix, and the native `cch` checksum.

### Routing: API Credits vs. Subscription Quota

The routing decision -- whether a request spends subscription quota or API credits -- is made on Anthropic’s servers. Our captures establish the client-side signals; the conclusion that Anthropic uses them for billing is an inference from the observed behavior. As section 2 established, reproducing the HTTP headers alone does not reproduce the first-party request shape because the relevant attribution block is inside the JSON body.

### The Three-Part Fingerprint

By “request fingerprint,” I mean three components: (1) the four `system` blocks in their expected order, beginning with the attribution block, (2) the `cc_version` suffix, a three-hex value computed in JavaScript from the user prompt and client version, and (3) the `cch` checksum, a five-hex value computed by Bun from the serialized request body.

Reproducing the observed first-party request shape requires all three components to agree.

### System-Block Ordering

Recall from section 2 that the `system` array contains four blocks in a fixed order -- attribution block, identity line, shared policy block, and session instructions:  

```json
"system": [
  {
    "type": "text",
    "text": "x-anthropic-billing-header: cc_version=2.1.224.f97; cc_entrypoint=sdk-cli; cch=00000;"
  },
  {
    "type": "text",
    "text": "You are a Claude agent, built on Anthropic’s Claude Agent SDK."
  },
  {
    "type": "text",
    "text": "<shared policy block>",
    "cache_control": {...}
  },
  {
    "type": "text",
    "text": "<session instructions>",
    "cache_control": {...}
  }
]
```

Here `cch=00000` is a placeholder that Bun replaces later. The exact attribution block and system-block order form the first component of the request fingerprint. They also affect the `cch` checksum because `cch` is derived from the serialized body. The native serializer locates `"system":[`, then searches the next 300 bytes for the placeholder, so the attribution block must come first.

Because we reproduce the headless `-p` client, the identity block is `You are a Claude agent, built on Anthropic’s Claude Agent SDK.` rather than the interactive `You are Claude Code, Anthropic’s official CLI for Claude.`.

This is where the defense becomes harder to inspect. The JavaScript bundle exposes `cch=00000`, but contains no routine that computes or replaces those five zeros. The production macOS binary also lacks the entitlement required for debugger attachment.

The combined design appears intentional: Anthropic placed the `cch` computation below the application layer, inside a custom Bun runtime,[^4] while the production signature prevents normal debugger attachment.[^5]

### The `cc_version` Suffix

The `cc_version` suffix is ordinary JavaScript and is fully recoverable from the bundle. Claude Code (1) selects characters 4, 7, and 20 from the first non-meta user prompt, (2) substitutes `0` for missing characters, (3) prefixes a fixed salt and appends the client version, and (4) hashes the result with SHA-256, keeping the first three hex digits.

By “non-meta user prompt,” I mean the first message containing what the user actually typed. Claude Code excludes synthetic `<system-reminder>` content that may carry `role: user` but remains system-controlled.

```js
function sRs(prompt, version) {
  let selected = [4, 7, 20].map(i => prompt[i] || "0").join("");
  let input = "59cf53e54c78" + selected + version;
  return require("crypto")
    .createHash("sha256")
    .update(input)
    .digest("hex")
    .slice(0, 3);
}
```

For `Reply with exactly: PROBE_OK`, positions 4, 7, and 20 are `y`, `i`, and `P`. Hashing `59cf53e54c78` + `yiP` + `2.1.224` gives `f97`, so the attribution block contains `cc_version=2.1.224.f97`. This 12-bit suffix is separate from the `cch` checksum, but both must be recomputed for each request.

### Why Patch Bun Instead of JavaScript?

As noted above, the JavaScript bundle exposes the `cch=00000` placeholder but not the routine that replaces it. Why hide that routine inside Bun, the runtime executing Claude Code’s JavaScript bundle?[^8]

JavaScript could perform the operation, so native placement is not a functional requirement. Its effect -- and likely purpose -- is to defeat simple static analysis: the placeholder remains visible in JavaScript, while the seed, omitted ranges, and output transformation exist only as stripped ARM64 instructions. This is obfuscation rather than cryptographic protection, but it forces the reverse engineer into native debugging.

### The `cch` Checksum

Recovering the `cch` checksum required live debugging. We copied the Claude Code executable, re-signed that copy with debugging and Just-in-Time (JIT) entitlements,[^6] and left the installed binary untouched. We then ran it against a local synthetic API response and followed the request through LLDB. Higher HTTP stages still contained `cch=00000`, while the final send buffer contained the completed five-hex value. A hardware watchpoint on the placeholder stopped inside Bun’s native serializer.

The watchpoint gave us the exact instruction address where the serializer first read the placeholder. Reading the instructions around that stop connected the dynamic observation to the hidden native routine: the code explicitly compares the first eight bytes of `cch=00000`, then the ninth, and only an exact match enters the hash path:

```armasm
; candidate = body + candidate_offset
101567194: add   x11, x22, x24
101567198: ldr   x12, [x11]            ; candidate[0..7]
10156719c: ldrb  w11, [x11, #0x8]      ; candidate[8]

; x9/w10 contain the locally constructed bytes "cch=00000"
1015671a0: cmp   x12, x9               ; compare the first 8 bytes
1015671a4: ccmp  x11, x10, #0x0, eq    ; if equal, compare byte 9
1015671a8: b.eq  0x1015671cc           ; exact match -> cch checksum path
```

Once the marker matches, the next instructions assemble the XXH64[^7] seed directly in a register:

```armasm
; x1 = 0x4d659218e32a3268, assembled 16 bits at a time
1015671dc: mov   x1, #0x3268
1015671e0: movk  x1, #0xe32a, lsl #16
1015671e4: movk  x1, #0x9218, lsl #32
1015671e8: movk  x1, #0x4d65, lsl #48

1015671ec: add   x0, sp, #0xc0         ; address of the XXH64 state
1015671f0: bl    0x1006e7cc0           ; XXH64_init(state, seed)
```

For the request shape we dynamically validated, the `cch` routine works in four steps:

1. Serialize the request as compact UTF-8 JSON with `cch=00000` still present.
2. Hash the original buffer in ranges using XXH64 with seed `0x4d659218e32a3268`, using the transformation shown below.
3. Keep the low 20 bits of the result and format them as five lowercase hexadecimal characters.
4. Overwrite the five zeros in place.

For example (`...` represents unchanged bytes):

```text
serialized body:
{"model":"claude-opus-5","messages":[...],"system":[{"text":"... cch=00000;"}],"metadata":{...},"max_tokens":64000,"thinking":{...}}

bytes fed to XXH64:
{"model":"","messages":[...],"system":[{"text":"... cch=00000;"}],"metadata":{...},"thinking":{...}}
```

In these controlled requests, the XXH64 input omits the `model` value -- `claude-opus-5` -- and the complete `max_tokens` member, including its trailing comma. The `cch=00000` placeholder remains unchanged until XXH64 has finalized.

The native routine does not create the second buffer shown above. For these requests, it feeds the original body into XXH64 in three chunks, skipping the bytes occupied by the `model` value and `max_tokens` member.

After XXH64 finalizes, the routine (1) keeps its lowest 20 bits, (2) formats them as five lowercase hexadecimal characters, and (3) writes them over the five zeros.

An independent implementation reproduced every controlled request:

| Prompt | `cch` |
|---|---|
| `A` | `a2f22` |
| `B` | `13324` |
| Longer different prompt | `03ff2` |
| `Reply with exactly: PROBE_OK` | `48e2f` |

So Anthropic’s defense combines server-side routing with a three-part request fingerprint: the ordered attribution block, the `cc_version` suffix, and the `cch` checksum. The first two are visible in the JavaScript bundle; the third is a version-specific XXH64 routine inside Bun and reproducing the observed first-party request shape requires <b>all three.</b>

## Implications & Risks

The technique is version-specific. Anthropic can change the system-block order, prompt suffix, native seed, omitted ranges, or output format in any release. The server also receives account and device metadata, session history, beta flags, telemetry, and the rest of the request body, so matching these three components does not guarantee that a third-party harness is indistinguishable from Claude Code.

Anthropic’s [authentication and credential-use terms](https://code.claude.com/docs/en/legal-and-compliance#authentication-and-credential-use) restrict how subscription credentials may be used. Applying this reconstruction from a third-party harness to spend subscription quota may violate those terms and expose the account to enforcement, suspension, or separate API charges.

Anthropic’s defense is reproducible for recent Claude Code versions -- among which, 2.1.224 -- but it remains (a) contractually risky, (b) version-specific, and \(c) ultimately controlled by Anthropic’s server-side policy.


[^1]: Anthropic’s policy language and enforcement have changed over time, so this describes the policy and behavior relevant to the version and account examined here rather than a timeless rule.
[^2]: OpenAI has not published a general policy statement, but it has [directly helped a third-party project](https://x.com/thsottiaux/status/2009742187484065881?s=20) integrate ChatGPT subscription Codex quota.
[^3]: Anthropic’s stance on headless mode has shifted. They previously said they would stop allowing `claude -p` to use subscription quota, then walked that back; as of this writing, headless mode still consumes subscription quota.
[^4]: Claude Code is written in TypeScript and runs on Bun. This is visible in the leaked source dated April 1, 2026; [free-code](https://github.com/freecodexyz/free-code) is my custom build from that source.
[^5]: This debugger restriction comes from macOS code-signing entitlements. The Linux build may not impose an equivalent restriction, although that was not tested here.
[^6]: We ad-hoc signed the debug copy with these entitlements:

    ```xml
    <key>com.apple.security.get-task-allow</key>
    <true/>
    <key>com.apple.security.cs.allow-jit</key>
    <true/>
    <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
    <true/>
    <key>com.apple.security.cs.disable-library-validation</key>
    <true/>
    ```

[^7]: XXH64 is the 64-bit variant of xxHash, a fast non-cryptographic hash. See the [xxHash specification](https://github.com/Cyan4973/xxHash/blob/dev/doc/xxhash_spec.md).
[^8]: Anthropic has since acquired Bun. That relationship may help explain why the defense was implemented in Bun, although the direction of influence is uncertain.