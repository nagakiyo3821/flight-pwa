/**
 * 自動ローカル / 手動ローカル / iCloud 用のフォルダ。
 * Chromium はフォルダ許可を IndexedDB に残す。
 * Safari は許可を保存できないので、起動のたびに選び直す。
 */

const DB = 'flight-local-dirs'
const STORE = 'handles'
const SESSION_OK = 'flight-auto-folder-ok'

export type DirKind = 'auto' | 'manual' | 'icloud'

type DirHandle = FileSystemDirectoryHandle

function picker(): ((opts?: { mode?: 'readwrite' }) => Promise<DirHandle>) | null {
  const w = window as Window & {
    showDirectoryPicker?: (opts?: { mode?: 'readwrite' }) => Promise<DirHandle>
  }
  return typeof w.showDirectoryPicker === 'function' ? w.showDirectoryPicker.bind(w) : null
}

export function canPersistDirectory(): boolean {
  return picker() !== null
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function idbGet(key: string): Promise<DirHandle | undefined> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).get(key)
    req.onsuccess = () => resolve(req.result as DirHandle | undefined)
    req.onerror = () => reject(req.error)
  })
}

async function idbSet(key: string, handle: DirHandle): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(handle, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function permission(handle: DirHandle): Promise<PermissionState> {
  const h = handle as FileSystemDirectoryHandle & {
    queryPermission?: (d: { mode: 'readwrite' }) => Promise<PermissionState>
  }
  if (!h.queryPermission) return 'granted'
  return h.queryPermission({ mode: 'readwrite' })
}

export async function storedDirectory(kind: DirKind): Promise<DirHandle | null> {
  const handle = await idbGet(kind)
  if (!handle) return null
  try {
    const state = await permission(handle)
    return state === 'granted' ? handle : null
  } catch {
    return null
  }
}

export function pickerWasCancelled(error: unknown): boolean {
  const name = error instanceof DOMException ? error.name : ''
  return name === 'AbortError' || name === 'NotAllowedError'
}

/** ファイルアプリは空フォルダの選択結果を返さない。 */
export class EmptyFolderUnreported extends Error {
  constructor() {
    super('empty-folder')
    this.name = 'EmptyFolderUnreported'
  }
}

export function acceptEmptyAutoFolder(): void {
  rememberAutoLabel('空のフォルダ')
}

function rememberAutoLabel(name: string): void {
  sessionStorage.setItem(SESSION_OK, '1')
  sessionStorage.setItem('flight-auto-folder-label', name)
}

/** クリックの直後に呼ぶ。対応ブラウザはフォルダ許可、それ以外はファイルアプリ。 */
export function beginDirectoryPick(kind: DirKind): Promise<string> {
  const pick = picker()
  if (pick) {
    try {
      return pick({ mode: 'readwrite' }).then(async (handle) => {
        await idbSet(kind, handle)
        if (kind === 'auto') rememberAutoLabel(handle.name)
        return handle.name
      })
    } catch (error) {
      if (pickerWasCancelled(error)) throw error
      return pickWithFileInput(kind)
    }
  }
  return pickWithFileInput(kind)
}

function pickWithFileInput(kind: DirKind): Promise<string> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    input.setAttribute('webkitdirectory', '')
    input.setAttribute('directory', '')
    let settled = false
    const succeed = (name: string) => {
      if (settled) return
      settled = true
      input.remove()
      if (kind === 'auto') rememberAutoLabel(name)
      resolve(name)
    }
    const fail = (error: Error) => {
      if (settled) return
      settled = true
      input.remove()
      reject(error)
    }
    input.addEventListener('change', () => {
      const file = input.files?.[0] as (File & { webkitRelativePath?: string }) | undefined
      if (!file) {
        succeed('空のフォルダ')
        return
      }
      const folder = (file.webkitRelativePath || file.name).split('/')[0] || '選択したフォルダ'
      succeed(folder)
    })
    input.addEventListener('cancel', () => {
      window.setTimeout(() => fail(new EmptyFolderUnreported()), 400)
    })
    document.body.appendChild(input)
    input.click()
  })
}

export async function pickDirectory(kind: DirKind): Promise<string> {
  return beginDirectoryPick(kind)
}

export async function autoFolderReady(): Promise<boolean> {
  if (await storedDirectory('auto')) return true
  return sessionStorage.getItem(SESSION_OK) === '1' && !canPersistDirectory()
}

export async function writeJsonFiles(
  kind: DirKind,
  files: Record<string, unknown>,
): Promise<string[]> {
  const handle = await storedDirectory(kind)
  if (!handle) {
    if (!canPersistDirectory() && kind === 'auto' && sessionStorage.getItem(SESSION_OK) === '1') {
      return shareOrDownload(files)
    }
    throw new Error('フォルダが未指定か、許可が切れています')
  }
  const written: string[] = []
  const errors: string[] = []
  for (const [name, data] of Object.entries(files)) {
    try {
      const fh = await handle.getFileHandle(name, { create: true })
      const w = await fh.createWritable()
      await w.write(JSON.stringify(data, null, 2))
      await w.close()
      written.push(name)
    } catch (e) {
      errors.push(`${name}: ${(e as Error).message}`)
    }
  }
  if (errors.length) {
    throw new Error(`未完了（${written.join(', ') || 'なし'}） ${errors.join(' / ')}`)
  }
  return written
}

async function shareOrDownload(files: Record<string, unknown>): Promise<string[]> {
  const names: string[] = []
  for (const [name, data] of Object.entries(files)) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const file = new File([blob], name, { type: 'application/json' })
    const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean }
    if (nav.canShare?.({ files: [file] }) && navigator.share) {
      await navigator.share({ files: [file] })
    } else {
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = name
      a.click()
      URL.revokeObjectURL(a.href)
    }
    names.push(name)
  }
  return names
}

export async function readJsonFiles(
  kind: DirKind,
  names: string[],
): Promise<Record<string, unknown> | null> {
  const handle = await storedDirectory(kind)
  if (!handle) return null
  const out: Record<string, unknown> = {}
  for (const name of names) {
    try {
      const fh = await handle.getFileHandle(name)
      const text = await (await fh.getFile()).text()
      out[name] = JSON.parse(text) as unknown
    } catch {
      return null
    }
  }
  return out
}
