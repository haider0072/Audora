/**
 * What a cloud route said when it refused a request. Pure and safe for the
 * browser.
 */

/** What a signed-in action says when the session ended under it. */
export const SIGNED_OUT_MESSAGE = "Signed out — sign in again, then retry"

/** The reason a cloud route gave, or its status when the answer carries none (a gateway's own page, say). */
export async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string }
    return body.error ?? `Request failed (${response.status})`
  } catch {
    return `Request failed (${response.status})`
  }
}
