/** この端末で選んだ Google ドライブの保管先。settings.json には書かない。 */

const KEY = 'flight-google-folder'

export type GoogleFolderChoice = {
  folderName: string
  folderId: string
}

export function loadGoogleFolder(): GoogleFolderChoice | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const o = JSON.parse(raw) as Partial<GoogleFolderChoice>
    const folderName = String(o.folderName || '').trim()
    const folderId = String(o.folderId || '').trim()
    if (!folderName || !folderId) return null
    return { folderName, folderId }
  } catch {
    return null
  }
}

export function saveGoogleFolder(choice: GoogleFolderChoice): void {
  const folderName = choice.folderName.trim()
  const folderId = choice.folderId.trim()
  if (!folderName || !folderId) return
  localStorage.setItem(KEY, JSON.stringify({ folderName, folderId }))
}

export function clearGoogleFolder(): void {
  localStorage.removeItem(KEY)
}

export function googleFolderLabel(): string {
  const saved = loadGoogleFolder()
  return saved ? `マイドライブ/${saved.folderName}` : '未設定'
}
