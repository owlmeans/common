import { describe, expect, test } from 'bun:test'
import { CONSENT_KEY } from '@owlmeans/consent'
import { gtmHeadScript, gtmNoscriptFrame } from '../src/index.js'

const ID = 'GTM-TESTID1'

describe('@owlmeans/web-gtm — the head snippet', () => {
  test('the consent defaults are declared BEFORE the container is requested', async () => {
    // The entire reason this package exists. Consent Mode decides what a tag may do from the state
    // present when the container loads, so a `consent/default` that arrives after `gtm.js` leaves
    // the page unconfigured for the window that matters — and nothing reports it. Asserted on
    // offsets rather than on presence, because both strings are always present and only the order
    // has ever been wrong.
    const script = gtmHeadScript({ id: ID })

    const defaults = script.indexOf("'consent','default'")
    const container = script.indexOf('gtm.js')

    expect(defaults).toBeGreaterThanOrEqual(0)
    expect(container).toBeGreaterThanOrEqual(0)
    expect(defaults).toBeLessThan(container)
  })

  test('it reads a stored decision, so a returning visitor is not treated as denied', async () => {
    const script = gtmHeadScript({ id: ID })

    expect(script).toContain(JSON.stringify(CONSENT_KEY))
    expect(script).toContain("'consent','update'")
    // And the read happens before the container too — a decision applied afterwards is a decision
    // the first tag never saw.
    expect(script.indexOf("'consent','update'")).toBeLessThan(script.indexOf('gtm.js'))
  })

  test('the container id and queue name are injected as data, never interpolated raw', async () => {
    // These come from configuration, and configuration reaches this function as a string. JSON
    // encoding is what keeps a stray quote from closing the literal and turning the rest of an id
    // into executable script — the value still appears verbatim, and that is fine; what matters is
    // that a quote inside it is ESCAPED rather than terminating the string.
    const script = gtmHeadScript({ id: `${ID}"+alert(1)+"`, dataLayerName: 'owlLayer' })

    expect(script).toContain(JSON.stringify(`${ID}"+alert(1)+"`))
    expect(script).toContain(JSON.stringify('owlLayer'))
    // The escaped form is what makes it inert; the bare form would have closed the literal.
    expect(script).toContain('\\"+alert(1)+\\"')
    expect(script).not.toContain(`"${ID}"+alert(1)+""`)
  })

  test('a custom queue name is passed to the container', async () => {
    expect(gtmHeadScript({ id: ID, dataLayerName: 'owlLayer' })).toContain("l!='dataLayer'")
    expect(gtmHeadScript({ id: ID })).toContain(JSON.stringify('dataLayer'))
  })
})

describe('@owlmeans/web-gtm — the noscript frame', () => {
  test('it names the container and stays invisible', async () => {
    const frame = gtmNoscriptFrame({ id: ID })

    expect(frame).toContain(`id=${ID}`)
    expect(frame).toContain('display:none')
  })

  test('an id is URL-encoded, so it cannot break out of the attribute', async () => {
    expect(gtmNoscriptFrame({ id: 'a"b' })).not.toContain('a"b')
  })
})
