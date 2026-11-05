import { describeHeadroom, formatDb, formatFrequency, parseDb } from "@/lib/eq-format"

describe("formatDb", () => {
  it("signs gains to one decimal, with a true minus", () => {
    expect(formatDb(1.5)).toBe("+1.5")
    expect(formatDb(-1.5)).toBe("−1.5")
    expect(formatDb(5.8)).toBe("+5.8")
    expect(formatDb(0)).toBe("0.0")
  })

  it("reads a gain that rounds to nothing as nothing, never as −0.0", () => {
    expect(formatDb(-0.04)).toBe("0.0")
    expect(formatDb(0.04)).toBe("0.0")
    expect(formatDb(-0.06)).toBe("−0.1")
  })
})

describe("parseDb", () => {
  it("takes a typed or a typographic minus, and a trailing dB", () => {
    expect(parseDb("-1.5")).toBe(-1.5)
    expect(parseDb("−1.5")).toBe(-1.5)
    expect(parseDb("+3 dB")).toBe(3)
    expect(parseDb(" 2.25 ")).toBe(2.25)
  })

  it("gives nothing for what isn't a number", () => {
    expect(parseDb("")).toBeNull()
    expect(parseDb("loud")).toBeNull()
    expect(parseDb("1.2.3")).toBeNull()
  })
})

describe("formatFrequency", () => {
  it("names bands the way a fader bank does", () => {
    expect([32, 500, 1000, 16000].map(formatFrequency)).toEqual(["32", "500", "1k", "16k"])
  })
})

describe("describeHeadroom", () => {
  const MY_EQ = [1.5, 2, 3, 0, -1.5, -1.5, 0, 1.5, 5.8, 5.8]

  it("takes the largest boost as headroom, so nothing clips", () => {
    expect(describeHeadroom(MY_EQ, 0, false)).toBe("Headroom −5.8 dB for the largest boost · no clipping, no limiter")
  })

  it("takes none when nothing is boosted", () => {
    expect(describeHeadroom([0, -2, -1], 0, false)).toBe("No boost, so no headroom taken · no clipping, no limiter")
  })

  it("says normalization can take more, for a song it lifts", () => {
    expect(describeHeadroom(MY_EQ, 0, true)).toContain("more for a song normalization lifts")
  })

  it("says a positive preamp, on top of the headroom, can clip", () => {
    expect(describeHeadroom(MY_EQ, 3, false)).toBe("Headroom −5.8 dB for the largest boost · the preamp's +3.0 dB can clip")
  })
})
