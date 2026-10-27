---
name: cookies
description: Why nothing here reads or writes cookie consent — two separate surfaces and the legal reason they stay apart.
metadata:
  purposes: consent, config
  mentions: consentStore, CookieConsent, @owlmeans/consent, @owlmeans/web-consent
---

# @owlmeans/web-marketing-consent — Cookies are a separate surface

## Cookies are a separate surface

**Nothing in this package reads or writes a device's cookie consent, and no consent here is bound
to a cookie category.** There is no bridge, no seeding of the ledger from the device, no
back-propagation of a saved decision into the cookie record, and no `trackers.*` consent. The cookie
dialog (`@owlmeans/consent`, `@owlmeans/web-consent`) keeps its own record — including the choices
it carries between an organisation's domains through its own linker — and a person who already
decided there is never asked the same question again, because this step cannot ask it.

That separation is the legal reason, not only a tidy one. A cookie banner collects an ePrivacy
Art. 5(3) consent: storage on this terminal, given before sign-in, not tied to an identified person.
The ledger is a GDPR Art. 6(1)(a) consent of the identified person, applied across devices and
server-side. Reusing the first for the second is the function creep EDPB Guidelines 05/2020 warns
about (§58; §56 on purpose specification), a silently seeded value shown pre-checked is the
pre-ticked box §79 and Recital 32 (CJEU C-673/17 *Planet49*) rule out, and "a device cookie said
yes" — possibly chosen on another domain — is weak evidence under Art. 7(1). A store this package
does not own is a store it does not write, in either direction.
