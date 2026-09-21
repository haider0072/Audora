import { NextRequest, NextResponse } from "next/server"

const TRANSLATE_URL = "https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=auto&tl=en"
const MAX_CHUNK_CHARS = 3500
const MAX_LINES = 600
const MAX_TOTAL_CHARS = 30000

interface ChunkResult {
  languages: string[]
  translations: (string | null)[]
}

// Each line goes as its own `q` param, so the response is one [translation, language]
// pair per line — alignment is exact and mixed-language songs are detected per line.
async function translateChunk(lines: string[]): Promise<ChunkResult> {
  const failed: ChunkResult = { languages: [], translations: lines.map(() => null) }

  const params = new URLSearchParams()
  for (const line of lines) params.append("q", line)

  const response = await fetch(TRANSLATE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body: params.toString(),
  })

  if (!response.ok) {
    console.error("Lyrics translation failed:", response.status)
    return failed
  }

  const data: unknown = await response.json()
  if (!Array.isArray(data) || data.length !== lines.length) return failed

  const languages: string[] = []
  const translations = data.map((entry) => {
    if (!Array.isArray(entry) || typeof entry[0] !== "string") return null
    const language = typeof entry[1] === "string" ? entry[1] : ""
    if (language) languages.push(language)
    return language === "en" ? null : entry[0].trim()
  })

  return { languages, translations }
}

function chunkLines(lines: string[]): string[][] {
  const chunks: string[][] = []
  let current: string[] = []
  let size = 0

  for (const line of lines) {
    if (current.length > 0 && size + line.length + 1 > MAX_CHUNK_CHARS) {
      chunks.push(current)
      current = []
      size = 0
    }
    current.push(line)
    size += line.length + 1
  }
  if (current.length > 0) chunks.push(current)

  return chunks
}

export async function POST(request: NextRequest) {
  let body: { lines?: unknown }

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (!Array.isArray(body.lines) || body.lines.some((line) => typeof line !== "string")) {
    return NextResponse.json({ error: "lines must be an array of strings" }, { status: 400 })
  }

  const lines = body.lines as string[]
  const totalChars = lines.reduce((sum, line) => sum + line.length, 0)
  if (lines.length === 0 || lines.length > MAX_LINES || totalChars > MAX_TOTAL_CHARS) {
    return NextResponse.json({ error: "Invalid lyrics size" }, { status: 400 })
  }

  try {
    const results = await Promise.all(chunkLines(lines).map(translateChunk))

    // Report the song's dominant language
    const counts = new Map<string, number>()
    for (const language of results.flatMap((result) => result.languages)) {
      counts.set(language, (counts.get(language) ?? 0) + 1)
    }
    const language = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

    return NextResponse.json({
      language,
      translations: results.flatMap((result) => result.translations),
    })
  } catch (error) {
    console.error("Lyrics translate route error:", error)
    return NextResponse.json({ language: null, translations: lines.map(() => null) })
  }
}
