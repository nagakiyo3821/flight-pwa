/** この端末で選んだ Google ドライブの保管先。settings.json には書かない。 */

const LEGACY_KEY = 'flight-google-folder'
const KEYS = {
  auto: 'flight-google-auto-folder',
  manual: 'flight-google-manual-folder',
} as const

export type GoogleFolderKind = keyof typeof KEYS

export type GoogleFolderChoice = {
  folderName: string
  folderId: string
}

function parseChoice(raw: string | null): GoogleFolderChoice | null {
  if (!raw) return null
  try {
    const o = JSON.parse(raw) as Partial<GoogleFolderChoice>
    const folderName = String(o.folderName || '').trim()
    const folderId = String(o.folderId || '').trim()
    if (!folderName || !folderId) return null
    return { folderName, folderId }
  } catch {
    return null
  }
}

/** 以前の1か所指定は、自動送信と手動の両方へコピーする。 */
function migrateLegacy(): void {
  const legacy = parseChoice(localStorage.getItem(LEGACY_KEY))
  if (!legacy) return
  if (!localStorage.getItem(KEYS.auto)) localStorage.setItem(KEYS.auto, JSON.stringify(legacy))
  if (!localStorage.getItem(KEYS.manual)) localStorage.setItem(KEYS.manual, JSON.stringify(legacy))
  localStorage.removeItem(LEGACY_KEY)
}

export function loadGoogleFolder(kind: GoogleFolderKind): GoogleFolderChoice | null {
  migrateLegacy()
  return parseChoice(localStorage.getItem(KEYS[kind]))
}

export function saveGoogleFolder(kind: GoogleFolderKind, choice: GoogleFolderChoice): void {
  const folderName = choice.folderName.trim()
  const folderId = choice.folderId.trim()
  if (!folderName || !folderId) return
  localStorage.setItem(KEYS[kind], JSON.stringify({ folderName, folderId }))
}

export function googleFolderLabel(kind: GoogleFolderKind): string {
  const saved = loadGoogleFolder(kind)
  return saved ? `マイドライブ/${saved.folderName}` : '未設定'
}
