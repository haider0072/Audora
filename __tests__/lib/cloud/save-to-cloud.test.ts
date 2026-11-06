/**
 * @jest-environment node
 */
import { saveTrackToCloud } from "@/lib/cloud/save-to-cloud"
import type { TidalTrack } from "@/lib/tidal-types"

const TRACK: TidalTrack = {
  id: "bib",
  title: "Back In Black",
  artist: "AC/DC",
  artistId: "acdc",
  albumTitle: "Back In Black",
  albumId: "bib-album",
  albumCover: "",
  releaseDate: "1980-07-25",
  genre: "Rock",
  duration: 255,
  audioQuality: "HI_RES_LOSSLESS",
}

describe("saveTrackToCloud", () => {
  const originalFetch = global.fetch
  const answer = (response: Response) => {
    global.fetch = jest.fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>().mockResolvedValue(response)
  }

  afterEach(() => {
    global.fetch = originalFetch
  })

  it("hands back where the server put the song", async () => {
    answer(Response.json({ status: "stored", key: "library/AC-DC - Back In Black.flac" }))
    await expect(saveTrackToCloud(TRACK, new AbortController().signal)).resolves.toEqual({
      status: "stored",
      key: "library/AC-DC - Back In Black.flac",
    })
  })

  it.each([
    [
      "the session ended",
      Response.json({ error: "Not signed in" }, { status: 401 }),
      "Signed out — sign in again, then retry",
    ],
    [
      "the server gave its reason",
      Response.json({ error: "The source could not send the song" }, { status: 502 }),
      "The source could not send the song",
    ],
    [
      "a gateway answered with its own page",
      new Response("<html>Timed out</html>", { status: 504 }),
      "Request failed (504)",
    ],
  ])("says why when %s", async (_label, response, message) => {
    answer(response)
    await expect(saveTrackToCloud(TRACK, new AbortController().signal)).rejects.toThrow(message)
  })
})
