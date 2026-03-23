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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
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
  Library,
  Globe,
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
  sidebarMode?: "library" | "online"
  onSidebarModeChange?: (mode: "library" | "online") => void
  activeDownloadCount?: number
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
  sidebarMode = "library",
  onSidebarModeChange,
  activeDownloadCount = 0,
}: MobilePlaylistControlsProps) {
  return (
    <div className="sticky top-14 z-40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
      <div className="p-4 space-y-3">
        {/* Sidebar Mode Tabs */}
        {onSidebarModeChange && (
          <Tabs value={sidebarMode} onValueChange={(v) => onSidebarModeChange(v as "library" | "online")}>
            <TabsList className="w-full h-9">
              <TabsTrigger value="library" className="flex-1 gap-1.5 text-xs">
                <Library className="h-3.5 w-3.5" />
                My Library
              </TabsTrigger>
              <TabsTrigger value="online" className="flex-1 gap-1.5 text-xs relative">
                <Globe className="h-3.5 w-3.5" />
                Search Online
                {activeDownloadCount > 0 && (
                  <span className="absolute -top-1 -right-1 h-4 min-w-[16px] px-1 text-[10px] font-bold bg-blue-500 text-white rounded-full flex items-center justify-center">
                    {activeDownloadCount}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        )}

        {/* Library mode controls */}
        {sidebarMode === "library" && (
        <>
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

          {/* Song count and duration */}
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <span>{songCount} song{songCount !== 1 ? "s" : ""}</span>
            <span>·</span>
            <Clock className="w-3 h-3" />
            <span>{totalDuration}</span>
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
        </>
        )}
      </div>
    </div>
  )
}
