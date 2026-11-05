"use client"

import { useId, type ReactNode } from "react"
import Image from "next/image"
import { ExternalLink, User } from "lucide-react"

import { StatusMessage } from "@/components/status-message"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useArtistInfo, useSongInsights } from "@/hooks/use-song-info"
import { formatKilobits, formatKilohertz, qualityOf } from "@/lib/audio-quality"
import type { Song } from "@/lib/song"
import type { SpotifyResult } from "@/lib/spotify-service"
import { formatBytes } from "@/lib/storage-quota"
import { formatCompact, formatTime } from "@/lib/utils"

interface InsightSection {
  title: string
  content: string
}

/** The insights' `## Heading` sections, in order. Text without headings is one untitled section. */
export function insightSections(markdown: string): InsightSection[] {
  const sections = markdown
    .split(/^## /m)
    .map((part) => {
      const newline = part.indexOf("\n")
      if (newline === -1) return null
      return { title: part.slice(0, newline).trim(), content: part.slice(newline + 1).trim() }
    })
    .filter((section): section is InsightSection => !!section && !!section.title && !!section.content)
  return sections.length > 0 ? sections : [{ title: "", content: markdown.trim() }]
}

/** Everything the song's own file says about it, in reading order, leaving out what it does not say. */
export function fileFacts(song: Song): [label: string, value: string][] {
  const tier = qualityOf(song)?.tier
  const size = song.fileSize ?? song.file?.size
  const facts: [string, string | undefined][] = [
    ["Format", song.format?.toUpperCase()],
    ["Bit depth", song.bitDepth ? `${song.bitDepth}-bit` : undefined],
    ["Sample rate", song.sampleRate ? `${formatKilohertz(song.sampleRate)} kHz` : undefined],
    // Only a lossless file's figure is exact. Anything else gives an estimate,
    // which is left out, as the quality meter leaves it out.
    ["Bitrate", (tier === "hi-res" || tier === "lossless") && song.bitrate ? formatKilobits(song.bitrate) : undefined],
    ["Length", song.duration ? formatTime(song.duration) : undefined],
    ["Size", size ? formatBytes(size) : undefined],
    ["Loudness", song.loudnessLUFS !== undefined ? `${song.loudnessLUFS.toFixed(1)} LUFS` : undefined],
    ["Composer", song.composer],
    ["Lyricist", song.lyricist],
    ["Album artist", song.albumArtist && song.albumArtist !== song.artist ? song.albumArtist : undefined],
    ["Genre", song.genre],
    ["Year", song.year],
    ["Track", song.trackNumber],
    ["Disc", song.discNumber],
    ["Label", song.label],
    ["ISRC", song.isrc],
    ["Copyright", song.copyright],
    ["Encoder", song.encoder],
  ]
  return facts.filter((fact): fact is [string, string] => !!fact[1])
}

function formatReleaseDate(date: string): string {
  // Spotify gives a year, a month or a day, depending on what it knows.
  const precision = date.split("-").length
  const options: Intl.DateTimeFormatOptions =
    precision === 1 ? { year: "numeric" } : precision === 2 ? { year: "numeric", month: "long" } : { dateStyle: "long" }
  const parsed = new Date(precision === 1 ? `${date}-01-01` : date)
  return Number.isNaN(parsed.getTime()) ? date : new Intl.DateTimeFormat("en-US", { ...options, timeZone: "UTC" }).format(parsed)
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const id = useId()
  return (
    <section className="about-section" aria-labelledby={id}>
      <h3 id={id} className="about-heading">
        {title}
      </h3>
      {children}
    </section>
  )
}

function SongInsights({ song }: { song: Song }) {
  const { resource, retry } = useSongInsights(song)
  const again = { label: "Try again", onClick: retry }

  let body: ReactNode
  switch (resource.status) {
    case "idle":
      body = <StatusMessage inline title="Nothing to go on" detail="Writing about a song takes its artist and title." />
      break
    case "loading":
      body = <p className="about-note">Writing about this song…</p>
      break
    case "error":
      body = <StatusMessage inline title="Couldn't write about this song" detail={resource.error} action={again} />
      break
    case "ready": {
      const { available, content, error, model } = resource.value
      if (!available) {
        body = <StatusMessage inline title="Song insights aren't set up" detail="They need an OpenRouter key in .env.local." />
      } else if (!content) {
        body = <StatusMessage inline title="Couldn't write about this song" detail={error} action={again} />
      } else {
        body = (
          <>
            {insightSections(content).map((section, index) => (
              <div key={index} className="about-insight">
                {section.title && <h4 className="about-subheading">{section.title}</h4>}
                <p className="about-text">{section.content}</p>
              </div>
            ))}
            {model && <p className="about-credit">AI-written · {model}</p>}
          </>
        )
      }
    }
  }
  return <Section title="The song">{body}</Section>
}

function Popularity({ label, value }: { label: string; value: number }) {
  return (
    <div className="about-popularity">
      <dt>{label}</dt>
      <dd>
        <span className="about-popularity-bar" aria-hidden="true">
          <span style={{ transform: `scaleX(${value / 100})` }} />
        </span>
        <span className="type-data">{value} / 100</span>
      </dd>
    </div>
  )
}

function SpotifyDetails({ info }: { info: SpotifyResult }) {
  const { artist, album, track, relatedArtists = [] } = info
  return (
    <>
      {artist && (
        <div className="about-artist">
          {artist.image ? (
            <Image className="about-artist-photo" src={artist.image} alt="" width={64} height={64} unoptimized />
          ) : (
            <span className="about-artist-photo" aria-hidden="true">
              <User />
            </span>
          )}
          <div className="about-artist-text">
            <p className="about-artist-name">{artist.name}</p>
            <p className="about-meta">
              {[artist.followers > 0 ? `${formatCompact(artist.followers)} followers` : null, ...artist.genres.slice(0, 3)]
                .filter(Boolean)
                .join(" · ")}
            </p>
            {artist.spotifyUrl && (
              <a className="about-link" href={artist.spotifyUrl} target="_blank" rel="noopener noreferrer">
                Open on Spotify
                <ExternalLink aria-hidden="true" />
              </a>
            )}
          </div>
        </div>
      )}
      {album?.name && (
        <div className="about-album">
          {album.image && <Image className="about-album-cover" src={album.image} alt="" width={48} height={48} unoptimized />}
          <div className="about-artist-text">
            <p className="about-album-name">{album.name}</p>
            <p className="about-meta">
              {[album.releaseDate ? formatReleaseDate(album.releaseDate) : null, album.totalTracks ? `${album.totalTracks} tracks` : null]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
        </div>
      )}
      {(Boolean(track?.popularity) || Boolean(artist?.popularity)) && (
        <dl className="about-popularities">
          {track && track.popularity > 0 && <Popularity label="Song popularity" value={track.popularity} />}
          {artist && artist.popularity > 0 && <Popularity label="Artist popularity" value={artist.popularity} />}
        </dl>
      )}
      {relatedArtists.length > 0 && (
        <div className="about-related">
          <h4 className="about-subheading">Related artists</h4>
          <ul className="about-related-list">
            {relatedArtists.map((related) => (
              <li key={related.name}>
                <a href={related.spotifyUrl} target="_blank" rel="noopener noreferrer" className="about-related-artist">
                  {related.image ? (
                    <Image className="about-related-photo" src={related.image} alt="" width={48} height={48} unoptimized />
                  ) : (
                    <span className="about-related-photo" aria-hidden="true">
                      <User />
                    </span>
                  )}
                  <span className="about-related-name">{related.name}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  )
}

function ArtistInfo({ song }: { song: Song }) {
  const { resource, retry } = useArtistInfo(song)
  const again = { label: "Try again", onClick: retry }

  let body: ReactNode
  switch (resource.status) {
    case "idle":
      body = <StatusMessage inline title="Nothing to go on" detail="Looking up an artist takes the song's artist and title." />
      break
    case "loading":
      body = <p className="about-note">Looking up the artist…</p>
      break
    case "error":
      body = <StatusMessage inline title="Couldn't look up the artist" detail={resource.error} action={again} />
      break
    case "ready": {
      const info = resource.value
      if (info.unavailable) {
        body = (
          <StatusMessage inline title="Spotify isn't answering this app" detail={`Spotify says: ${info.unavailable}`} action={again} />
        )
      } else if (!info.found) {
        body = <StatusMessage inline title="Spotify doesn't know this song" detail="Its artist and title found no match." />
      } else {
        body = <SpotifyDetails info={info} />
      }
    }
  }
  return <Section title="The artist">{body}</Section>
}

function FileFacts({ song }: { song: Song }) {
  const facts = fileFacts(song)
  return (
    <Section title="The file">
      {facts.length > 0 ? (
        <dl className="about-facts">
          {facts.map(([label, value]) => (
            <div key={label} className="about-fact">
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="about-note">The file says nothing about itself.</p>
      )}
    </Section>
  )
}

/**
 * About the song on screen: what has been written about it, what Spotify
 * knows about its artist, and what its own file says. Each part stands on its
 * own, so the file's details show whether or not the others can be had.
 */
export function NowAbout({ song }: { song: Song | null }) {
  if (!song) return <StatusMessage title="Nothing playing" detail="Play a song to read about it." />
  return (
    // Keyed by song, so a new song is read from the top.
    <ScrollArea key={song.id} className="about-scroll">
      <div className="about">
        <SongInsights song={song} />
        <ArtistInfo song={song} />
        <FileFacts song={song} />
      </div>
    </ScrollArea>
  )
}
