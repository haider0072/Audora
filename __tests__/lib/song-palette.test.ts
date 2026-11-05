import { accentColor, paletteFromPixels, rgbToHsl, ringColors, type Rgb } from "@/lib/song-palette"

/** RGBA pixel data: `count` pixels of each colour, in order. */
function pixelsOf(...runs: Array<[Rgb, number]>): Uint8ClampedArray {
  const total = runs.reduce((sum, [, count]) => sum + count, 0)
  const data = new Uint8ClampedArray(total * 4)
  let offset = 0
  for (const [[r, g, b], count] of runs) {
    for (let i = 0; i < count; i++) {
      data.set([r, g, b, 255], offset)
      offset += 4
    }
  }
  return data
}

/** CSS `hsl(h s% l%)` back to RGB. */
function parseHsl(css: string): Rgb {
  const match = /^hsl\((\d+) (\d+)% (\d+)%\)$/.exec(css)
  if (!match) throw new Error(`not an hsl() colour: ${css}`)
  const h = Number(match[1]) / 360
  const s = Number(match[2]) / 100
  const l = Number(match[3]) / 100
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const channel = (t: number) => {
    const u = t < 0 ? t + 1 : t > 1 ? t - 1 : t
    if (u < 1 / 6) return p + (q - p) * 6 * u
    if (u < 1 / 2) return q
    if (u < 2 / 3) return p + (q - p) * (2 / 3 - u) * 6
    return p
  }
  return [channel(h + 1 / 3) * 255, channel(h) * 255, channel(h - 1 / 3) * 255]
}

function luminance([r, g, b]: Rgb): number {
  const linear = (v: number) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
}

function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

const INK_0: Rgb = [11, 11, 10] // --ink-0, the page
const INK_2: Rgb = [25, 25, 23] // --ink-2, the lightest ink a mark sits on
const PAPER: Rgb = [244, 242, 238] // light --background

describe("rgbToHsl", () => {
  it.each<[Rgb, [number, number, number]]>([
    [[255, 0, 0], [0, 1, 0.5]],
    [[0, 255, 0], [120, 1, 0.5]],
    [[0, 0, 255], [240, 1, 0.5]],
    [[128, 128, 128], [0, 0, 128 / 255]],
  ])("converts %p", (rgb, [h, s, l]) => {
    const [ch, cs, cl] = rgbToHsl(rgb)
    expect(ch).toBeCloseTo(h)
    expect(cs).toBeCloseTo(s)
    expect(cl).toBeCloseTo(l)
  })
})

describe("paletteFromPixels", () => {
  it("returns nothing for a black and white cover", () => {
    expect(paletteFromPixels(pixelsOf([[0, 0, 0], 50], [[255, 255, 255], 50], [[120, 120, 120], 50]))).toBeNull()
  })

  it("ignores transparent pixels", () => {
    const data = pixelsOf([[220, 30, 30], 10])
    for (let i = 3; i < data.length; i += 4) data[i] = 0
    expect(paletteFromPixels(data)).toBeNull()
  })

  it("ranks the strongest hue first and keeps clearly different hues", () => {
    const palette = paletteFromPixels(
      pixelsOf([[30, 90, 220], 60], [[230, 140, 40], 30], [[40, 180, 90], 20]),
    )
    expect(palette).not.toBeNull()
    const hues = palette!.map((rgb) => rgbToHsl(rgb)[0])
    expect(hues[0]).toBeGreaterThan(200) // blue
    expect(hues[0]).toBeLessThan(240)
    expect(hues[1]).toBeGreaterThan(20) // orange
    expect(hues[1]).toBeLessThan(40)
    expect(hues[2]).toBeGreaterThan(130) // green
    expect(hues[2]).toBeLessThan(150)
  })

  it("fills out a one-colour cover with tones of that colour instead of inventing a hue", () => {
    const palette = paletteFromPixels(pixelsOf([[200, 40, 40], 40]))
    expect(palette).not.toBeNull()
    for (const rgb of palette!) {
      const [h, s] = rgbToHsl(rgb)
      expect(s).toBeGreaterThan(0)
      expect(Math.min(h, 360 - h)).toBeLessThan(5) // still red
    }
  })
})

describe("accentColor", () => {
  // Every hue, fully saturated, as a one-colour cover.
  const hues = Array.from({ length: 36 }, (_, i) => i * 10)
  const coverOfHue = (hue: number) => {
    const [r, g, b] = parseHsl(`hsl(${hue} 90% 50%)`).map(Math.round) as unknown as Rgb
    return paletteFromPixels(pixelsOf([[r, g, b], 20]))!
  }

  it.each(hues)("a hue %d° cover gives an accent that reads on ink and on paper", (hue) => {
    const palette = coverOfHue(hue)
    const onInk = parseHsl(accentColor(palette, "ink"))
    expect(contrast(onInk, INK_0)).toBeGreaterThanOrEqual(3)
    expect(contrast(onInk, INK_2)).toBeGreaterThanOrEqual(3)
    expect(contrast(parseHsl(accentColor(palette, "paper")), PAPER)).toBeGreaterThanOrEqual(3)
  })

  it.each(hues)("keeps the cover's hue (%d°)", (hue) => {
    const palette = coverOfHue(hue)
    const [h] = rgbToHsl(parseHsl(accentColor(palette, "ink")))
    const gap = Math.abs(h - hue)
    expect(Math.min(gap, 360 - gap)).toBeLessThan(6)
  })

  it("holds 3:1 across saturation and lightness, as the browser draws it", () => {
    const failures: string[] = []
    for (let hue = 0; hue < 360; hue += 15) {
      for (const saturation of [30, 55, 80, 100]) {
        for (const lightness of [25, 45, 65, 85]) {
          const rgb = parseHsl(`hsl(${hue} ${saturation}% ${lightness}%)`).map(Math.round) as unknown as Rgb
          const palette = paletteFromPixels(pixelsOf([rgb, 20]))!
          for (const [surface, ground] of [["ink", INK_2], ["paper", PAPER]] as const) {
            const css = accentColor(palette, surface)
            // The browser keeps 8-bit channels.
            const drawn = parseHsl(css).map(Math.round) as unknown as Rgb
            if (contrast(drawn, ground) < 3) failures.push(`${hue}° ${saturation}% ${lightness}% on ${surface}: ${css}`)
          }
        }
      }
    }
    expect(failures).toEqual([])
  })

  it("takes the palette's most vivid hue", () => {
    const palette = paletteFromPixels(pixelsOf([[120, 110, 100], 80], [[20, 200, 230], 30]))!
    const [h] = rgbToHsl(parseHsl(accentColor(palette, "ink")))
    expect(h).toBeGreaterThan(185)
    expect(h).toBeLessThan(195)
  })
})

describe("ringColors", () => {
  it.each(Array.from({ length: 12 }, (_, i) => i * 30))("lights for a hue %d° cover hold on both surfaces", (hue) => {
    const [r, g, b] = parseHsl(`hsl(${hue} 90% 50%)`).map(Math.round) as unknown as Rgb
    const palette = paletteFromPixels(pixelsOf([[r, g, b], 20]))!
    for (const css of ringColors(palette, "ink")) expect(contrast(parseHsl(css), INK_2)).toBeGreaterThanOrEqual(3)
    for (const css of ringColors(palette, "paper")) expect(contrast(parseHsl(css), PAPER)).toBeGreaterThanOrEqual(3)
  })

  it("returns three lights in the palette's order", () => {
    const palette = paletteFromPixels(
      pixelsOf([[30, 90, 220], 60], [[230, 140, 40], 30], [[40, 180, 90], 20]),
    )!
    const ring = ringColors(palette, "ink")
    expect(ring).toHaveLength(3)
    const ringHues = ring.map((css) => rgbToHsl(parseHsl(css))[0])
    const paletteHues = palette.map((rgb) => rgbToHsl(rgb)[0])
    ringHues.forEach((h, i) => expect(Math.abs(h - paletteHues[i])).toBeLessThan(3))
  })
})
