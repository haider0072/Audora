"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "./ui/dropdown-menu";
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
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
import { Database, Download, HardDrive, Info, RotateCcw, AlertTriangle, CheckCircle, XCircle, EllipsisVertical,ImageIcon  } from "lucide-react"
import { PlaylistStorage } from "@/lib/playlist-storage"
import { AlbumArtManager } from "./album-art-manager"

interface PlaylistManagerProps {
  songCount: number
  songs: Array<{ id: string; title?: string; artist?: string; albumArt?: string }>
  onPlaylistReset: () => void
}

export function PlaylistManager({ songCount, songs, onPlaylistReset }: PlaylistManagerProps) {
  const [storageInfo, setStorageInfo] = useState({
    used: 0,
    available: 0,
    songs: 0,
    albumArtCount: 0,
    albumArtSize: 0,
  })
  const [isLoading, setIsLoading] = useState(false)
  const [showStorageInfo, setShowStorageInfo] = useState(false)
  const [showManager, setShowManager] = useState(false)

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

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 Bytes"
    const k = 1024
    const sizes = ["Bytes", "KB", "MB", "GB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
  }

  const storageUsagePercent =
    storageInfo.used + storageInfo.available > 0
      ? (storageInfo.used / (storageInfo.used + storageInfo.available)) * 100
      : 0

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
                <AlertDialogDescription className="space-y-3">
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

      {/* Storage Status Badge */}
      {songCount > 0 && (
        <Badge variant={storageInfo.songs === songCount ? "default" : "secondary"} className="text-xs">
          {storageInfo.songs === songCount ? "Synced" : "Partial"}
        </Badge>
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

      {/* Storage Info Dialog */}
      <Dialog open={showStorageInfo} onOpenChange={setShowStorageInfo}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2 bg-transparent" style={{ display: 'none' }}>
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
                <CardTitle className="text-sm">Storage Usage</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Used</span>
                    <span className="font-mono">{formatBytes(storageInfo.used)}</span>
                  </div>
                  <Progress value={storageUsagePercent} className="h-2" />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{storageUsagePercent.toFixed(1)}% used</span>
                    <span>{formatBytes(storageInfo.available)} available</span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 pt-2">
                  <div className="text-center">
                    <div className="text-lg font-bold text-primary">{storageInfo.songs}</div>
                    <div className="text-xs text-muted-foreground">Songs</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold text-primary">{songCount}</div>
                    <div className="text-xs text-muted-foreground">In Playlist</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold text-green-600">{storageInfo.albumArtCount}</div>
                    <div className="text-xs text-muted-foreground">Album Arts</div>
                  </div>
                </div>

                <div className="space-y-1 text-xs text-muted-foreground">
                  <div className="flex justify-between">
                    <span>Audio files:</span>
                    <span>{formatBytes(storageInfo.used - storageInfo.albumArtSize)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Album art:</span>
                    <span>{formatBytes(storageInfo.albumArtSize)}</span>
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

            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleExportMetadata} className="flex-1 bg-transparent">
                <Download className="w-4 h-4 mr-2" />
                Export Metadata
              </Button>
              <Button variant="outline" size="sm" onClick={updateStorageInfo}>
                <Info className="w-4 h-4 mr-2" />
                Refresh
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Album Art Manager Dialog controlled by parent */}
      <AlbumArtManager songs={songs} onAlbumArtUpdate={updateStorageInfo} showManager={showManager} setShowManager={setShowManager} hideTrigger={true} />

    </div>
  )
}
