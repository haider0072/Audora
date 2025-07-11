import {Button} from "@/components/ui/button";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "./ui/dropdown-menu";
import {Plus, Music, Folder} from "lucide-react";
import React from "react";

export function AddMusicControls({
    isLoadingSongs,
    isRestoringPlaylist,
    fileInputRef,
    folderInputRef,
    handleFileUpload,
    handleFolderUpload,
    loadingProgress,
}: {
    isLoadingSongs: boolean;
    isRestoringPlaylist: boolean;
    fileInputRef: React.RefObject<HTMLInputElement | null>;
    folderInputRef: React.RefObject<HTMLInputElement | null>;
    handleFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
    handleFolderUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
    loadingProgress: { current: number; total: number };
}
) {
    return(
        <div className="space-y-4">
                      <div className="flex flex-wrap items-center gap-4">
                        {/* Add functionality */}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" className="gap-2" disabled={isLoadingSongs || isRestoringPlaylist}>
                              <Plus className="w-4 h-4"/>
                              Add
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start" className="w-48">
                            <DropdownMenuItem onClick={()=> fileInputRef.current?.click()} className="gap-2">
                              <Music className="w-4 h-4"/>
                              Add Songs
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={()=> folderInputRef.current?.click()} className="gap-2">
                              <Folder className="w-4 h-4"/>
                              Add Folder
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        {/* Uploading File/Folder Functionaility */}
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
                          // @ts-ignore
                          webkitdirectory=""
                        />
                      </div>
                      {/* Upload Progress Handeling */}
                      {/* {(isLoadingSongs || isRestoringPlaylist) && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <span>{isRestoringPlaylist ? "Restoring playlist..." : "Processing songs..."}</span>
                            {!isRestoringPlaylist && (
                              <span>
                                {loadingProgress.current} / {loadingProgress.total}
                              </span>
                            )}
                          </div>
                          <div className="w-full bg-muted rounded-full h-2">
                            <div
                              className={`bg-primary h-2 rounded-full transition-all duration-300 ${isRestoringPlaylist ? "animate-pulse" : ""}`}
                              style={{
                                width: isRestoringPlaylist
                                  ? "100%"
                                  : `${(loadingProgress.current / loadingProgress.total) * 100}%`,
                              }}
                            />
                          </div>
                        </div>
                      )} */}
                    </div>
    )
}