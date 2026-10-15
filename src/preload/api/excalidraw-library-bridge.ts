import { ipcRenderer } from 'electron'
import type { PreloadApi } from '../api-types'

export const excalidrawLibraryApi = {
  read: (): Promise<unknown[]> => ipcRenderer.invoke('excalidrawLibrary:read'),
  write: (libraryItems: readonly unknown[]): Promise<void> =>
    ipcRenderer.invoke('excalidrawLibrary:write', libraryItems)
} satisfies PreloadApi['excalidrawLibrary']
