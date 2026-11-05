import {
  accentColor,
  accentTextColor,
  auraColors,
  paletteFromPixels,
  rgbToHsl,
  ringColors,
  roomColor,
  type Rgb,
  type SongPalette,
} from "@/lib/song-palette"

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

/** A CSS colour as the browser draws it, in 8-bit channels. */
function drawn(css: string): Rgb {
  const [r, g, b] = parseHsl(css)
  return [Math.round(r), Math.round(g), Math.round(b)]
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
const TEXT_ON_INK: Rgb = [241, 239, 234] // --foreground in the dark theme
const TEXT_ON_PAPER: Rgb = [23, 22, 20] // light --foreground
// `--muted-foreground` inside `.desktop-frame`: the dimmest text over the aura.
const MUTED_ON_AURA: Rgb = [196, 193, 186]

/** `top` over `base` at `alpha`, blended into 8-bit channels as the browser does. */
function over(top: Rgb, alpha: number, base: Rgb): Rgb {
  const blend = (i: number) => Math.round(top[i] * alpha + base[i] * (1 - alpha))
  return [blend(0), blend(1), blend(2)]
}

/**
 * What text in a row can sit on (`.library-row::before` and `::after`): the
 * ground itself, lit by a hover, tinted as the current song's at 17%, and both.
 */
function rowGrounds(ground: Rgb, text: Rgb, tint: Rgb): Rgb[] {
  const lit = over(text, 0.06, ground)
  return [ground, lit, over(tint, 0.17, ground), over(tint, 0.17, lit)]
}

/** One of the aura's lights where it glows brightest: under the scrim at its thinnest (12%). */
const underScrim = (light: Rgb) => over(INK_0, 0.12, light)

/** One-colour covers around the wheel, at every saturation and lightness worth telling apart. */
const SWEPT_COVERS: Array<[string, SongPalette]> = []
for (let hue = 0; hue < 360; hue += 15) {
  for (const saturation of [30, 55, 80, 100]) {
    for (const lightness of [25, 45, 65, 85]) {
      const name = `${hue}° ${saturation}% ${lightness}%`
      SWEPT_COVERS.push([name, paletteFromPixels(pixelsOf([drawn(`hsl(${name.replace("°", "")})`), 20]))!])
    }
  }
}

/** A fully saturated one-colour cover of a hue. */
const coverOfHue = (hue: number) => paletteFromPixels(pixelsOf([drawn(`hsl(${hue} 90% 50%)`), 20]))!

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
    for (const [cover, palette] of SWEPT_COVERS) {
      for (const [surface, ground] of [["ink", INK_2], ["paper", PAPER]] as const) {
        const css = accentColor(palette, surface)
        if (contrast(drawn(css), ground) < 3) failures.push(`${cover} on ${surface}: ${css}`)
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

describe("accentTextColor", () => {
  it("reads at 4.5:1 in a row lit and tinted any way, over the aura and on paper, as the browser draws it", () => {
    const failures: string[] = []
    for (const [cover, palette] of SWEPT_COVERS) {
      const inkText = drawn(accentTextColor(palette, "ink"))
      const inkTint = drawn(accentColor(palette, "ink"))
      const lit = [...auraColors(palette), roomColor(palette)].map((css) => underScrim(drawn(css)))
      const inkGrounds = [INK_2, ...lit].flatMap((ground) => rowGrounds(ground, TEXT_ON_INK, inkTint))
      if (inkGrounds.some((ground) => contrast(inkText, ground) < 4.5)) failures.push(`${cover} on ink`)

      const paperText = drawn(accentTextColor(palette, "paper"))
      const paperGrounds = rowGrounds(PAPER, TEXT_ON_PAPER, drawn(accentColor(palette, "paper")))
      if (paperGrounds.some((ground) => contrast(paperText, ground) < 4.5)) failures.push(`${cover} on paper`)
    }
    expect(failures).toEqual([])
  })

  it.each(Array.from({ length: 12 }, (_, i) => i * 30))(
    "keeps the accent's hue and saturation, moving only away from the surface (hue %d°)",
    (hue) => {
      const palette = coverOfHue(hue)
      for (const surface of ["ink", "paper"] as const) {
        const [mh, ms, ml] = rgbToHsl(parseHsl(accentColor(palette, surface)))
        const [th, ts, tl] = rgbToHsl(parseHsl(accentTextColor(palette, surface)))
        const gap = Math.abs(th - mh)
        expect(Math.min(gap, 360 - gap)).toBeLessThan(1)
        expect(ts).toBeCloseTo(ms, 1)
        if (surface === "ink") expect(tl).toBeGreaterThanOrEqual(ml)
        else expect(tl).toBeLessThanOrEqual(ml)
      }
    },
  )

  it("leaves an accent that already reads as words as it is", () => {
    // A yellow reads bright on ink; only a dim hue, like a blue, needs lifting.
    expect(accentTextColor(coverOfHue(60), "ink")).toBe(accentColor(coverOfHue(60), "ink"))
    expect(accentTextColor(coverOfHue(240), "ink")).not.toBe(accentColor(coverOfHue(240), "ink"))
  })
})

describe("ringColors", () => {
  it.each(Array.from({ length: 12 }, (_, i) => i * 30))("lights for a hue %d° cover hold on both surfaces", (hue) => {
    const palette = coverOfHue(hue)
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

describe("auraColors", () => {
  it("keeps the dimmest text at 4.5:1 over every light, bare or in a row lit and tinted any way, as the browser draws it", () => {
    const failures: string[] = []
    for (const [cover, palette] of SWEPT_COVERS) {
      const tint = drawn(accentColor(palette, "ink"))
      for (const css of auraColors(palette)) {
        const grounds = rowGrounds(underScrim(drawn(css)), TEXT_ON_INK, tint)
        if (grounds.some((ground) => contrast(MUTED_ON_AURA, ground) < 4.5)) failures.push(`${cover}: ${css}`)
      }
    }
    expect(failures).toEqual([])
  })

  it.each(Array.from({ length: 12 }, (_, i) => i * 30))("glows as brightly as the text allows (hue %d°)", (hue) => {
    const palette = coverOfHue(hue)
    const tint = drawn(accentColor(palette, "ink"))
    const [first] = auraColors(palette)
    const [, h, s, l] = /^hsl\((\d+) (\d+)% (\d+)%\)$/.exec(first)!.map(Number)
    // A step brighter would no longer hold the text somewhere, so the light is no dimmer than it has to be.
    const brighter = underScrim(drawn(`hsl(${h} ${s}% ${l + 1}%)`))
    expect(rowGrounds(brighter, TEXT_ON_INK, tint).some((ground) => contrast(MUTED_ON_AURA, ground) < 4.5)).toBe(true)
  })

  it("keeps each of the cover's hues, in the palette's order, each deeper than the last", () => {
    const palette = paletteFromPixels(pixelsOf([[30, 90, 220], 60], [[230, 140, 40], 30], [[40, 180, 90], 20]))!
    const aura = auraColors(palette).map((css) => rgbToHsl(parseHsl(css)))
    const paletteHues = palette.map((rgb) => rgbToHsl(rgb)[0])
    aura.forEach(([h], i) => expect(Math.abs(h - paletteHues[i])).toBeLessThan(3))
    const [[, , l1], [, , l2], [, , l3]] = aura
    expect(l2).toBeLessThan(l1)
    expect(l3).toBeLessThan(l2)
  })

  it("lifts a soft cover's colour, so the aura glows rather than greys", () => {
    // Saturation 0.24: enough to count as colour, too little to glow unaided.
    const palette = paletteFromPixels(pixelsOf([[160, 120, 100], 40]))!
    for (const css of auraColors(palette)) {
      expect(rgbToHsl(parseHsl(css))[1]).toBeGreaterThanOrEqual(0.44)
    }
  })
})

describe("roomColor", () => {
  it("keeps the dimmest text at 4.5:1 over the room, bare or in a row lit and tinted any way, as the browser draws it", () => {
    const failures: string[] = []
    for (const [cover, palette] of SWEPT_COVERS) {
      const tint = drawn(accentColor(palette, "ink"))
      const css = roomColor(palette)
      const grounds = rowGrounds(underScrim(drawn(css)), TEXT_ON_INK, tint)
      if (grounds.some((ground) => contrast(MUTED_ON_AURA, ground) < 4.5)) failures.push(`${cover}: ${css}`)
    }
    expect(failures).toEqual([])
  })

  it("is the cover's strongest hue, deep, under lights brighter than itself", () => {
    const palette = paletteFromPixels(pixelsOf([[30, 90, 220], 60], [[230, 140, 40], 30], [[40, 180, 90], 20]))!
    const room = roomColor(palette)
    const [h, , l] = rgbToHsl(parseHsl(room))
    expect(Math.abs(h - rgbToHsl(palette[0])[0])).toBeLessThan(3)
    expect(l).toBeGreaterThan(0.1)
    expect(l).toBeLessThan(0.17)
    for (const css of auraColors(palette)) expect(luminance(drawn(css))).toBeGreaterThan(luminance(drawn(room)))
  })

  it("keeps a soft cover's colour, and holds a loud one back to a ground", () => {
    const soft = paletteFromPixels(pixelsOf([[160, 120, 100], 40]))!
    expect(rgbToHsl(parseHsl(roomColor(soft)))[1]).toBeGreaterThanOrEqual(0.39)
    expect(rgbToHsl(parseHsl(roomColor(coverOfHue(200))))[1]).toBeLessThanOrEqual(0.71)
  })
})
