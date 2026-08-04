---
node: shadcn
scope: "**/components.json, packages/shadcn*/**, packages/web-*/**"
updated: 2026-08
---

# shadcn UI strategy

A family of web UI packages on shadcn UI + Tailwind CSS v4 replaces the Material-UI (`web-panel`)
family. Development guide: `shadcn-web` skill; version bumps: `shadcn-versions`; test harness:
`testing-ui`; structural reference: `web-panel` / headless logic: `client-panel`.

## Invariants (the three durable decisions)

- No shadcn registries — primitives are hand-copied into each package's
  `src/@/components/ui/`; no `registries` in `components.json`.
- `@` alias is provided by the app at integration — packages import `@/components/ui/*` and build
  output keeps `@/…` specifiers verbatim (TS Bundler resolution); each package's local `src/@/`
  copy is dev/test-only; the `exports` map never exposes `./@/*`.
- Wrap `@owlmeans/client-panel` — shadcn packages render the same headless
  form/layout/react-hook-form logic; MUI → shadcn migration touches only rendered JSX.

Flag any deviation in review, especially registry usage or exposed `@/*` exports.
