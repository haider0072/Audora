/**
 * @jest-environment node
 */
import { checkUploadName, makeUploadName } from "@/lib/cloud/upload-rules"

describe("checkUploadName", () => {
  it("accepts an audio file name as it is", () => {
    expect(checkUploadName("01 3D (feat. Jack Harlow).flac")).toEqual({
      ok: true,
      name: "01 3D (feat. Jack Harlow).flac",
    })
  })

  it("normalises to NFC, so the same name from macOS and Android is one key", () => {
    const decomposed = "Café.flac"
    expect(checkUploadName(decomposed)).toEqual({ ok: true, name: "Café.flac" })
  })

  it.each([
    ["", "no name"],
    ["..", "no name"],
    ["../index/library-v1.json", "slashes"],
    ["a/b.flac", "slashes"],
    ["a\\b.flac", "slashes"],
    ["bad\u0000name.flac", "control"],
    ["line\nbreak.flac", "control"],
    [`${"x".repeat(251)}.flac`, "too long"],
    ["notes.txt", "Not an audio"],
    ["page.html", "Not an audio"],
  ])("rejects %j", (name, reason) => {
    const result = checkUploadName(name)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain(reason)
  })

  it("counts the limit in bytes, not characters", () => {
    expect(checkUploadName(`${"é".repeat(125)}.flac`).ok).toBe(true)
    expect(checkUploadName(`${"é".repeat(126)}.flac`).ok).toBe(false)
  })
})

describe("makeUploadName", () => {
  it("keeps a name the library already takes", () => {
    expect(makeUploadName("IU - Palette", "flac")).toBe("IU - Palette.flac")
  })

  it("turns slashes into dashes, so a name like AC/DC can go up", () => {
    expect(makeUploadName("AC/DC - Back In Black", "flac")).toBe("AC-DC - Back In Black.flac")
    expect(makeUploadName("Live \\ Studio", "m4a")).toBe("Live - Studio.m4a")
  })

  it("turns control characters into spaces", () => {
    expect(makeUploadName("Line\nBreak\u0000", "flac")).toBe("Line Break.flac")
  })

  it("normalises to NFC, as the cloud keys it", () => {
    expect(makeUploadName("Café", "flac")).toBe("Café.flac")
  })

  it("cuts a long name to fit the limit in bytes, between characters", () => {
    expect(makeUploadName("x".repeat(300), "flac")).toBe(`${"x".repeat(250)}.flac`)
    expect(makeUploadName("é".repeat(200), "flac")).toBe(`${"é".repeat(125)}.flac`)
    expect(makeUploadName("🎵".repeat(100), "flac")).toBe(`${"🎵".repeat(62)}.flac`)
  })

  it("leaves no space where the cut falls", () => {
    expect(makeUploadName(`${"x".repeat(249)} tail`, "flac")).toBe(`${"x".repeat(249)}.flac`)
  })

  it.each([
    ["a slash", "AC/DC - Back In Black"],
    ["a backslash", "a\\b"],
    ["a line break", "Line\nBreak"],
    ["a long name", "x".repeat(300)],
    ["a long accented name", "é".repeat(200)],
    ["a long emoji name", "🎵".repeat(100)],
    ["a decomposed accent", "Café"],
  ])("makes a name the library takes from %s", (_, stem) => {
    const name = makeUploadName(stem, "flac")
    expect(checkUploadName(name)).toEqual({ ok: true, name })
  })
})