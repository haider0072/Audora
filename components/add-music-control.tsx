import {Button} from "@/components/ui/button";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "./ui/dropdown-menu";
import {Plus, Music, Folder, RefreshCw} from "lucide-react";
import React from "react";

export function AddMusicControls({
    isLoadingSongs,
    isRestoringPlaylist,
    fileInputRef,
    folderInputRef,
    syncInputRef,
    handleFileUpload,
    handleFolderUpload,
    handleFolderSync,
    isSyncing,
    loadingProgress,
}: {
    isLoadingSongs: boolean;
    isRestoringPlaylist: boolean;
    fileInputRef: React.RefObject<HTMLInputElement>;
    folderInputRef: React.RefObject<HTMLInputElement>;
    syncInputRef?: React.RefObject<HTMLInputElement>;
    handleFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
    handleFolderUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
    handleFolderSync?: (e: React.ChangeEvent<HTMLInputElement>) => void;
    isSyncing?: boolean;
    loadingProgress: { current: number; total: number };
}
) {
    return(
        <div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="sm" className="h-8 w-8 p-0" disabled={isLoadingSongs || isRestoringPlaylist || isSyncing}>
                            <Plus className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`}/>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem onClick={()=> fileInputRef.current?.click()} className="gap-2">
                            <Music className="w-4 h-4"/>
                            Add Songs
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={()=> folderInputRef.current?.click()} className="gap-2">
                            <Folder className="w-4 h-4"/>
                            Add Folder
                          </DropdownMenuItem>
                          {handleFolderSync && (
                            <DropdownMenuItem onClick={() => syncInputRef?.current?.click()} disabled={isSyncing} className="gap-2">
                              <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`}/>
                              {isSyncing ? 'Syncing...' : 'Sync Folder'}
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                      {/* Hidden file inputs */}
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".flac,.mp3,.wav,.m4a,.aac"
                        multiple
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                      <input
                        ref={folderInputRef}
                        type="file"
                        multiple
                        onChange={handleFolderUpload}
                        className="hidden"
                        {...({ webkitdirectory: "" } as any)}
                      />
                      {handleFolderSync && (
                        <input
                          ref={syncInputRef}
                          type="file"
                          multiple
                          onChange={handleFolderSync}
                          className="hidden"
                          {...({ webkitdirectory: "" } as any)}
                        />
                      )}
                    </div>
    )
}
