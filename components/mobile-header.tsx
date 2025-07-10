"use client"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Music, Plus, FolderOpen, Upload } from "lucide-react"
import { ThemeToggle } from "./theme-toggle"

interface MobileHeaderProps {
  onFileUpload: () => void
  onFolderUpload: () => void
  isLoading?: boolean
}

export function MobileHeader({ onFileUpload, onFolderUpload, isLoading = false }: MobileHeaderProps) {
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

          {/* Theme Toggle */}
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
