import { NextResponse, type NextRequest } from "next/server"
import type { z } from "zod"

/**
 * The JSON body of a request to a cloud route. Server only.
 */

export type BodyRead<T> = { data: T; denied?: never } | { data?: never; denied: NextResponse }

/** The body when it is JSON that `schema` accepts, or the 400 the route answers with instead. */
export async function readJsonBody<T>(
  request: NextRequest,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
): Promise<BodyRead<T>> {
  const malformed = () => ({ denied: NextResponse.json({ error: "Malformed body" }, { status: 400 }) })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return malformed()
  }
  const parsed = schema.safeParse(body)
  return parsed.success ? { data: parsed.data } : malformed()
}
