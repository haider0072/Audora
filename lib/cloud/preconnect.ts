/**
 * Open the connection to R2 before the first song or cover needs it, so the
 * first play does not also pay for DNS and TLS. Client only.
 *
 * `crossorigin` matters: the audio elements and covers load in CORS mode,
 * and browsers keep CORS and non-CORS connections apart.
 */
export function preconnect(origin: string): void {
  if (typeof document === "undefined") return
  if (document.head.querySelector(`link[rel="preconnect"][href="${origin}"]`)) return

  const link = document.createElement("link")
  link.rel = "preconnect"
  link.href = origin
  link.crossOrigin = "anonymous"
  document.head.appendChild(link)
}
