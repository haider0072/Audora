/**
 * @jest-environment node
 */
import { checkUploadName } from "@/lib/cloud/upload-name"

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