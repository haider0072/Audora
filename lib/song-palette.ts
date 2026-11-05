/**
 * A song's colours, read from its cover.
 *
 * Audora signs the interface with one colour of its own (blood red); every
 * other colour on screen belongs to the song that is playing. This module
 * turns a cover's pixels into that colour: the cover's strongest, clearly
 * different hues, and from them an accent that reads as a mark on the surface
 * it sits on, whatever the hue, a stronger one for words, and the deep lights
 * of the desktop's aura, which text reads over.
 *
 * Pure: it works on pixel data and never touches the DOM, so the colour rules
 * can be tested on their own. Reading pixels off an image lives in
 * `hooks/use-song-colors`.
 */

export type Rgb = readonly [number, number, number]
/** Hue in degrees (0–360), saturation and lightness as fractions (0–1). */
export type Hsl = readonly [number, number, number]

/** The cover's three strongest hues, strongest first. */
export type SongPalette = readonly [Rgb, Rgb, Rgb]

/** The two surfaces a mark can sit on: ink in the dark theme, paper in the light one. */
export type Surface = "ink" | "paper"

/**
 * The surface each theme draws marks on, as RGB for the contrast check.
 * Mirrors `--ink-2` (the raised panel, the lightest ink a mark sits on) and the
 * light theme's `--background` in app/globals.css.
 */
const SURFACE_RGB: Record<Surface, Rgb> = {
  ink: [25, 25, 23],
  paper: [244, 242, 238],
}

/** WCAG's minimum for non-text graphics, which is what these marks are. */
const MIN_CONTRAST = 3

/**
 * The dimmest text the desktop sets over its aura: `--muted-foreground` inside
 * `.desktop-frame` in app/globals.css. An aura that holds this text holds all
 * the brighter text above it too.
 */
const AURA_TEXT_RGB: Rgb = [196, 193, 186]

/** WCAG's minimum for body text, which is what sits over the aura. */
const MIN_TEXT_CONTRAST = 4.5

/** Each surface's text colour, `--foreground`, which a hover lights a row with. */
const FOREGROUND_RGB: Record<Surface, Rgb> = {
  ink: [241, 239, 234],
  paper: [23, 22, 20],
}

/**
 * What a row lays over what is under it (`.library-row::before` and `::after`
 * in app/globals.css): a hover's light of the text colour, and above it the
 * current song's tint of the accent.
 */
const ROW_HOVER = 0.06
const ROW_TINT = 0.17

/**
 * The page under the desktop's aura, `--ink-0`, and the least of it that the
 * scrim lays back over the aura (`.desktop-frame::before`, at its thinnest).
 * A blend of colours is never brighter than the brightest colour in it, so
 * text anywhere over the aura sits on nothing brighter than one light at full
 * strength under the scrim at its thinnest.
 */
const PAGE_RGB: Rgb = [11, 11, 10]
const AURA_SCRIM_MIN = 0.12

/** The aura keeps this much colour at least, so a soft cover still glows rather than greys, and no more than this. */
const AURA_SATURATION = { min: 0.45, max: 0.85 }

/** The aura's lightest light, before the contrast check takes it down to where its hue lets text read. */
const AURA_MAX_LIGHTNESS = 0.56

/** Each of the aura's three lights sits a little deeper than the one before, for depth whatever the cover. */
const AURA_DEPTH = [1, 0.86, 0.74] as const

/** Hue buckets, 20° each. */
const HUE_BUCKETS = 18

/** Pixels this dark, this bright or this grey say nothing about a cover's colour. */
const MIN_LIGHTNESS = 0.1
const MAX_LIGHTNESS = 0.95
const MIN_SATURATION = 0.2

interface Tone {
  minL: number
  maxL: number
  maxS: number
}

/** Where a song's accent starts on each surface, before the contrast check. */
const ACCENT_TONE: Record<Surface, Tone> = {
  ink: { minL: 0.64, maxL: 0.74, maxS: 0.82 },
  paper: { minL: 0.26, maxL: 0.34, maxS: 0.82 },
}

/** The wordmark ring's lights: lifted to glow on ink, deepened to hold on paper. */
const RING_TONE: Record<Surface, Tone> = {
  ink: { minL: 0.6, maxL: 0.76, maxS: 0.85 },
  paper: { minL: 0.3, maxL: 0.42, maxS: 0.85 },
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

export function rgbToHsl([red, green, blue]: Rgb): Hsl {
  const r = red / 255
  const g = green / 255
  const b = blue / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]

  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [h * 60, s, l]
}

export function hslToRgb([h, s, l]: Hsl): Rgb {
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const channel = (offset: number) => {
    let t = h / 360 + offset
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  return [Math.round(channel(1 / 3) * 255), Math.round(channel(0) * 255), Math.round(channel(-1 / 3) * 255)]
}

function relativeLuminance(rgb: Rgb): number {
  const [r, g, b] = rgb.map((value) => {
    const c = value / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/** `top` laid over `base` at `alpha`, the way the browser blends them: into 8-bit channels. */
function over([r, g, b]: Rgb, alpha: number, [baseR, baseG, baseB]: Rgb): Rgb {
  const blend = (top: number, base: number) => Math.round(top * alpha + base * (1 - alpha))
  return [blend(r, baseR), blend(g, baseG), blend(b, baseB)]
}

/** Everything a row can lay over a ground: nothing, a hover's light, the current song's tint, and both. */
function rowStates(ground: Rgb, surface: Surface, tint: Rgb): Rgb[] {
  const lit = over(FOREGROUND_RGB[surface], ROW_HOVER, ground)
  return [ground, lit, over(tint, ROW_TINT, ground), over(tint, ROW_TINT, lit)]
}

/** What text over one of the aura's lights can sit on there: the light under the scrim, bare or under a row. */
function auraGrounds(light: Rgb, tint: Rgb): Rgb[] {
  return rowStates(over(PAGE_RGB, AURA_SCRIM_MIN, light), "ink", tint)
}

function readsOver(text: Rgb, grounds: readonly Rgb[]): boolean {
  return grounds.every((ground) => contrastRatio(text, ground) >= MIN_TEXT_CONTRAST)
}

/** How much a colour stands out: saturated, and near the middle of the lightness range. */
function vividness([, s, l]: Hsl): number {
  return s * (1 - Math.abs(l - 0.55))
}

/** Steps between two hue buckets around the colour wheel. */
function hueGap(a: number, b: number): number {
  const d = Math.abs(a - b)
  return Math.min(d, HUE_BUCKETS - d)
}

interface Bucket {
  index: number
  weight: number
  r: number
  g: number
  b: number
}

/**
 * The cover's three strongest hues from its RGBA pixels, or `null` when the
 * cover has no colour to speak of (black and white, or nearly so). A song like
 * that gets the neutral accent rather than an invented hue.
 *
 * Each pixel votes for its hue bucket, weighted by how vivid it is. The picks
 * prefer clearly different hues and settle for neighbours only when the cover
 * has too few; a near-monochrome cover is filled out with a darker and a
 * lighter tone of its one colour, same hue.
 */
export function paletteFromPixels(pixels: Uint8ClampedArray): SongPalette | null {
  const buckets: Bucket[] = Array.from({ length: HUE_BUCKETS }, (_, index) => ({ index, weight: 0, r: 0, g: 0, b: 0 }))

  for (let i = 0; i + 3 < pixels.length; i += 4) {
    if (pixels[i + 3] < 128) continue // transparent
    const rgb: Rgb = [pixels[i], pixels[i + 1], pixels[i + 2]]
    const hsl = rgbToHsl(rgb)
    const [h, s, l] = hsl
    if (l < MIN_LIGHTNESS || l > MAX_LIGHTNESS || s < MIN_SATURATION) continue

    const weight = vividness(hsl)
    const bucket = buckets[Math.floor(h / (360 / HUE_BUCKETS)) % HUE_BUCKETS]
    bucket.weight += weight
    bucket.r += rgb[0] * weight
    bucket.g += rgb[1] * weight
    bucket.b += rgb[2] * weight
  }

  const ranked = buckets.filter((bucket) => bucket.weight > 0).sort((a, b) => b.weight - a.weight)
  if (ranked.length === 0) return null

  const picked: Bucket[] = []
  for (const minGap of [2, 1]) {
    for (const bucket of ranked) {
      if (picked.length === 3) break
      if (!picked.includes(bucket) && picked.every((p) => hueGap(p.index, bucket.index) >= minGap)) {
        picked.push(bucket)
      }
    }
  }

  const colours: Rgb[] = picked.map((bucket) => [
    Math.round(bucket.r / bucket.weight),
    Math.round(bucket.g / bucket.weight),
    Math.round(bucket.b / bucket.weight),
  ])
  const [h, s, l] = rgbToHsl(colours[0])
  if (colours.length === 1) colours.push(hslToRgb([h, s, l * 0.55]))
  if (colours.length === 2) colours.push(hslToRgb([h, s, Math.min(0.85, l * 1.4)]))
  return [colours[0], colours[1], colours[2]]
}

/** A fraction at the precision `toCss` writes it: whole percents. */
const toPercent = (fraction: number) => Math.round(fraction * 100) / 100

/**
 * Fit a colour to a surface: start inside the tone's range, then step away
 * from the surface's lightness until the mark holds 3:1 against it. Hues
 * differ a lot in luminance (a yellow is far brighter than a blue at the same
 * lightness), so a fixed range alone cannot promise that. The check runs on
 * the colour exactly as it will be written, so rounding cannot undo it.
 */
function readableOn([h, s, l]: Hsl, surface: Surface, tone: Tone): Hsl {
  const hue = Math.round(h)
  const saturation = toPercent(Math.min(s, tone.maxS))
  const step = surface === "ink" ? 0.02 : -0.02
  let lightness = toPercent(clamp(l, tone.minL, tone.maxL))
  while (
    contrastRatio(hslToRgb([hue, saturation, lightness]), SURFACE_RGB[surface]) < MIN_CONTRAST &&
    lightness > 0.04 &&
    lightness < 0.96
  ) {
    lightness = toPercent(lightness + step)
  }
  return [hue, saturation, lightness]
}

function toCss([h, s, l]: Hsl): string {
  return `hsl(${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%)`
}

/** The song's accent on a surface, as it will be written: its most vivid hue, made to read there. */
function accentHsl(palette: SongPalette, surface: Surface): Hsl {
  const best = palette.map(rgbToHsl).reduce((a, b) => (vividness(b) > vividness(a) ? b : a))
  return readableOn(best, surface, ACCENT_TONE[surface])
}

/** The song's accent on a surface, for marks: its most vivid hue, made to read there. */
export function accentColor(palette: SongPalette, surface: Surface): string {
  return toCss(accentHsl(palette, surface))
}

/**
 * The song's accent for words on a surface. Words need 4.5:1 where marks need
 * 3:1, and they sit on more than the bare surface: a row lit by a hover or
 * tinted as the current song's, and on ink the desktop's aura. The accent
 * keeps its hue and saturation and steps away from the surface until it reads
 * over all of it, so an accent that already reads stays as it is.
 */
export function accentTextColor(palette: SongPalette, surface: Surface): string {
  const [hue, saturation, markLightness] = accentHsl(palette, surface)
  const tint = hslToRgb([hue, saturation, markLightness])
  const grounds = rowStates(SURFACE_RGB[surface], surface, tint)
  if (surface === "ink") {
    for (const light of auraLights(palette)) grounds.push(...auraGrounds(hslToRgb(light), tint))
  }
  const step = surface === "ink" ? 0.02 : -0.02
  let lightness = markLightness
  while (!readsOver(hslToRgb([hue, saturation, lightness]), grounds) && lightness > 0.04 && lightness < 0.96) {
    lightness = toPercent(lightness + step)
  }
  return toCss([hue, saturation, lightness])
}

/** The wordmark ring's three lights for a song, in the palette's order. */
export function ringColors(palette: SongPalette, surface: Surface): readonly [string, string, string] {
  const [a, b, c] = palette.map((rgb) => toCss(readableOn(rgbToHsl(rgb), surface, RING_TONE[surface])))
  return [a, b, c]
}

/**
 * The brightest a light of this hue and saturation can be with text still
 * reading over it at 4.5:1, bare or under a row tinted `tint`: the lightness
 * steps down from the top until it does. Hues differ a lot in luminance, so
 * each finds its own place, and the check runs on the colour exactly as it
 * will be written.
 */
function auraLight(hue: number, saturation: number, tint: Rgb): number {
  let lightness = AURA_MAX_LIGHTNESS
  while (!readsOver(AURA_TEXT_RGB, auraGrounds(hslToRgb([hue, saturation, lightness]), tint)) && lightness > 0.04) {
    lightness = toPercent(lightness - 0.01)
  }
  return lightness
}

/** The aura's three lights for a song, as they will be written. */
function auraLights(palette: SongPalette): readonly [Hsl, Hsl, Hsl] {
  const tint = hslToRgb(accentHsl(palette, "ink"))
  const [a, b, c] = palette.map((rgb, index): Hsl => {
    const [h, s] = rgbToHsl(rgb)
    const hue = Math.round(h)
    const saturation = toPercent(clamp(s, AURA_SATURATION.min, AURA_SATURATION.max))
    return [hue, saturation, toPercent(auraLight(hue, saturation, tint) * AURA_DEPTH[index])]
  })
  return [a, b, c]
}

/**
 * The desktop's aura for a song, on ink: the cover's three hues as deep,
 * saturated lights, in the palette's order, each as bright as the text over
 * it allows and a little deeper than the last. A one-colour cover glows in
 * that one colour.
 */
export function auraColors(palette: SongPalette): readonly [string, string, string] {
  const [a, b, c] = auraLights(palette).map(toCss)
  return [a, b, c]
}
