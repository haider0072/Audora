import { NextRequest, NextResponse } from "next/server"

const API_KEY = process.env.YOUTUBE_API_KEY || ""
const SEARCH_URL = "https://www.googleapis.com/youtube/v3/search"
const VIDEO_URL = "https://www.googleapis.com/youtube/v3/videos"

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const artist = searchParams.get("artist")
  const title = searchParams.get("title")

  if (!artist || !title) {
    return NextResponse.json({ error: "artist and title are required" }, { status: 400 })
  }

  if (!API_KEY) {
    return NextResponse.json({ videos: [], totalResults: 0, query: `${artist} ${title}` })
  }

  try {
    const query = `${artist} ${title} official music video`
    const searchUrl = `${SEARCH_URL}?part=snippet&q=${encodeURIComponent(query)}&type=video&videoCategoryId=10&maxResults=5&key=${API_KEY}`

    const searchRes = await fetch(searchUrl)
    if (!searchRes.ok) {
      const errorBody = await searchRes.text()
      console.error("YouTube search API error:", searchRes.status, errorBody)
      return NextResponse.json({ videos: [], totalResults: 0, query })
    }

    const searchData = await searchRes.json()

    if (!searchData.items || searchData.items.length === 0) {
      return NextResponse.json({ videos: [], totalResults: 0, query })
    }

    // Get video details
    const videoIds = searchData.items.map((item: any) => item.id.videoId).join(",")
    const detailsUrl = `${VIDEO_URL}?part=contentDetails,statistics&id=${videoIds}&key=${API_KEY}`
    const detailsRes = await fetch(detailsUrl)
    const detailsData = detailsRes.ok ? await detailsRes.json() : { items: [] }

    const videos = searchData.items.map((item: any) => {
      const details = (detailsData.items || []).find((v: any) => v.id === item.id.videoId)
      return {
        id: item.id.videoId,
        title: item.snippet.title,
        thumbnail: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.default?.url,
        duration: details ? parseDuration(details.contentDetails.duration) : 0,
        channelTitle: item.snippet.channelTitle,
        publishedAt: item.snippet.publishedAt,
        viewCount: details?.statistics?.viewCount ? parseInt(details.statistics.viewCount) : 0,
      }
    })

    return NextResponse.json({
      videos,
      totalResults: searchData.pageInfo?.totalResults || videos.length,
      query,
    })
  } catch (error) {
    console.error("YouTube API route error:", error)
    return NextResponse.json({ videos: [], totalResults: 0, query: `${artist} ${title}` })
  }
}

function parseDuration(duration: string): number {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
  if (!match) return 0
  return parseInt(match[1] || "0") * 3600 + parseInt(match[2] || "0") * 60 + parseInt(match[3] || "0")
}
