import { app, ipcMain } from 'electron'
import { join } from 'node:path'
import {
  readExcalidrawLibrary,
  writeExcalidrawLibrary
} from '../excalidraw/excalidraw-library-store'

/** The library lives with the Orca profile, never on an SSH host, so every workspace shares it. */
export function registerExcalidrawLibraryHandlers(
  getLibraryPath: () => string = () => join(app.getPath('userData'), 'excalidraw-library.json')
): void {
  ipcMain.removeHandler('excalidrawLibrary:read')
  ipcMain.handle('excalidrawLibrary:read', (): unknown[] => readExcalidrawLibrary(getLibraryPath()))
  ipcMain.removeHandler('excalidrawLibrary:write')
  ipcMain.handle('excalidrawLibrary:write', (_event, libraryItems: unknown): void => {
    writeExcalidrawLibrary(getLibraryPath(), libraryItems)
  })
}
