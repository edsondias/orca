export type ExcalidrawLibraryApi = {
  read: () => Promise<unknown[]>
  write: (libraryItems: readonly unknown[]) => Promise<void>
}
