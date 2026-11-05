"use client"

import { useEffect, useRef, useState } from "react"
import Image from "next/image"
import { Play } from "lucide-react"

import { StatusMessage } from "@/components/status-message"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useMusicVideos } from "@/hooks/use-song-info"
import type { Song } from "@/lib/song"
import { loadYouTubeApi, type YouTubePlayer } from "@/lib/youtube-player"
import type { YouTubeVideo } from "@/lib/youtube-service"
import { formatCompact, formatTime } from "@/lib/utils"

function videoDetails(video: YouTubeVideo): string {
  return [
    video.channelTitle,
    video.duration ? formatTime(video.duration) : null,
    video.viewCount ? `${formatCompact(video.viewCount)} views` : null,
  ]
    .filter(Boolean)
    .join(" · ")
}

interface VideoFrameProps {
  video: YouTubeVideo
  musicPlaying: boolean
  onVideoPlay: () => void
}

/** YouTube's player for one video, started by the tap that put it here. */
function VideoFrame({ video, musicPlaying, onVideoPlay }: VideoFrameProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<YouTubePlayer | null>(null)
  const [failed, setFailed] = useState(false)
  // The newest handler, for a player made once per video.
  const onVideoPlayRef = useRef(onVideoPlay)
  useEffect(() => {
    onVideoPlayRef.current = onVideoPlay
  })

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let current = true
    // The API replaces the element it is given, so it gets one of its own.
    const mount = document.createElement("div")
    host.appendChild(mount)
    loadYouTubeApi()
      .then((YT) => {
        if (!current) return
        playerRef.current = new YT.Player(mount, {
          videoId: video.id,
          width: "100%",
          height: "100%",
          playerVars: { autoplay: 1, rel: 0, modestbranding: 1, playsinline: 1, origin: window.location.origin },
          events: {
            onStateChange: (event) => {
              if (event.data === YT.PlayerState.PLAYING) onVideoPlayRef.current()
            },
            onError: (event) => {
              console.error("YouTube couldn't play the video:", event.data)
              if (current) setFailed(true)
            },
          },
        })
      })
      .catch((error: unknown) => {
        console.error(error)
        if (current) setFailed(true)
      })
    return () => {
      current = false
      playerRef.current?.destroy()
      playerRef.current = null
      host.replaceChildren()
    }
  }, [video.id])

  // The music and the video never play over each other: the music starting stops the video.
  useEffect(() => {
    if (musicPlaying) playerRef.current?.pauseVideo()
  }, [musicPlaying])

  return (
    <div className="video-frame">
      {/* Kept while a failure shows, so the player can still be taken down with it. */}
      <div ref={hostRef} className="video-host" hidden={failed} />
      {failed && <StatusMessage inline title="YouTube couldn't play this video" detail="Try another one below." />}
    </div>
  )
}

interface NowVideoProps {
  song: Song | null
  /** The music is playing. */
  musicPlaying: boolean
  /** A video started: the music pauses for it. */
  onVideoPlay: () => void
}

/**
 * The song's music video, played here. Nothing starts until it is tapped,
 * and the music and the video never play at once. Videos are looked up only
 * when this tab opens, so YouTube's quota is not spent on every song.
 */
export function NowVideo({ song, musicPlaying, onVideoPlay }: NowVideoProps) {
  const { resource, retry } = useMusicVideos(song)
  const [chosen, setChosen] = useState<{ songId: string; videoId: string; started: boolean } | null>(null)

  if (!song) return <StatusMessage title="Nothing playing" detail="A song's music video shows here." />

  switch (resource.status) {
    case "idle":
      return <StatusMessage title="Nothing to look for" detail="Finding a video takes the song's artist and title." />
    case "loading":
      return <StatusMessage title="Looking for a video…" />
    case "error":
      return <StatusMessage title="Couldn't look for a video" detail={resource.error} action={{ label: "Try again", onClick: retry }} />
    case "ready":
      break
  }

  const { videos } = resource.value
  if (videos.length === 0) return <StatusMessage title="No music video found" detail="YouTube has nothing that matches this song." />

  const mine = chosen?.songId === song.id ? chosen : null
  const video = videos.find((candidate) => candidate.id === mine?.videoId) ?? videos[0]
  const others = videos.filter((candidate) => candidate.id !== video.id)
  const choose = (picked: YouTubeVideo) => setChosen({ songId: song.id, videoId: picked.id, started: true })

  return (
    <ScrollArea className="video-scroll">
      <div className="video">
        <div className="video-stage">
          {mine?.started ? (
            <VideoFrame key={video.id} video={video} musicPlaying={musicPlaying} onVideoPlay={onVideoPlay} />
          ) : (
            <button type="button" className="video-poster" onClick={() => choose(video)} aria-label={`Play the video: ${video.title}`}>
              <Image src={video.thumbnail} alt="" fill sizes="(max-width: 768px) 100vw, 640px" unoptimized />
              <span className="video-play" aria-hidden="true">
                <Play />
              </span>
            </button>
          )}
        </div>
        <div className="video-info">
          <p className="video-title">{video.title}</p>
          <p className="about-meta">{videoDetails(video)}</p>
        </div>
        {others.length > 0 && (
          <div className="video-others">
            <h3 className="about-subheading">Other videos</h3>
            <ul className="video-list">
              {others.map((other) => (
                <li key={other.id}>
                  <button type="button" className="video-option" onClick={() => choose(other)}>
                    <Image className="video-option-thumb" src={other.thumbnail} alt="" width={96} height={54} unoptimized />
                    <span className="video-option-text">
                      <span className="video-option-title">{other.title}</span>
                      <span className="about-meta">{videoDetails(other)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </ScrollArea>
  )
}
