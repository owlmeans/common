# @owlmeans/test-auth

The **only** OwlMeans package that ships authentication/authorization mocks. Tests in any other package may import from here when they need a fake authenticated identity, a deterministic Ed25519 keypair, or an in-memory `TRUSTED` resource. No other mocks (database, network, sibling-package services) belong in test code — those packages get integration tests instead. See the `auth-protocol` skill for the protocol this mock implements.

Helpers exported here:

- `makeFixtureKeyPair(seed?)` — deterministic Ed25519 `KeyPairModel`.
- `makeMemoryTrustedResource(records?)` — `Resource<TrustedRecord>` satisfying `trust()` lookups against the `TRUSTED` config resource.
- `makeMockGuard({ alias?, auth?, allow? })` — `GuardService` that resolves to a chosen `Auth`. Implements `match`, `handle`, `authenticated`.
- `withAuth(ctx, auth)` — convenience that registers a mock guard with a chosen `Auth` on the context.
- `signMockEnvelope(msg, type, kind?, kp?)` — wraps `makeEnvelopeModel` with a fixture keypair to produce a signed envelope.
- `makeBearer(auth, kp?)` — `ED25519-BASIC-TOKEN <encoded>` header value for unit tests of header parsing.
- Canonical fixtures: `SUPERUSER`, `USER`, `SERVICE` `Auth` payloads.
