/**
 * @jest-environment node
 */
import { looksLikeAudio } from "@/lib/cloud/audio-signature"

const bytes = (text: string, extra: number[] = []) => new Uint8Array([...Array.from(text, (c) => c.charCodeAt(0)), ...extra])

describe("looksLikeAudio", () => {
  it("recognises every accepted format", () => {
    expect(looksLikeAudio(bytes("fLaC\0\0\0\x22"))).toBe(true)
    expect(looksLikeAudio(bytes("ID3\x04\0\0"))).toBe(true)
    expect(looksLikeAudio(bytes("OggS\0\x02"))).toBe(true)
    expect(looksLikeAudio(bytes("RIFF\x24\0\0\0WAVE"))).toBe(true)
    expect(looksLikeAudio(bytes("\0\0\0\x20ftypM4A "))).toBe(true)
    expect(looksLikeAudio(new Uint8Array([0xff, 0xfb, 0x90, 0x00]))).toBe(true) // MPEG-1 Layer III
    expect(looksLikeAudio(new Uint8Array([0xff, 0xf1, 0x50, 0x80]))).toBe(true) // ADTS AAC
  })

  it("rejects documents, images and too-short heads", () => {
    expect(looksLikeAudio(bytes("<!doctype html>"))).toBe(false)
    expect(looksLikeAudio(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(false) // PNG
    expect(looksLikeAudio(bytes("RIFF\x24\0\0\0AVI "))).toBe(false)
    expect(looksLikeAudio(bytes("fLa"))).toBe(false)
    expect(looksLikeAudio(new Uint8Array(0))).toBe(false)
  })
})
