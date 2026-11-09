import type { CaptchaDocument, CaptchaWindow, Grecaptcha } from '../src/types.js'

/** An element as the loader uses it: attributes, listeners, `src`/`async`/`textContent`, `remove`. */
export interface PageElement {
  tag: string
  attributes: Record<string, string>
  src?: string
  async?: boolean
  textContent?: string | null
  removed: boolean
  setAttribute: (name: string, value: string) => void
  addEventListener: (type: string, listener: () => void) => void
  remove: () => void
  /** Run the listeners of `type`, as the browser would. */
  fire: (type: string) => void
}

export interface TestPage {
  document: CaptchaDocument
  window: CaptchaWindow
  /** What the loader appended to the head, in order (removed ones included, flagged). */
  head: PageElement[]
  /** The scripts still in the head. */
  scripts: () => PageElement[]
  /** Google's script arrives: `grecaptcha` (ready at once) is installed and `load` fires. */
  arrive: (script: PageElement, grecaptcha?: Grecaptcha | null) => void
}

const makeElement = (tag: string): PageElement => {
  const listeners: Record<string, (() => void)[]> = {}
  const element: PageElement = {
    tag,
    attributes: {},
    removed: false,
    setAttribute: (name, value) => { element.attributes[name] = value },
    addEventListener: (type, listener) => { (listeners[type] ??= []).push(listener) },
    remove: () => { element.removed = true },
    fire: type => { (listeners[type] ?? []).forEach(listener => listener()) },
  }

  return element
}

/** A page stand-in (document + window) for the loader's pure logic — no browser. */
export const makeTestPage = (): TestPage => {
  const head: PageElement[] = []
  const window: CaptchaWindow = {}

  const querySelector = (selector: string): PageElement | null => {
    const [, tag, attribute] = /^(\w+)\[([^\]=]+)\]$/.exec(selector) ?? []

    return head.find(element => !element.removed && element.tag === tag && attribute in element.attributes) ?? null
  }

  const document = {
    head: { appendChild: (element: PageElement) => { head.push(element); return element } },
    createElement: makeElement,
    querySelector,
  } as unknown as CaptchaDocument

  const arrive: TestPage['arrive'] = (script, grecaptcha) => {
    window.grecaptcha = grecaptcha === null ? undefined : grecaptcha ?? {
      ready: callback => { callback() },
      execute: async (siteKey, { action }) => `token:${siteKey}:${action}`,
    }
    script.fire('load')
  }

  return {
    document, window, head, arrive,
    scripts: () => head.filter(element => element.tag === 'script' && !element.removed),
  }
}
