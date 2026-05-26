// Lucida needs no auth. These exports are kept for backwards compatibility
// with other routes that import them while the DAB → Lucida migration is in
// progress.

import { NextResponse } from "next/server"

export async function getSession(): Promise<string | null> {
  return "lucida"
}

export function getCookieHeader(): string {
  return ""
}

export function clearSession(): void {
  /* no-op */
}

export async function GET() {
  return NextResponse.json({ authenticated: true, hasCredentials: true })
}

export async function POST() {
  return NextResponse.json({ authenticated: true })
}
