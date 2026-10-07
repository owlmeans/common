import type { InquiryButtonOptions, InquiryOpenEvent, InquiryOpenOptions, InquiryRuntime, InquiryRuntimeOptions, InquiryWidgetConfig } from '@owlmeans/common-inquiry'

/**
 * The few DOM members the SDK touches, recorded so a spec can see what happened: elements with
 * attributes and listeners, `head.appendChild`, `querySelectorAll` over `tag[attr]` /
 * `[attr="value"]`, and a window with timers and `location.assign`. A spec decides what an
 * injected script does through `onScript`.
 */
export interface FakeEvent {
  type: string
  button: number
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
  defaultPrevented: boolean
  preventDefault: () => void
}

export interface FakeElement {
  tagName: string
  src: string
  async: boolean
  getAttribute: (name: string) => string | null
  setAttribute: (name: string, value: string) => void
  addEventListener: (type: string, listener: (event: FakeEvent) => void) => void
  removeEventListener: (type: string, listener: (event: FakeEvent) => void) => void
  dispatch: (type: string, init?: Partial<FakeEvent>) => FakeEvent
  remove: () => void
}

export interface FakePage {
  elements: FakeElement[]
  assigned: string[]
  /** What an appended `<script>` does; default: nothing (it never loads). */
  onScript: (script: FakeElement) => void
  add: (tag: string, attributes?: Record<string, string>) => FakeElement
  scripts: () => FakeElement[]
  /** Install a runtime the way the bundle does, then fire the script's `load`. */
  install: (runtime: InquiryRuntime, script?: FakeElement) => void
  uninstall: () => void
}

const SELECTOR = /^([a-z]*)(?:\[([\w-]+)(?:="([^"]*)")?\])?$/

export const makePage = (): FakePage => {
  const elements: FakeElement[] = []
  const assigned: string[] = []
  const win: Record<string, unknown> = {
    location: { assign: (href: string) => assigned.push(href) },
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
    setInterval: globalThis.setInterval.bind(globalThis),
    clearInterval: globalThis.clearInterval.bind(globalThis),
  }

  const createElement = (tag: string): FakeElement => {
    const attributes = new Map<string, string>()
    const listeners = new Map<string, Set<(event: FakeEvent) => void>>()
    const element: FakeElement = {
      tagName: tag.toUpperCase(),
      get src() { return attributes.get('src') ?? '' },
      set src(value: string) { attributes.set('src', value) },
      async: false,
      getAttribute: name => attributes.get(name) ?? null,
      setAttribute: (name, value) => { attributes.set(name, value) },
      addEventListener: (type, listener) => {
        listeners.set(type, (listeners.get(type) ?? new Set()).add(listener))
      },
      removeEventListener: (type, listener) => { listeners.get(type)?.delete(listener) },
      dispatch: (type, init = {}) => {
        const event: FakeEvent = {
          type, button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false,
          defaultPrevented: false,
          preventDefault: () => { event.defaultPrevented = true },
          ...init,
        }
        for (const listener of [...(listeners.get(type) ?? [])]) {
          listener(event)
        }
        return event
      },
      remove: () => {
        const index = elements.indexOf(element)
        if (index >= 0) elements.splice(index, 1)
      },
    }
    return element
  }

  const page: FakePage = {
    elements,
    assigned,
    onScript: () => {},
    add: (tag, attributes = {}) => {
      const element = createElement(tag)
      Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, value))
      elements.push(element)
      return element
    },
    scripts: () => elements.filter(element => element.tagName === 'SCRIPT'),
    install: (runtime, script) => {
      win.__owlmeansInquiry = runtime
      script?.dispatch('load')
    },
    uninstall: () => {
      delete (globalThis as Record<string, unknown>).window
      delete (globalThis as Record<string, unknown>).document
    },
  }

  const doc = {
    createElement,
    head: {
      appendChild: (element: FakeElement) => {
        elements.push(element)
        if (element.tagName === 'SCRIPT') {
          queueMicrotask(() => page.onScript(element))
        }
        return element
      },
    },
    querySelectorAll: (selector: string): FakeElement[] => {
      const [, tag, name, value] = SELECTOR.exec(selector) ?? []
      return elements.filter(element =>
        (tag == null || tag === '' || element.tagName === tag.toUpperCase())
        && (name == null || (value == null ? element.getAttribute(name) != null : element.getAttribute(name) === value))
      )
    },
  }

  Object.assign(globalThis, { window: win, document: doc })
  return page
}

export interface FakeRuntime {
  runtime: InquiryRuntime
  configured: InquiryRuntimeOptions[]
  opened: { config: InquiryWidgetConfig, opts?: InquiryOpenOptions }[]
}

/** A runtime that behaves as the contract says: one `onOpen` per open, whatever opened it. */
export const makeRuntime = (version = 1): FakeRuntime => {
  const configured: InquiryRuntimeOptions[] = []
  const opened: FakeRuntime['opened'] = []
  const emit = (event: InquiryOpenEvent): void => configured.at(-1)?.onOpen?.(event)
  const tabOf = (config: InquiryWidgetConfig, tab?: string): string =>
    config.tabs.find(item => item.alias === tab)?.alias ?? config.defaultTab ?? config.tabs[0]!.alias

  const runtime: InquiryRuntime = {
    version,
    configure: options => { configured.push(options) },
    open: (config, opts) => {
      opened.push({ config, opts })
      emit({ widget: config.id, tab: tabOf(config, opts?.tab), source: opts?.source })
    },
    button: (config, opts?: InquiryButtonOptions) => ({
      open: more => emit({ widget: config.id, tab: tabOf(config, more?.tab), source: more?.source ?? opts?.source ?? 'fab' }),
      update: () => {},
      unmount: () => {},
    }),
    unmount: () => {},
  }

  return { runtime, configured, opened }
}
