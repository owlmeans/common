/**
 * Runs INSIDE the rendered page (serialized by Playwright — it may use nothing from this module's
 * scope). Writes the rules a script put only into the CSSOM — `insertRule` on a `<style>` (CSS-in-JS)
 * and adopted stylesheets — into `<style>` elements, so the serialized DOM keeps its look without the
 * scripts. Answers how many rules it wrote.
 */
export const inlineCssom = (): number => {
  let written = 0
  const textOf = (sheet: CSSStyleSheet): string | undefined => {
    try {
      return Array.from(sheet.cssRules).map(rule => rule.cssText).join('\n')
    } catch {
      return undefined // a cross-origin sheet keeps its own link
    }
  }
  for (const sheet of Array.from(document.styleSheets)) {
    const owner = sheet.ownerNode
    if (!(owner instanceof HTMLStyleElement)) continue
    const text = textOf(sheet)
    if (text == null || sheet.cssRules.length === 0) continue
    // A `<style>` whose text already holds every rule is left as written.
    const parsed = new CSSStyleSheet()
    try {
      parsed.replaceSync(owner.textContent ?? '')
    } catch {
      // unparseable text: its rules are whatever the CSSOM holds
    }
    if (parsed.cssRules.length === sheet.cssRules.length) continue
    owner.textContent = text
    written += sheet.cssRules.length
  }
  const adopted = (document as Document & { adoptedStyleSheets?: CSSStyleSheet[] }).adoptedStyleSheets ?? []
  for (const sheet of adopted) {
    const text = textOf(sheet)
    if (text == null || text === '') continue
    const style = document.createElement('style')
    style.setAttribute('data-owlmeans-adopted', '')
    style.textContent = text
    document.head.appendChild(style)
    written += sheet.cssRules.length
  }
  return written
}
