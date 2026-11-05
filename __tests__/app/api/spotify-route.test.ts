/**
 * @jest-environment node
 */
import { NextRequest } from "next/server"

type Route = typeof import("@/app/api/spotify/route")

/** A fresh module per test: the route reads its credentials and caches its token at load. */
function loadRoute(): Route {
  let route!: Route
  jest.isolateModules(() => {
    route = jest.requireActual<Route>("@/app/api/spotify/route")
  })
  return route
}

function ask(route: Route) {
  return route.GET(new NextRequest("https://audora.test/api/spotify?artist=IU&title=Blueming"))
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })

const token = () => json({ access_token: "token", expires_in: 3600 })
const PREMIUM_REQUIRED =
  "Active premium subscription required for the owner of the app. When the subscription status changes, it can take a few hours before requests are allowed again."

const TRACK = {
  id: "t1",
  name: "Blueming",
  popularity: 70,
  external_urls: { spotify: "https://open.spotify.com/track/t1" },
  track_number: 2,
  duration_ms: 217000,
  artists: [{ id: "a1" }],
  album: { name: "Love poem", images: [{ url: "https://i.scdn.co/a.jpg" }], release_date: "2019-11-18", total_tracks: 6 },
}

describe("/api/spotify", () => {
  const savedEnv = { ...process.env }
  let fetchMock: jest.Mock
  let errors: jest.SpyInstance

  beforeEach(() => {
    process.env = { ...savedEnv, SPOTIFY_CLIENT_ID: "id", SPOTIFY_CLIENT_SECRET: "secret" }
    fetchMock = jest.fn()
    global.fetch = fetchMock
    errors = jest.spyOn(console, "error").mockImplementation(() => {})
  })

  afterEach(() => {
    process.env = savedEnv
    errors.mockRestore()
  })

  it("says Spotify refused, in Spotify's words, rather than that nothing was found", async () => {
    fetchMock.mockResolvedValueOnce(token()).mockResolvedValueOnce(new Response(PREMIUM_REQUIRED, { status: 403 }))

    const body = await (await ask(loadRoute())).json()

    expect(body).toEqual({ found: false, unavailable: PREMIUM_REQUIRED })
    expect(errors).toHaveBeenCalledWith("Spotify refused the search:", 403, PREMIUM_REQUIRED)
  })

  it("reads the reason out of a JSON refusal", async () => {
    fetchMock.mockResolvedValueOnce(json({ error: "invalid_client", error_description: "Invalid client" }, 400))

    const body = await (await ask(loadRoute())).json()

    expect(body).toEqual({ found: false, unavailable: "Invalid client" })
  })

  it("reports a song Spotify does not know as not found, with no refusal", async () => {
    fetchMock
      .mockResolvedValueOnce(token())
      .mockResolvedValueOnce(json({ tracks: { items: [] } }))
      .mockResolvedValueOnce(json({ tracks: { items: [] } }))

    const body = await (await ask(loadRoute())).json()

    expect(body).toEqual({ found: false })
  })

  it("answers without credentials by saying Spotify isn't set up", async () => {
    process.env = { ...savedEnv, SPOTIFY_CLIENT_ID: "", SPOTIFY_CLIENT_SECRET: "" }

    const body = await (await ask(loadRoute())).json()

    expect(body.found).toBe(false)
    expect(body.unavailable).toMatch(/isn't set up/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("returns the track, album and artist, and no related artists when Spotify closes that endpoint", async () => {
    fetchMock
      .mockResolvedValueOnce(token())
      .mockResolvedValueOnce(json({ tracks: { items: [TRACK] } }))
      .mockResolvedValueOnce(json({ id: "a1", name: "IU", genres: ["k-pop"], followers: { total: 9 }, popularity: 80 }))
      .mockResolvedValueOnce(json({ error: { status: 404, message: "Not found" } }, 404))

    const body = await (await ask(loadRoute())).json()

    expect(body.found).toBe(true)
    expect(body.track).toMatchObject({ name: "Blueming", trackNumber: 2, durationMs: 217000 })
    expect(body.album).toMatchObject({ name: "Love poem", releaseDate: "2019-11-18", totalTracks: 6 })
    expect(body.artist).toMatchObject({ name: "IU", genres: ["k-pop"], followers: 9 })
    expect(body.relatedArtists).toEqual([])
    expect(errors).not.toHaveBeenCalled()
  })
})
