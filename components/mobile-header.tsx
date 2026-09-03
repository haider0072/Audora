"use client"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Music, Plus, FolderOpen, Upload, MonitorSpeaker } from "lucide-react"
import { ThemeToggle } from "./theme-toggle"

interface MobileHeaderProps {
  onFileUpload: () => void
  onFolderUpload: () => void
  isLoading?: boolean
  /** Opens the two-device playback panel. */
  onOpenSync?: () => void
  /** Highlights the entry point while a session is connected. */
  syncActive?: boolean
}

export function MobileHeader({
  onFileUpload,
  onFolderUpload,
  isLoading = false,
  onOpenSync,
  syncActive = false,
}: MobileHeaderProps) {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 items-center justify-between px-4">
        {/* Logo and Title */}
        <div className="flex items-center gap-2">
          <Music className="w-6 h-6" />
          <h1 className="text-lg font-bold truncate">Music Player</h1>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {/* Add Music Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2 bg-transparent" disabled={isLoading}>
                <Plus className="w-4 h-4" />
                Add
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={onFileUpload} className="gap-2">
                <Upload className="w-4 h-4" />
                Add Songs
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onFolderUpload} className="gap-2">
                <FolderOpen className="w-4 h-4" />
                Add Folder
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {onOpenSync ? (
            <Button
              variant="ghost"
              size="sm"
              className={`h-9 w-9 p-0 ${syncActive ? "text-primary" : ""}`}
              onClick={onOpenSync}
              aria-label="Play on two devices"
            >
              <MonitorSpeaker className="w-4 h-4" />
            </Button>
          ) : null}

          {/* Theme Toggle */}
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
