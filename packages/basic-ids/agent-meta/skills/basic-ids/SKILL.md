---
name: basic-ids
description: How to use @owlmeans/basic-ids — createIdOfLength and createRandomPrefix for random identifiers, uuid for v4 UUIDs, and generateWordSlug / nextSlugCandidate for human-readable two-word slugs. Auto-invoked when importing ID generation utilities or naming a new record, nonce or organization slug.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/basic-ids

**Layer:** Core
**Install:** `"@owlmeans/basic-ids": "^0.1.18-rc.9"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `createIdOfLength(length?, style?)` | A random id of exactly `length` characters (default 6) |
| `createRandomPrefix(bytes?, style?)` | Encode `bytes` random bytes (default 6); length varies with the encoding |
| `uuid()` | A v4 UUID string |
| `generateWordSlug()` | A readable two-word slug — `civil-format`, `raised-earth` |
| `nextSlugCandidate(base, attempt)` | The n-th candidate for an occupied slug — `brisk-otter`, `brisk-otter-2` |
| `IdStyle` | `Base58` (default) and `Base64` (url-safe, unpadded) |
| `WORD_SLUG_SEPARATOR` (`'-'`), `WORDLIST_SIZE` (2048) | Slug shape and thesaurus size |
| `WORDLIST_A` / `WORDLIST_B` | The descriptive and subject halves the slug is drawn from |

## Random identifiers

```typescript
import { createIdOfLength, IdStyle, uuid } from '@owlmeans/basic-ids'

const id = createIdOfLength(16)                    // 16 Base58 chars
const nonce = createIdOfLength(32, IdStyle.Base64) // 32 url-safe Base64 chars
const recordId = uuid()
```

`createIdOfLength` asks for twice the bytes and truncates, so the result is exactly the requested
number of characters whatever the encoding — this is the function to use for anything that must be
unguessable. `createRandomPrefix` is the raw form: it encodes the bytes it was given and returns
however many characters that produced.

## Readable slugs

`generateWordSlug` picks one descriptive word and one subject word out of 2048 each, joined by a
hyphen. The result is a valid DNS label and a valid Kubernetes object-name segment, so the same
value can address a host, a namespace and an OIDC client without a second sanitising pass — which
is why an organization entity's `entitySlug` is generated this way rather than as a random string.

Two words carry 22 bits of entropy. That is **not** enough to be unguessable, and deliberately so:
uniqueness is settled by a unique index or a registry claim, never by entropy. Walk
`nextSlugCandidate` until the store accepts one, and never use a slug where a secret is needed.

```typescript
import { generateWordSlug, nextSlugCandidate } from '@owlmeans/basic-ids'

const base = generateWordSlug()
for (let attempt = 1; attempt <= 10; ++attempt) {
  const candidate = nextSlugCandidate(base, attempt)   // attempt 1 is the bare name
  if (await claim(candidate)) return candidate
}
```

## Depends On

- `@noble/hashes` (randomness), `@scure/base` (Base58 / Base64), `uuid`
