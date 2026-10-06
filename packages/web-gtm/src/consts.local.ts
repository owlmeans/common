/**
 * The id shapes Google issues today, and nothing else.
 *
 * Deliberately strict — upper case, a known prefix, a bounded run of letters and digits — because
 * the id is typed by a person into a settings form and ends up inside an inline script and a
 * script URL. A value this pattern accepts cannot carry a quote, a tag or a second parameter, so
 * the check is what makes it safe to store, not only to emit. `UA-` is not here: Universal
 * Analytics stopped processing data in 2024, and accepting its ids would promise measurement that
 * never arrives.
 */
export const GOOGLE_TAG_ID = /^(GTM-[A-Z0-9]{4,12}|(G|GT|AW|DC)-[A-Z0-9]{4,16})$/

/** A queue name has to be a plain identifier: it becomes `window[name]` in the emitted script. */
export const JS_IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/

export const GOOGLE = 'Google LLC'

export const GOOGLE_PRIVACY = 'https://policies.google.com/privacy'

export const UNTIL_ANALYTICS = 'Until analytics cookies are accepted it sets no cookies and sends only '
  + 'cookieless measurement signals.'

export const UNTIL_MARKETING = 'Until marketing cookies are accepted it sets no cookies and ad click '
  + 'identifiers are redacted.'
