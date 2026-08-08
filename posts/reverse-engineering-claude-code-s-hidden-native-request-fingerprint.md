---
layout: layouts/post.njk
title: "Reverse Engineering Claude Code's Hidden Native Request Fingerprint"
date: 2026-08-08
tags: post
---

# Reverse Engineering Claude Code's Hidden Native Request Fingerprint

![img]({{ '/img/hero/man-in-the-water.png' | url }})

Anthropic actively prevents third-party software from spending the quota included in its monthly subscription plans. In practice, subscription authentication is reserved for first-party clients, specifically [Claude.ai](https://claude.ai) and [Claude Code](https://code.claude.com/docs/en/overview).[^1]

One part of this defense sits deeper than an HTTP header or a user-agent string. Claude Code places a five-character fingerprint named `cch` inside its normal first-party inference requests. The JavaScript application initially writes `cch=00000`; a custom native path in its bundled Bun runtime later calculates the real value and patches the serialized request in place.

This post reconstructs that path in Claude Code 2.1.224 for macOS on arm64. We recover the hash algorithm, its seed, the exact bytes excluded from its input and the native instructions that write the result. The mechanism will probably change in later releases, and reproducing it exactly does not prevent Anthropic from recognizing a third-party client through other server-side signals.

## The Armor Against Freedom

The interesting value is easy to misclassify. Its surrounding text begins with `x-anthropic-billing-header:`, but it is not an HTTP header on the wire. It is a string in the first block of the JSON `system` array. That block also identifies the Claude Code version and entrypoint through fields such as `cc_version` and `cc_entrypoint`.

The actual HTTP request contains more conventional client signals: an OAuth bearer token, a Claude Code session ID, a random client request ID, a mode-specific user agent, Stainless SDK metadata and a long list of Anthropic beta flags. Those fields help describe the client, but `cch` is different. It binds the attribution block to most of the serialized request body.

This distinction matters for reverse engineering. Looking only at the HTTP headers will reveal several identifiers, but not the code that creates this fingerprint. We have to follow the request body from the JavaScript object to the final byte buffer sent over the socket.

## HTTP Request

For each main inference call, Claude Code sends a `POST` request to `https://api.anthropic.com/v1/messages?beta=true`. We observed HTTP/1.1 through the interception proxy; a direct connection may negotiate a different protocol. The request body contains the model, messages, system blocks, tools, metadata, token limit, thinking configuration and streaming options. The complete shape is not required for this analysis.[^2]

Both the interactive client and `claude -p --output-format json` set `stream` to true and consume a server-sent events response. The latter command does not ask the API for one non-streaming JSON response. It aggregates the stream locally and prints JSON only after the request has completed.

The body is serialized as compact JSON. Whitespace, property order, escaping and punctuation therefore become part of the byte sequence seen by the native fingerprint routine. Two objects with the same abstract JSON values need not produce the same `cch` if their serialized bytes differ.

The other request identifiers helped establish what `cch` is not. `X-Claude-Code-Session-Id` is a UUIDv4 and matches the session ID embedded in request metadata. `x-client-request-id` is another UUIDv4, generated for each first-party request with the runtime's cryptographic randomness. By contrast, repeated controlled requests produced the same `cch` while their client request IDs changed. `cch` is deterministic, not random.

## JavaScript Inside a Native Binary

Claude Code is distributed on macOS as a large arm64 Mach-O executable, not as a directory of readable TypeScript files. This can create the impression that the whole application was written or ahead-of-time compiled as native code. It was not.

The application source starts as TypeScript. During the release build, its type annotations are erased and the source is transformed into JavaScript. Bun's bundler then follows imports, incorporates dependencies and combines the application into a minified JavaScript payload. Finally, Bun's executable builder packages that payload together with a platform-specific Bun runtime into one self-contained binary.

_Bundled with a Bun runtime_ therefore means that one file contains two different layers:

- the Claude Code application, shipped as bundled JavaScript with its original TypeScript types erased; and
- Bun's native runtime, including the JavaScript engine, networking stack, serializers and operating-system integration.

At startup, the native runtime loads and executes the embedded JavaScript bundle. The JavaScript engine may compile hot application code while the process runs, but that is different from shipping every Claude Code function as a normal arm64 function. Minified application logic can still be recovered as strings from the executable, whereas changes made inside Bun appear as native machine instructions in the disassembly.

The binary identifies its embedded runtime as Bun 1.4.0. It also contains the minified JavaScript that constructs the billing attribution block. That constructor writes the literal placeholder `cch=00000`; it does not calculate the final value. The public `@anthropic-ai/sdk` 0.94.0 package contains no corresponding `cch` implementation. The missing operation lives in Claude Code's custom native serialization path.

## Finding the Native Handoff

We first captured the same prompt in interactive and headless modes with mitmproxy, redacting credentials during collection. We then moved the experiment offline: a loopback proxy returned a synthetic Messages API stream while the request retained the first-party Anthropic hostname. This was important because pointing `ANTHROPIC_BASE_URL` directly at localhost caused Claude Code to classify the route as third-party and omit both `cch` and the first-party client request ID.

A fixed session UUID and a fixed prompt made `cch` repeat across runs, while changing only the prompt changed it. Common candidates such as SHA-256, SHA-1, MD5 and CRC32 over the raw body, canonical JSON, messages or system blocks did not match. The placeholder in the embedded JavaScript told us where the value began, but not where it was completed.

The production binary cannot normally be attached to LLDB because its signature does not grant debugging permission. We therefore copied it, applied an ad-hoc signature with debugging and JIT entitlements and left the installed executable untouched. Breakpoints along the HTTP path then exposed a clean transition:

- the higher request stages still held `cch=00000` in the unserialized request object;
- the final send wrapper held a serialized buffer containing five hexadecimal digits; and
- a hardware watchpoint on the placeholder stopped inside a stripped native serializer when those bytes were read.

The serializer first searches compact output for the ten bytes spelling `"system":[`. From that position it searches a bounded window of at most 300 bytes for the exact nine-byte marker `cch=00000`. The following excerpt shows the successful comparison and the construction of a hard-coded 64-bit seed:

```asm
101567194: add   x11, x22, x24          ; candidate = body + candidate_offset
101567198: ldr   x12, [x11]             ; candidate[0..7]
10156719c: ldrb  w11, [x11, #0x8]       ; candidate[8]

; x9/w10 hold the locally constructed bytes "cch=00000"
1015671a0: cmp   x12, x9                ; first 8 bytes equal?
1015671a4: ccmp  x11, x10, #0x0, eq     ; if so, compare byte 9
1015671a8: b.eq  0x1015671cc             ; exact match -> cch hash path

; x1 = 0x4d659218e32a3268, assembled 16 bits at a time
1015671dc: mov   x1, #0x3268
1015671e0: movk  x1, #0xe32a, lsl #16
1015671e4: movk  x1, #0x9218, lsl #32
1015671e8: movk  x1, #0x4d65, lsl #48

1015671ec: add   x0, sp, #0xc0           ; x0 = address of XXH64 state
1015671f0: bl    0x1006e7cc0             ; XXH64_init(state, seed)
```

This is an explicit special case, not a global replacement of every matching string. The nearby native helpers contain the standard XXH64 prime constants and streaming state transitions, identifying the algorithm as seeded XXH64. The trace establishes this behavior for Claude Code's API request path; it does not establish that every call to the JavaScript global `JSON.stringify()` uses the patched path.

## Reconstructing the Fingerprint

Tracing every call to the native XXH64 update function revealed the precise input. Claude Code does not build a second normalized JSON document. It hashes disjoint ranges of the original compact serialization in order, skipping selected ranges as it goes.

For the requests we validated, the operation is:

1. Serialize the request as compact UTF-8 JSON while the attribution block still contains `cch=00000`.
2. Omit only the bytes of the `model` string value. The key, colon and quotation marks remain in the input.
3. Omit the complete `max_tokens` member, including its trailing comma.
4. Hash every remaining byte with streaming XXH64 and seed `0x4d659218e32a3268`.
5. Keep the low 20 bits, format them as five lowercase hexadecimal characters and overwrite the five zeros in place.

A subtle but essential detail is that `cch=00000` itself remains in the hash input. The zeros are replaced only after XXH64 has finalized. The fixed-width output lets the serializer mutate the existing buffer without changing its length or invalidating the already constructed HTTP body.

For one controlled prompt, the serialized body was 56,734 bytes long. LLDB recorded three included ranges. The gaps were exactly the 13-byte model value and the 19-byte `"max_tokens":64000,` member. The resulting 64-bit hash ended in `a2f22`, which was also the value written to the wire.

Static analysis found additional normalization branches for members named `fallbacks` and `fallback_credit_token`. The native helper understands arrays, quoted strings, escape characters, nested brackets and adjacent commas well enough to remove those members without breaking the remaining JSON. Our controlled bodies did not contain either field, so these two exclusions are statically recovered but not dynamically validated.

After finalization, the serializer extracts five nibbles and converts them to lowercase hexadecimal. The first and last conversions, followed by the packed in-place stores, are visible here:

```asm
10156731c: bl    0x1006e7ea0            ; x0 = XXH64_final(state)

; Convert bits 0..3 to one lowercase hexadecimal character.
101567340: and   w9, w0, #0xf           ; nibble = hash & 0xf
101567344: mov   w10, #0x30             ; retain ASCII '0' for the fifth nibble
101567348: mov   w11, #0x30             ; ASCII '0'
10156734c: bfxil w11, w0, #0, #4        ; decimal candidate: '0' | nibble
101567350: add   w12, w9, #0x57         ; alpha candidate: nibble + ('a' - 10)
101567354: cmp   w9, #0xa
101567358: csel  w9, w11, w12, lo       ; nibble < 10 ? '0'+n : 'a'+n-10

; Convert bits 16..19 -- the fifth and highest retained nibble.
1015673b4: ubfx  w9, w0, #16, #4        ; (hash >> 16) & 0xf
1015673b8: bfxil w10, w0, #16, #4       ; '0' | nibble
1015673bc: add   w11, w9, #0x57         ; lowercase a..f candidate
1015673c0: cmp   w9, #0xa
1015673c4: csel  w9, w10, w11, lo

; x10 = body + cch_offset. Store five packed characters at offsets 4..8,
; overwriting only the five zeros after "cch=".
1015673d4: strb  w8, [x10, #0x8]        ; fifth output byte
1015673d8: str   w9, [x10, #0x4]        ; first four output bytes
```

An independent implementation reproduced all four controlled values: `a2f22` for prompt A, `13324` for prompt B, `03ff2` for a longer prompt and `48e2f` for the original probe. Matching several inputs matters because a five-hex output has only 2^20^, or 1,048,576, possible values.

That small output also tells us what `cch` is not. It is neither a message authentication code nor cryptographic proof that Claude Code created the request. XXH64 is a fast non-cryptographic hash, the seed is embedded in every client and only 20 result bits survive. `cch` is best described as a compact deterministic request checksum and first-party fingerprint.

## Why Patch Bun Instead of JavaScript?

JavaScript is perfectly capable of serializing an object, hashing bytes and replacing a placeholder. Moving this operation into Bun was not a requirement for functionality. The binary does not include a design document explaining Anthropic's decision, but the implementation exposes several practical reasons.

First, the native serializer sees the authoritative bytes. By this point, property ordering, omitted JavaScript values, string escaping, Unicode encoding and punctuation have already been resolved. A JavaScript implementation would either have to reproduce those decisions exactly or serialize the body twice. Hashing at the serialization boundary guarantees that the fingerprint describes what is actually sent rather than an earlier approximation of the request object.

Second, the calculation is self-referential. The body must contain a `cch` marker, but its value depends on the body. A fixed placeholder breaks the cycle: hash the final bytes with five zeros, then replace exactly those five bytes. Performing the replacement inside the output buffer avoids another parse, another serialization and any change to the body length.

Third, the runtime is a common choke point. Claude Code can construct requests through ordinary JavaScript and the stock-looking SDK path, while the bundled runtime applies the private rule at the last moment. The public SDK therefore needs no special implementation, and a third-party client using the same SDK does not acquire the fingerprint accidentally.

Finally, native placement raises the cost of inspection. The minified JavaScript openly reveals the placeholder, but grepping it does not reveal the seed, byte exclusions or output transformation. Those details sit in stripped arm64 instructions among hundreds of megabytes of Bun runtime code. This is obfuscation rather than cryptographic secrecy, but it explains why static JavaScript analysis alone reaches a dead end.

The narrow `"system":[` and 300-byte checks also reduce the blast radius of the patch. The runtime does not blindly rewrite arbitrary JSON containing the same text; it recognizes the expected location and structure of a Claude request before activating the custom path.

## A Second, Smaller Fingerprint

`cch` is not the only prompt-dependent value in the attribution block. Claude Code appends a separate three-hex suffix to `cc_version`.

The JavaScript bundle takes the zero-based characters at positions 4, 7 and 20 from the first non-meta user prompt, substitutes `0` for missing positions, prefixes the literal salt `59cf53e54c78`, appends the Claude Code version, hashes the result with SHA-256 and retains the first three hexadecimal characters. For the prompt `Reply with exactly: PROBE_OK`, the selected characters are `yiP`; version 2.1.224 consequently appears as `2.1.224.f97`.

This value is only 12 bits and is separate from the native 20-bit `cch`. Its presence nevertheless reinforces the broader design: the billing attribution string carries several short, deterministic signals derived from the client version and request content.

## What Matching `cch` Does Not Prove

Recovering `cch` explains one hidden part of Claude Code's request shape. It does not turn the checksum into authorization, and it does not make an arbitrary client indistinguishable from Claude Code.

The server also receives the OAuth identity, account and device metadata, session history, user agent, entrypoint, beta set, system prompts, tool definitions and the rest of the serialized body. It may correlate those values with telemetry, transport behavior and previous requests. Any of them can change independently of `cch`, and Anthropic can add new checks without updating this particular routine.

The result is therefore deliberately version-specific: Claude Code 2.1.224 on macOS arm64 uses a placeholder near the start of the `system` array, seeded XXH64 over a selectively normalized compact body and five lowercase hexadecimal output bytes. A future release may change the seed, exclusions, marker, hash or native offsets.

What the disassembly establishes is narrower and more interesting. Claude Code's JavaScript does not generate its final request fingerprint. It leaves a conspicuous hole, and a patched Bun serializer fills that hole only after the request has become bytes. The armor is hidden below the application layer, but once the native boundary is traced, it is a deterministic checksum rather than magic.

[^1]: Anthropic frequently changes the terms of use for its products. We therefore cannot rule out a retreat from the current policies, which prohibit -- or at least attempt to limit -- the use of subscription plans by third-party software.

[^2]: For a complete implementation, see the [pi-black repository](https://github.com/paoloanzn/pi-black), which implements this spoofing method for the Pi coding-agent client.
