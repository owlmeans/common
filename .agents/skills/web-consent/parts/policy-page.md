---
name: policy-page
description: The generated CookiePolicy page — what it states, the regional rule, the services disclosure, the linker domain list and its heading structure.
metadata:
  purposes: consent, screen
  mentions: CookiePolicy, CookiePolicyProps, ConsentService, googleTagServices, data-cookie-policy
---

# @owlmeans/web-consent — The policy page

## The policy page

`CookiePolicy` states only what the widget provably does — the categories in force, the storage key,
the dual storage, the retention — all read from the same configuration the dialog renders. That is
why it is generated rather than written: a hand-written policy drifts the first time a category
changes, and nobody notices because nobody reads it until it matters.

```tsx
import { googleTagHelper } from '@owlmeans/web-gtm'

<CookiePolicy
  operator="Example Sp. z o.o." privacyHref="/legal/privacy" termsHref="/legal/terms"
  services={googleTag !== '' ? googleTagHelper.googleTagServices(googleTag) : undefined}
/>
```

Everything OwlMeans cannot assert on the operator's behalf — who the controller is, the lawful
basis, how to exercise rights — is deferred to those two links. It also renders a *Manage
preferences* control, so the policy page is a way back into the decision.

**`geo`**, the same object the dialog was given, adds the regional rule
(`[data-cookie-policy-regional]`, `policyRegional`) after the category list.

**`services`** (`ConsentService[]`, see the `consent` skill) discloses WHO receives data: each
service is listed inside the item of the category whose `key` it names — name, provider, purpose,
cookie names in `<code>`, and a link to the provider's privacy policy (new tab). A service whose
category is not among `categories` goes into a trailing *Other services* item rather than being
dropped. Without `services` the page renders exactly as it always has.

The structure stays one `h1` and lists: categories are `li`s, a category's services are a nested
`ul` named by `aria-label` (*Services — ‹category label›*), each service a `li` holding a `dl`.
Never add headings for categories or services — they would skip a level under the `h1`. Test and
CSS hooks: `[data-cookie-policy-category="<key>"]`, `[data-cookie-policy-services]`,
`[data-cookie-policy-service]`, `[data-cookie-policy-other]`.

**`linker`**, same shape as `CookieConsent`'s, adds a plain `[data-cookie-policy-domains]` LIST
(never a heading) right after the storage-key paragraph — the current host plus every domain
`linker.domains` names, computed the same direct way the dialog computes it. Omitted or with
nothing beyond the current host to disclose, nothing here renders.

The service labels (`policyProvider`, `policyPurpose`, `policyCookies`, `policyServicesOf`,
`policyServicePrivacy`, `policyOtherServices`, `policyOtherServicesDesc`) go through `translate`
with English defaults and are in the packaged bundle for every locale; the service's own `name`,
`provider` and `purpose` are data and render as given.
