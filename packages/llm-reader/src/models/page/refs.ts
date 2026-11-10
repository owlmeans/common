import { SKIPPED_TAGS } from './consts.js'
import type { RefMap } from './types.local.js'

/** Assign refs (`n1`, `n2`, … in preorder) to every element of the document. */
export const createRefMap = (document: Document): RefMap => {
  const toRef = new Map<Element, string>()
  const toElement = new Map<string, Element>()
  const ordered: Element[] = []
  const walk = (element: Element): void => {
    const ref = `n${ordered.length + 1}`
    ordered.push(element)
    toRef.set(element, ref)
    toElement.set(ref, element)
    if (SKIPPED_TAGS.has(element.tagName.toLowerCase())) return
    for (const child of Array.from(element.children)) walk(child)
  }
  if (document.documentElement != null) walk(document.documentElement)

  return {
    refOf: element => toRef.get(element),
    elementOf: ref => toElement.get(ref),
    orderOf: ref => Number(ref.slice(1)),
    elements: () => ordered,
  }
}
