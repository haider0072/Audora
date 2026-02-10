import { NextRequest, NextResponse } from "next/server"

const API_KEY = process.env.OPENROUTER_API_KEY || ""
const PRIMARY_MODEL = process.env.OPENROUTER_MODEL || "google/gemini-2.0-flash-001"
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

// Free model fallback chain — if primary is rate-limited, try alternatives
const FALLBACK_MODELS = [
  "google/gemma-3-12b-it:free",
  "meta-llama/llama-3.3-70b-instruct:free",
  "mistralai/mistral-small-3.1-24b-instruct:free",
]

interface InsightsRequest {
  title: string
  artist: string
  album?: string
  year?: string
  genre?: string
}

async function callOpenRouter(
  model: string,
  systemPrompt: string,
  userPrompt: string,
  referer: string,
): Promise<{ ok: true; content: string; model: string } | { ok: false; retryable: boolean }> {
  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": referer,
      "X-Title": "Audora Music Player",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 400,
      temperature: 0.7,
    }),
  })

  if (!response.ok) {
    const retryable = response.status === 429 || response.status === 503
    if (retryable) {
      console.warn(`Model ${model} rate-limited (${response.status}), trying fallback...`)
    } else {
      const errorBody = await response.text()
      console.error("OpenRouter API error:", response.status, errorBody)
    }
    return { ok: false, retryable }
  }

  const data = await response.json()
  const content = data.choices?.[0]?.message?.content
  if (!content) {
    return { ok: false, retryable: false }
  }

  return { ok: true, content, model: data.model || model }
}

export async function POST(request: NextRequest) {
  let body: InsightsRequest

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (!body.title || !body.artist) {
    return NextResponse.json({ error: "title and artist are required" }, { status: 400 })
  }

  if (!API_KEY) {
    return NextResponse.json({
      insights: null,
      available: false,
      reason: "AI insights not configured. Set OPENROUTER_API_KEY in .env.local",
    })
  }

  const metadataContext = [
    `Song: "${body.title}"`,
    `Artist: ${body.artist}`,
    body.album ? `Album: ${body.album}` : null,
    body.year ? `Year: ${body.year}` : null,
    body.genre ? `Genre: ${body.genre}` : null,
  ]
    .filter(Boolean)
    .join("\n")

  const systemPrompt = `Music expert. Reply with exactly 3 markdown sections, 2-3 sentences each. No fabrication.
## Story Behind the Song
## Meaning & Themes
## Did You Know?`

  const userPrompt = metadataContext
  const referer = request.headers.get("origin") || "https://audora.app"

  try {
    // Try primary model first
    const modelsToTry = [PRIMARY_MODEL, ...FALLBACK_MODELS.filter(m => m !== PRIMARY_MODEL)]

    for (const model of modelsToTry) {
      const result = await callOpenRouter(model, systemPrompt, userPrompt, referer)

      if (result.ok) {
        return NextResponse.json({
          insights: result.content,
          available: true,
          model: result.model,
        })
      }

      // If error is not retryable (e.g. auth failure), don't try other models
      if (!result.retryable) {
        break
      }
    }

    return NextResponse.json({
      insights: null,
      available: true,
      error: "All AI models are currently busy. Please try again in a moment.",
    })
  } catch (error) {
    console.error("AI insights route error:", error)
    return NextResponse.json({
      insights: null,
      available: true,
      error: "Failed to connect to AI service",
    })
  }
}
