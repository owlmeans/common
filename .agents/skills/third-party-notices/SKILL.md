---
name: third-party-notices
description: "Generate and retain mandatory third-party license texts and attributions in browser bundles, server bundles, copied UI packages and scaffolds. Use when changing build configs, vendored code, shipped fonts, or license notices."
---

# Third-party notices

**Install:** `"@owlmeans/dep-config": "^0.1.18-rc.7"` in build-time devDependencies.

Use `createThirdPartyNoticesPlugin` from `@owlmeans/dep-config/notices` in Rollup/Vite plugins.
Pass the build package's absolute `root`. The default output is `THIRD-PARTY-NOTICES.txt`.
Astro enables it only for its client environment; its rendering dependencies are build-only.

- The emitted module graph selects packages, including lazy chunks; exact resolved directories
  select versions. Workspace packages contribute their own copied-source notices. Export-subpath
  package.json files do not replace the containing npm package's license.
- Add CSS/font providers to `additionalPackages` when their assets reach the output without a JS
  module. Include Tailwind, imported animation CSS, shipped fonts and virtual Node polyfills as
  applicable. A linked Google Fonts URL does not redistribute a font file.
- Keep the upstream full grant and copyright in `THIRD-PARTY-NOTICES.txt` beside copied source,
  including shadcn primitives. Package tarballs and both normal and bare scaffolds retain it.
  Include it explicitly in a package's `files` whitelist when necessary.
- Preserve all applicable LICENSE, COPYING, copyright, NOTICE and embedded third-party documents,
  including nested vendored licenses. Monaco's third-party notices and both Lucide grants matter.
  Do not replace a full grant with an SPDX identifier or a link.
- Missing required grants fail before writing. Complete MIT license sections in installed README
  files are usable. Otherwise recover the relevant license from upstream, verify the component's
  subdirectory license rather than assuming the repository root license, and record an exact
  name/version entry with its source in the helper's offline recovery index. No network runs at build
  time. Never infer a copyright year or author. Recheck a recovery when the package version changes.
- Browser products link the plain-text asset using their actual base (`/iam/`, `/crm/`, or `/`).
  Translate the link label, keep upstream legal texts verbatim, and reference an independently
  loaded widget's own notices through `references`. The widget bundle carries a companion-file banner.
- Server builds retain notices beside executable output. Use distinct `fileName` values for
  multiple bundles in one directory and copy every corresponding text into the final image.
  External dependencies retain their installed documents. Internal-only server software needs no
  public marketing credit; external binary delivery requires a separate review of source obligations.
- A factual acknowledgement does not assert endorsement. Preserve BSD no-endorsement conditions;
  add no courtesy credits, logos or partner claims as part of mandatory notice work.

Verify collector tests, real bundle outputs, anonymous text-file access, package tarballs and
standalone scaffolds with locally packed builds. The collector retains notices; MPL/LGPL source
availability and other redistribution conditions still require evaluating the delivered artifact.

## External docs

- https://opensource.org/license/mit — preserve the upstream copyright and permission notice.
- https://www.apache.org/licenses/LICENSE-2.0 — section 4 requires the license and applicable NOTICE attributions; modified files need change notices.
- https://opensource.org/license/bsd-3-clause — retain copyright, conditions and disclaimer; do not imply endorsement.
- https://openfontlicense.org/open-font-license-official-text/ — distributed fonts retain the OFL and copyright, including reserved font names.
- https://www.mozilla.org/en-US/MPL/2.0/FAQ/ — unchanged executable/library redistribution can still require source-access notices.
- https://vite.dev/config/build-options.html#build-license — native license output alone does not cover copied source, fonts or separate NOTICE documents.
- https://github.com/shadcn-ui/ui/blob/main/LICENSE.md — upstream MIT grant for copied shadcn components.
