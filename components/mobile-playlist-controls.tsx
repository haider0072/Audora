"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
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
  Search,
  Shuffle,
  ShuffleIcon as ShuffleOff,
  Music,
  List,
  MoreVertical,
  RotateCcw,
  AlertTriangle,
  Clock,
} from "lucide-react"

interface MobilePlaylistControlsProps {
  searchQuery: string
  onSearchChange: (query: string) => void
  shuffleMode: boolean
  onShuffleToggle: () => void
  viewMode: "grouped" | "list"
  onViewModeChange: (mode: "grouped" | "list") => void
  onPlaylistReset: () => void
  songCount: number
  totalDuration: string
}

export function MobilePlaylistControls({
  searchQuery,
  onSearchChange,
  shuffleMode,
  onShuffleToggle,
  viewMode,
  onViewModeChange,
  onPlaylistReset,
  songCount,
  totalDuration,
}: MobilePlaylistControlsProps) {
  return (
    <div className="sticky top-14 z-40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
      <div className="p-4 space-y-3">
        {/* Header with song count and duration */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Music className="w-4 h-4" />
            <span className="text-sm font-medium">
              {songCount} song{songCount !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="w-3 h-3" />
            {totalDuration}
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search songs, artists, albums..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-10 h-9"
          />
        </div>

        {/* Controls Row */}
        <div className="flex items-center justify-between gap-2">
          {/* View Mode Buttons */}
          <div className="flex items-center gap-1">
            <Button
              variant={viewMode === "grouped" ? "default" : "outline"}
              size="sm"
              onClick={() => onViewModeChange("grouped")}
              className="h-8 px-3"
            >
              <Music className="w-3 h-3 mr-1" />
              <span className="text-xs">Grouped</span>
            </Button>
            <Button
              variant={viewMode === "list" ? "default" : "outline"}
              size="sm"
              onClick={() => onViewModeChange("list")}
              className="h-8 px-3"
            >
              <List className="w-3 h-3 mr-1" />
              <span className="text-xs">List</span>
            </Button>
          </div>

          {/* Right Controls */}
          <div className="flex items-center gap-2">
            {/* Shuffle Button */}
            <Button
              variant={shuffleMode ? "default" : "outline"}
              size="sm"
              onClick={onShuffleToggle}
              className="h-8 px-3"
            >
              {shuffleMode ? <Shuffle className="w-3 h-3" /> : <ShuffleOff className="w-3 h-3" />}
            </Button>

            {/* More Options */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 w-8 p-0 bg-transparent">
                  <MoreVertical className="w-3 h-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {songCount > 0 && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <DropdownMenuItem
                        onSelect={(e) => e.preventDefault()}
                        className="text-destructive focus:text-destructive gap-2"
                      >
                        <RotateCcw className="w-4 h-4" />
                        Reset Playlist
                      </DropdownMenuItem>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="mx-4 max-w-sm">
                      <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-destructive" />
                          Reset Playlist
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-sm">
                          This will remove all {songCount} song{songCount !== 1 ? "s" : ""} from your playlist. This
                          action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
                        <AlertDialogCancel className="w-full">Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={onPlaylistReset}
                          className="w-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Reset
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Status Badges */}
        {shuffleMode && (
          <div className="flex gap-2">
            <Badge variant="secondary" className="text-xs">
              Shuffle Mode
            </Badge>
          </div>
        )}
      </div>
    </div>
  )
}
