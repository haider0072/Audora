"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "./ui/dropdown-menu";
import { Progress } from "@/components/ui/progress"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { toast } from "@/hooks/use-toast"
import { Database, Download, HardDrive, Info, RotateCcw, AlertTriangle, CheckCircle, XCircle, EllipsisVertical, ImageIcon, Trash2, Shield } from "lucide-react"
import { PlaylistStorage, type StorageInfo } from "@/lib/playlist-storage"
import { formatBytes, STORAGE_WARN_THRESHOLD } from "@/lib/storage-quota"
import { AlbumArtManager } from "./album-art-manager"

interface PlaylistManagerProps {
  songCount: number
  songs: Array<{ id: string; title?: string; artist?: string; albumArt?: string }>
  onPlaylistReset: () => void
}

export function PlaylistManager({ songCount, songs, onPlaylistReset }: PlaylistManagerProps) {
  const [storageInfo, setStorageInfo] = useState<StorageInfo>({
    used: 0,
    available: 0,
    songs: 0,
    albumArtCount: 0,
    albumArtSize: 0,
    quota: {
      usage: 0,
      quota: 0,
      available: 0,
      percentUsed: 0,
      persisted: false,
      supported: false,
    },
  })
  const [isLoading, setIsLoading] = useState(false)
  const [showStorageInfo, setShowStorageInfo] = useState(false)
  const [showManager, setShowManager] = useState(false)
  const [reclaimLoading, setReclaimLoading] = useState(false)
  const [orphanCount, setOrphanCount] = useState(0)
  const [showReclaimConfirm, setShowReclaimConfirm] = useState(false)

  const updateStorageInfo = async () => {
    try {
      const info = await PlaylistStorage.getStorageInfo()
      setStorageInfo(info)
    } catch (error) {
      console.error("Error updating storage info:", error)
    }
  }

  useEffect(() => {
    updateStorageInfo()
  }, [songCount])

  const handleResetPlaylist = async () => {
    setIsLoading(true)
    try {
      await PlaylistStorage.clearPlaylist()
      onPlaylistReset()
      await updateStorageInfo()

      toast({
        title: "Playlist reset successfully",
        description: "All songs and data have been cleared from storage.",
      })
    } catch (error) {
      console.error("Error resetting playlist:", error)
      toast({
        title: "Error resetting playlist",
        description: "There was an error clearing the playlist data.",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleExportMetadata = () => {
    try {
      const metadata = PlaylistStorage.exportPlaylistMetadata()
      const blob = new Blob([metadata], { type: "application/json" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `playlist-metadata-${new Date().toISOString().split("T")[0]}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      toast({
        title: "Metadata exported",
        description: "Playlist metadata has been downloaded as JSON file.",
      })
    } catch (error) {
      console.error("Error exporting metadata:", error)
      toast({
        title: "Export failed",
        description: "There was an error exporting the playlist metadata.",
        variant: "destructive",
      })
    }
  }

  /**
   * Song ids the sweep is allowed to treat as reachable.
   *
   * Read straight from persisted metadata rather than from the `songs` prop:
   * the sweep must agree with what is actually saved, and an empty result here
   * means metadata is unavailable — in which case sweeping would consider the
   * entire library unreachable.
   */
  const getKnownSongIds = (): string[] =>
    PlaylistStorage.loadPlaylistMetadata()?.songs.map((song) => song.id) ?? []

  const handleReclaimSpace = async () => {
    const knownIds = getKnownSongIds()
    if (knownIds.length === 0) {
      toast({
        title: "Cannot reclaim space",
        description: "Playlist metadata is not loaded. Please refresh and try again.",
        variant: "destructive",
      })
      return
    }

    setReclaimLoading(true)
    try {
      const report = await PlaylistStorage.countOrphans(knownIds)
      setOrphanCount(report.records)

      if (report.records === 0) {
        toast({ title: "No orphaned files found", description: "Your storage is clean." })
        return
      }

      setShowReclaimConfirm(true)
    } catch (error) {
      console.error("Error counting orphans:", error)
      toast({
        title: "Error checking storage",
        description: "Could not analyze orphaned files.",
        variant: "destructive",
      })
    } finally {
      setReclaimLoading(false)
    }
  }

  const handleConfirmReclaim = async () => {
    const knownIds = getKnownSongIds()
    if (knownIds.length === 0) {
      toast({
        title: "Cannot reclaim space",
        description: "Playlist metadata is not loaded. Please refresh and try again.",
        variant: "destructive",
      })
      return
    }

    setReclaimLoading(true)
    try {
      const result = await PlaylistStorage.sweepOrphans(knownIds)
      await updateStorageInfo()

      toast({
        title: "Space reclaimed",
        description: `Removed ${result.removedRecords} unreachable file(s), freeing ${formatBytes(result.bytesReclaimed)}.`,
      })
      setShowReclaimConfirm(false)
    } catch (error) {
      console.error("Error reclaiming space:", error)
      toast({
        title: "Error reclaiming space",
        description: error instanceof Error ? error.message : "Could not remove orphaned files.",
        variant: "destructive",
      })
    } finally {
      setReclaimLoading(false)
    }
  }

  return (
    <div className="flex items-center gap-4">
      {songCount > 0 && (
        <span style={{ display: 'none' }}>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                id="reset-playlist-trigger"
                variant="outline"
                size="sm"
                className="text-destructive hover:text-destructive bg-transparent gap-2"
                disabled={isLoading}
              >
                <RotateCcw className="w-4 h-4" />
                Reset Playlist
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-destructive" />
                  Reset Playlist
                </AlertDialogTitle>
                <AlertDialogDescription asChild>
                  <div className="text-sm text-muted-foreground space-y-3">
                    <div>
                      This will permanently remove all songs from your playlist and clear all stored data. This action
                      cannot be undone.
                    </div>
                    <div className="bg-muted p-3 rounded-lg space-y-2">
                      <div className="font-medium text-sm">What will be cleared:</div>
                      <ul className="text-sm space-y-1 text-muted-foreground">
                        <li>• {songCount} songs from playlist</li>
                        <li>• {formatBytes(storageInfo.used - storageInfo.albumArtSize)} of audio files</li>
                        <li>
                          • {storageInfo.albumArtCount} album art images ({formatBytes(storageInfo.albumArtSize)})
                        </li>
                        <li>• All song metadata and playback state</li>
                      </ul>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
                      <AlertTriangle className="w-4 h-4" />
                      <span>Your equalizer settings and preferences will be preserved.</span>
                    </div>
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleResetPlaylist}
                  disabled={isLoading}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {isLoading ? "Resetting..." : "Reset Playlist"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </span>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
            <EllipsisVertical className="w-4 h-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {/* Storage Info Trigger */}
          <DropdownMenuItem onClick={() => setShowStorageInfo(true)} className="gap-2">
            <Database className="w-4 h-4" />
            Storage
          </DropdownMenuItem>
          {/* Album Art Manager Trigger */}
          <DropdownMenuItem onClick={() => setShowManager(true)} className="gap-2">
            <ImageIcon className="w-4 h-4" />
            Album Art Manager
          </DropdownMenuItem>
          {/* Reset Playlist Trigger */}
          {songCount > 0 && (
            <DropdownMenuItem onClick={() => {
              const btn = document.getElementById('reset-playlist-trigger');
              if (btn) btn.click();
            }} className="text-destructive gap-2">
              <RotateCcw className="w-4 h-4" />
              Reset Playlist
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Reclaim Space Confirmation Dialog — opened from the storage panel once
          the orphan count is known, so it is driven by state rather than a
          hidden trigger element. */}
      <AlertDialog open={showReclaimConfirm} onOpenChange={setShowReclaimConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              Reclaim Storage Space
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="text-sm text-muted-foreground space-y-3">
                <div>
                  Remove {orphanCount} orphaned file record{orphanCount !== 1 ? "s" : ""} that no playlist entry points at. This
                  will not affect any songs in your playlist.
                </div>
                <div className="bg-muted p-3 rounded-lg space-y-2">
                  <div className="font-medium text-sm">What will be removed:</div>
                  <ul className="text-sm space-y-1 text-muted-foreground">
                    <li>• {orphanCount} unreachable file record{orphanCount !== 1 ? "s" : ""}</li>
                    <li>• Leftover data from interrupted downloads or deleted tracks</li>
                  </ul>
                </div>
                <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                  <CheckCircle className="w-4 h-4" />
                  <span>Your playlist will not be affected.</span>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={reclaimLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmReclaim}
              disabled={reclaimLoading}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {reclaimLoading ? "Reclaiming..." : "Reclaim Space"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Storage Info Dialog */}
      <Dialog open={showStorageInfo} onOpenChange={setShowStorageInfo}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2 bg-transparent" style={{ display: "none" }}>
            <Database className="w-4 h-4" />
            Storage
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HardDrive className="w-5 h-5" />
              Storage Information
            </DialogTitle>
            <DialogDescription>Current playlist storage usage and statistics</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Browser Storage Quota</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2">
                  {storageInfo.quota.supported ? (
                    <>
                      <div className="flex justify-between text-sm">
                        <span>Used</span>
                        <span className="font-mono">
                          {formatBytes(storageInfo.quota.usage)} of {formatBytes(storageInfo.quota.quota)}
                        </span>
                      </div>
                      <Progress
                        value={Math.min(storageInfo.quota.percentUsed * 100, 100)}
                        className="h-2"
                      />
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{(storageInfo.quota.percentUsed * 100).toFixed(1)}% used</span>
                        <span>{formatBytes(storageInfo.quota.available)} available</span>
                      </div>
                    </>
                  ) : (
                    <div className="text-xs text-muted-foreground">
                      Browser does not report storage limits
                    </div>
                  )}
                </div>

                {storageInfo.quota.supported && storageInfo.quota.percentUsed >= STORAGE_WARN_THRESHOLD && (
                  <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-800">
                    <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                    <div className="text-xs text-amber-800 dark:text-amber-200">
                      Storage is nearly full. New downloads will be refused. Consider reclaiming space.
                    </div>
                  </div>
                )}

                <div className="space-y-2 pt-2 border-t text-xs">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-muted-foreground">
                      {storageInfo.quota.persisted ? (
                        <>
                          <Shield className="w-4 h-4 text-green-600 dark:text-green-400" />
                          <span>Library is protected from automatic browser cleanup</span>
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
                          <span>Browser may clear library if disk fills up</span>
                        </>
                      )}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Library Contents</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <div className="text-center">
                    <div className="text-lg font-bold text-primary">{storageInfo.songs}</div>
                    <div className="text-xs text-muted-foreground">Downloaded</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold text-primary">{songCount}</div>
                    <div className="text-xs text-muted-foreground">In Playlist</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold text-green-600">
                      {storageInfo.albumArtCount}
                    </div>
                    <div className="text-xs text-muted-foreground">Album Arts</div>
                  </div>
                </div>

                <div className="space-y-1 text-xs text-muted-foreground border-t pt-2">
                  <div className="flex justify-between">
                    <span>Audio files:</span>
                    <span>{formatBytes(storageInfo.used - storageInfo.albumArtSize)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Album art:</span>
                    <span>{formatBytes(storageInfo.albumArtSize)}</span>
                  </div>
                  <div className="flex justify-between pt-1 border-t">
                    <span>Art efficiency:</span>
                    <span>
                      {storageInfo.albumArtCount} art {storageInfo.songs > 0
                        ? `(${((storageInfo.albumArtCount / storageInfo.songs) * 100).toFixed(0)}% of songs)`
                        : ""}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex items-center gap-2 text-sm">
              {storageInfo.songs === songCount ? (
                <>
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span className="text-green-600 dark:text-green-400">All songs backed up</span>
                </>
              ) : (
                <>
                  <XCircle className="w-4 h-4 text-yellow-500" />
                  <span className="text-yellow-600 dark:text-yellow-400">
                    {Math.abs(storageInfo.songs - songCount)} songs need sync
                  </span>
                </>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleReclaimSpace}
                disabled={reclaimLoading || songCount === 0}
                className="bg-transparent gap-2 w-full"
                title={songCount === 0 ? "Load a playlist first" : "Find and remove unreachable files"}
              >
                <Trash2 className="w-4 h-4" />
                Reclaim Space
              </Button>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportMetadata}
                  className="flex-1 bg-transparent"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Export Metadata
                </Button>
                <Button variant="outline" size="sm" onClick={updateStorageInfo}>
                  <Info className="w-4 h-4 mr-2" />
                  Refresh
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Album Art Manager Dialog controlled by parent */}
      <AlbumArtManager songs={songs} onAlbumArtUpdate={updateStorageInfo} showManager={showManager} setShowManager={setShowManager} hideTrigger={true} />

    </div>
  )
}
