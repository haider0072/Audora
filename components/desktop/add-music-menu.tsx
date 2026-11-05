"use client"

import { useState, type ChangeEvent, type RefObject } from "react"
import { Folder, FolderSync, Music, Plus } from "lucide-react"

import { BusyArc } from "@/components/busy-arc"
import { TransportButton } from "@/components/player/transport-button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

/** The browser's folder picker, which React's input types don't list. */
const FOLDER_PICKER = { webkitdirectory: "" } as Record<string, string>

interface AddMusicMenuProps {
  /** Songs are being added, restored or synced: nothing more can start until they are in. */
  busy: boolean
  /** A synced folder is being read. */
  syncing: boolean
  fileInputRef: RefObject<HTMLInputElement>
  folderInputRef: RefObject<HTMLInputElement>
  syncInputRef: RefObject<HTMLInputElement>
  onFiles: (event: ChangeEvent<HTMLInputElement>) => void
  onFolder: (event: ChangeEvent<HTMLInputElement>) => void
  onSync: (event: ChangeEvent<HTMLInputElement>) => void
}

/**
 * Add music, among the library's tools: songs, a folder, or a folder kept in sync. While
 * songs come in, an arc turns around it and it waits; it keeps focus rather
 * than dropping it, as a disabled button would.
 */
export function AddMusicMenu({
  busy,
  syncing,
  fileInputRef,
  folderInputRef,
  syncInputRef,
  onFiles,
  onFolder,
  onSync,
}: AddMusicMenuProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <DropdownMenu open={open && !busy} onOpenChange={(next) => setOpen(next && !busy)}>
        <DropdownMenuTrigger asChild>
          <TransportButton
            label="Add music"
            title={syncing ? "Syncing a folder" : busy ? "Adding songs" : "Add music"}
            size="md"
            className="tool-button"
            aria-disabled={busy || undefined}
            data-busy={busy || undefined}
          >
            <Plus aria-hidden="true" />
            <BusyArc className="tool-arc" radius={9} />
          </TransportButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => fileInputRef.current?.click()}>
            <Music />
            Add songs…
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => folderInputRef.current?.click()}>
            <Folder />
            Add a folder…
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => syncInputRef.current?.click()}>
            <FolderSync />
            Sync a folder…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <input
        ref={fileInputRef}
        type="file"
        accept=".flac,.mp3,.wav,.m4a,.aac"
        multiple
        hidden
        onChange={onFiles}
      />
      <input ref={folderInputRef} type="file" multiple hidden onChange={onFolder} {...FOLDER_PICKER} />
      <input ref={syncInputRef} type="file" multiple hidden onChange={onSync} {...FOLDER_PICKER} />
    </>
  )
}
