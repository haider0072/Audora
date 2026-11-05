"use client"

import { useState, type FormEvent } from "react"
import { Cloud, CloudOff, Loader2, LogOut, RefreshCw } from "lucide-react"

import { CloudUploadSection } from "@/components/cloud-upload-section"
import type { Song } from "@/lib/song"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { UseCloudLibraryReturn } from "@/hooks/use-cloud-library"

/**
 * Sign-in and status for the cloud library. Shared by the desktop dialog and
 * the mobile sheet; the shells only decide what frames it.
 */

interface CloudLibraryPanelProps {
  cloud: UseCloudLibraryReturn
  /** This device's songs, so the panel can offer to upload the ones the cloud lacks. */
  songs: readonly Song[]
}

export function CloudLibraryPanel({ cloud, songs }: CloudLibraryPanelProps) {
  const [password, setPassword] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const handleSignIn = async (event: FormEvent) => {
    event.preventDefault()
    if (!password) return
    setSubmitting(true)
    const ok = await cloud.signIn(password)
    setSubmitting(false)
    if (ok) setPassword("")
  }

  if (cloud.status === "unavailable") {
    return (
      <div className="flex items-start gap-3 text-sm text-muted-foreground">
        <CloudOff className="mt-0.5 h-4 w-4 shrink-0" />
        <p>This deployment has no cloud library configured. Local songs work as usual.</p>
      </div>
    )
  }

  if (cloud.status === "signed-out" || (cloud.status === "error" && cloud.songCount === 0)) {
    return (
      <form onSubmit={handleSignIn} className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Sign in to stream your cloud library on this device. Songs you already have here keep playing from
          the local copy.
        </p>
        <div className="space-y-2">
          <Label htmlFor="cloud-password">Password</Label>
          <Input
            id="cloud-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>
        {cloud.error ? <p className="text-sm text-destructive">{cloud.error}</p> : null}
        <Button type="submit" className="w-full" disabled={!password || submitting}>
          {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Cloud className="mr-2 h-4 w-4" />}
          Sign in
        </Button>
      </form>
    )
  }

  const indexing = cloud.pending > 0

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Cloud className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">
          {cloud.status === "loading" ? "Loading…" : `${cloud.songCount} songs in the cloud`}
        </span>
        {indexing ? (
          <Badge variant="secondary" className="gap-1">
            <Loader2 className="h-3 w-3 animate-spin" />
            Reading {cloud.pending} new
          </Badge>
        ) : null}
      </div>

      <p className="text-sm text-muted-foreground">
        Cloud songs stream on demand; nothing is stored on this device. Uploads appear here as soon as they
        have been read.
      </p>

      {cloud.error ? <p className="text-sm text-destructive">{cloud.error}</p> : null}

      {cloud.status === "ready" ? <CloudUploadSection songs={songs} /> : null}

      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={cloud.refresh} disabled={cloud.status === "loading"}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
        <Button variant="ghost" onClick={() => void cloud.signOut()}>
          <LogOut className="mr-2 h-4 w-4" />
          Sign out
        </Button>
      </div>

      <Button
        variant="link"
        size="sm"
        className="h-auto px-0 text-muted-foreground"
        onClick={() => void cloud.signOut({ everywhere: true })}
      >
        Sign out of all devices
      </Button>
    </div>
  )
}
