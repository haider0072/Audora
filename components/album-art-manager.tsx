"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { toast } from "@/hooks/use-toast"
import { ImageIcon, RefreshCw, Trash2, AlertCircle, CheckCircle } from "lucide-react"
import { PlaylistStorage } from "@/lib/playlist-storage"

interface AlbumArtEntry {
  id: string
  songId: string
  size: number
}

interface AlbumArtManagerProps {
  songs: Array<{ id: string; title?: string; artist?: string; albumArt?: string }>
  onAlbumArtUpdate?: () => void
  showManager?: boolean
  setShowManager?: (open: boolean) => void
  hideTrigger?: boolean
}

export function AlbumArtManager({ songs, onAlbumArtUpdate, showManager: showManagerProp, setShowManager: setShowManagerProp, hideTrigger }: AlbumArtManagerProps) {
  const [albumArtEntries, setAlbumArtEntries] = useState<AlbumArtEntry[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [internalShowManager, internalSetShowManager] = useState(false)
  const showManager = showManagerProp !== undefined ? showManagerProp : internalShowManager;
  const setShowManager = setShowManagerProp !== undefined ? setShowManagerProp : internalSetShowManager;

  const loadAlbumArtEntries = async () => {
    try {
      setIsLoading(true)
      const entries = await PlaylistStorage.getAllAlbumArtEntries()
      setAlbumArtEntries(entries)
    } catch (error) {
      console.error("Error loading album art entries:", error)
      toast({
        title: "Error loading album art",
        description: "Failed to load album art information.",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (showManager) {
      loadAlbumArtEntries()
    }
  }, [showManager])

  const cleanupOrphanedAlbumArt = async () => {
    try {
      setIsLoading(true)
      const songIds = new Set(songs.map((song) => song.id))
      const orphanedEntries = albumArtEntries.filter((entry) => !songIds.has(entry.songId))

      if (orphanedEntries.length === 0) {
        toast({
          title: "No cleanup needed",
          description: "All album art entries are properly linked to songs.",
        })
        return
      }

      // Remove orphaned album art entries
      for (const entry of orphanedEntries) {
        await PlaylistStorage.removeAlbumArt(entry.songId)
      }

      await loadAlbumArtEntries()
      onAlbumArtUpdate?.()

      toast({
        title: "Cleanup completed",
        description: `Removed ${orphanedEntries.length} orphaned album art entries.`,
      })
    } catch (error) {
      console.error("Error cleaning up album art:", error)
      toast({
        title: "Cleanup failed",
        description: "Failed to clean up orphaned album art entries.",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 Bytes"
    const k = 1024
    const sizes = ["Bytes", "KB", "MB", "GB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
  }

  const totalAlbumArtSize = albumArtEntries.reduce((total, entry) => total + entry.size, 0)
  const linkedEntries = albumArtEntries.filter((entry) => songs.some((song) => song.id === entry.songId))
  const orphanedEntries = albumArtEntries.filter((entry) => !songs.some((song) => song.id === entry.songId))

  return (
    <Dialog open={showManager} onOpenChange={setShowManager}>
       {!hideTrigger && (
        <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 bg-transparent">
          <ImageIcon className="w-4 h-4" />
          Album Art
          {albumArtEntries.length > 0 && (
            <Badge variant="secondary" className="ml-1">
              {albumArtEntries.length}
            </Badge>
          )}
        </Button>
      </DialogTrigger>

      )}
      <DialogContent className="sm:max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ImageIcon className="w-5 h-5" />
            Album Art Manager
          </DialogTitle>
          <DialogDescription>Manage stored album art and optimize storage usage</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Summary Card */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Album Art Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-primary">{albumArtEntries.length}</div>
                  <div className="text-xs text-muted-foreground">Total Stored</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">{linkedEntries.length}</div>
                  <div className="text-xs text-muted-foreground">Linked</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-orange-600">{orphanedEntries.length}</div>
                  <div className="text-xs text-muted-foreground">Orphaned</div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Total Size:</span>
                  <span className="font-mono">{formatBytes(totalAlbumArtSize)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Average Size:</span>
                  <span className="font-mono">
                    {albumArtEntries.length > 0 ? formatBytes(totalAlbumArtSize / albumArtEntries.length) : "0 Bytes"}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={loadAlbumArtEntries}
              disabled={isLoading}
              className="flex-1 bg-transparent"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={cleanupOrphanedAlbumArt}
              disabled={isLoading || orphanedEntries.length === 0}
              className="flex-1 bg-transparent"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Cleanup ({orphanedEntries.length})
            </Button>
          </div>

          {/* Album Art List */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Stored Album Art</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-64">
                {isLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <RefreshCw className="w-6 h-6 animate-spin mr-2" />
                    <span>Loading album art entries...</span>
                  </div>
                ) : albumArtEntries.length === 0 ? (
                  <div className="text-center text-muted-foreground py-8">
                    <ImageIcon className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>No album art stored</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {albumArtEntries.map((entry) => {
                      const linkedSong = songs.find((song) => song.id === entry.songId)
                      const isOrphaned = !linkedSong

                      return (
                        <div
                          key={entry.id}
                          className={`flex items-center gap-3 p-3 rounded-lg border ${
                            isOrphaned ? "border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950" : ""
                          }`}
                        >
                          <div className="flex-shrink-0">
                            {isOrphaned ? (
                              <AlertCircle className="w-5 h-5 text-orange-500" />
                            ) : (
                              <CheckCircle className="w-5 h-5 text-green-500" />
                            )}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm">
                              {linkedSong ? (
                                <>
                                  {linkedSong.title || "Unknown Title"}
                                  {linkedSong.artist && (
                                    <span className="text-muted-foreground"> • {linkedSong.artist}</span>
                                  )}
                                </>
                              ) : (
                                <span className="text-orange-600">Orphaned Entry</span>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {formatBytes(entry.size)} • ID: {entry.songId.slice(0, 8)}...
                            </div>
                          </div>

                          <Badge variant={isOrphaned ? "destructive" : "default"} className="text-xs">
                            {isOrphaned ? "Orphaned" : "Linked"}
                          </Badge>
                        </div>
                      )
                    })}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Status Messages */}
          {orphanedEntries.length > 0 && (
            <div className="flex items-center gap-2 p-3 bg-orange-50 dark:bg-orange-950 rounded-lg text-sm">
              <AlertCircle className="w-4 h-4 text-orange-500 flex-shrink-0" />
              <span className="text-orange-700 dark:text-orange-300">
                {orphanedEntries.length} orphaned album art entries found. These can be safely removed to free up{" "}
                {formatBytes(orphanedEntries.reduce((total, entry) => total + entry.size, 0))} of storage.
              </span>
            </div>
          )}

          {linkedEntries.length === songs.length && orphanedEntries.length === 0 && albumArtEntries.length > 0 && (
            <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-950 rounded-lg text-sm">
              <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
              <span className="text-green-700 dark:text-green-300">
                All album art entries are properly linked and optimized.
              </span>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
