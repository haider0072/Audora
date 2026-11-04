/**
 * @jest-environment node
 */
import { NextRequest } from "next/server"

import { rejectCrossOrigin } from "@/lib/cloud/guard"

function post(headers: Record<string, string>) {
  return new NextRequest("https://audora.test/api/cloud/library/index", { method: "POST", headers })
}

describe("rejectCrossOrigin", () => {
  it("lets the app's own requests through", () => {
    expect(rejectCrossOrigin(post({ "sec-fetch-site": "same-origin" }))).toBeNull()
  })

  it("refuses requests from other sites, sibling subdomains and direct navigation", () => {
    for (const site of ["cross-site", "same-site", "none"]) {
      expect(rejectCrossOrigin(post({ "sec-fetch-site": site, origin: "https://audora.test" }))?.status).toBe(403)
    }
  })

  it("falls back to Origin only when the browser sends no Sec-Fetch-Site", () => {
    expect(rejectCrossOrigin(post({ origin: "https://audora.test" }))).toBeNull()
    expect(rejectCrossOrigin(post({ origin: "https://evil.test" }))?.status).toBe(403)
  })

  it("refuses a request that carries neither header", () => {
    expect(rejectCrossOrigin(post({}))?.status).toBe(403)
  })
})
