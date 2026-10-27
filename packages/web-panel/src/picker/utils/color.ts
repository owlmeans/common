import type { ColorUtils, DerivedColor, Oklch, Rgb } from './color/types.js'

/** The text-contrast floor every derived ink keeps — above the 3:1 icons and dots need. */
const TARGET = 4.5
const WHITE = '#ffffff'
const BLACK = '#000000'

const toLinear = (c: number): number => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
const fromLinear = (c: number): number => c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055

/** sRGB → OKLCH (Björn Ottosson's matrices). */
const toOklch = ({ r, g, b }: Rgb): Oklch => {
  const [lr, lg, lb] = [toLinear(r), toLinear(g), toLinear(b)]
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s

  return { l: L, c: Math.hypot(A, B), h: Math.atan2(B, A) }
}

/** OKLCH → linear sRGB channels, unclamped (out-of-gamut values fall outside 0..1). */
const toLinearRgb = ({ l, c, h }: Oklch): [number, number, number] => {
  const a = c * Math.cos(h)
  const b = c * Math.sin(h)
  const l3 = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m3 = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s3 = (l - 0.0894841775 * a - 1.291485548 * b) ** 3

  return [
    4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3,
    -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3,
    -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3,
  ]
}

const inGamut = (channels: [number, number, number]): boolean =>
  channels.every(channel => channel >= -1e-4 && channel <= 1 + 1e-4)

export const createColorUtils = (): ColorUtils => {
  const parse = (hex: string): Rgb | null => {
    const match = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim())
    if (match == null) {
      return null
    }
    const [r, g, b] = match.slice(1).map(part => parseInt(part, 16) / 255)

    return { r, g, b }
  }

  const hex = ({ r, g, b }: Rgb): string => `#${[r, g, b]
    .map(channel => Math.round(Math.min(1, Math.max(0, channel)) * 255).toString(16).padStart(2, '0'))
    .join('')}`

  const luminance = (value: string): number => {
    const rgb = parse(value) ?? { r: 0, g: 0, b: 0 }

    return 0.2126 * toLinear(rgb.r) + 0.7152 * toLinear(rgb.g) + 0.0722 * toLinear(rgb.b)
  }

  const contrast = (a: string, b: string): number => {
    const [x, y] = [luminance(a), luminance(b)]

    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
  }

  /** The colour at this lightness and hue with as much of `c` as sRGB can show, as hex. */
  const fit = (l: number, c: number, h: number): string => {
    let low = 0
    let high = c
    if (!inGamut(toLinearRgb({ l, c, h }))) {
      for (let step = 0; step < 24; step++) {
        const mid = (low + high) / 2
        if (inGamut(toLinearRgb({ l, c: mid, h }))) {
          low = mid
        } else {
          high = mid
        }
      }
    } else {
      low = c
    }
    const [r, g, b] = toLinearRgb({ l, c: low, h }).map(channel => fromLinear(Math.min(1, Math.max(0, channel))))

    return hex({ r, g, b })
  }

  /** Walk the lightness from `from` by `step` until `ok` holds; the far end (black or white) always does. */
  const walk = (from: number, step: number, c: number, h: number, ok: (candidate: string) => boolean): string => {
    for (let l = from; l >= 0 && l <= 1; l += step) {
      const candidate = fit(l, c, h)
      if (ok(candidate)) {
        return candidate
      }
    }

    return step < 0 ? BLACK : WHITE
  }

  const derive = (value: string): DerivedColor => {
    const base = toOklch(parse(value) ?? { r: 0, g: 0, b: 0 })
    // A grey has no hue to keep; any angle at zero chroma is the same grey.
    const h = base.c < 1e-4 ? 0 : base.h
    const soft = fit(0.965, Math.min(base.c, 0.035), h)
    const softDark = fit(0.25, Math.min(base.c, 0.06), h)
    const ink = walk(Math.min(base.l, 0.66), -0.01, base.c, h,
      candidate => contrast(candidate, WHITE) >= TARGET && contrast(candidate, soft) >= TARGET)
    const inkDark = walk(Math.max(base.l, 0.72), 0.01, Math.min(base.c, 0.16), h,
      candidate => contrast(candidate, BLACK) >= TARGET && contrast(candidate, softDark) >= TARGET)

    return { ink, soft, inkDark, softDark }
  }

  return { parse, hex, contrast, derive }
}

export const colorUtils = createColorUtils()
