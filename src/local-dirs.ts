/**
 * 自動ローカル / 手動ローカル / iCloud 用のフォルダ。
 * Chromium はフォルダ許可を IndexedDB に残す。
 * Safari は許可を保存できないので、起動のたびに選び直す。
 */

import { applyLocalStamp, localKindLabel, localStamp, pickLatestEntry } from './local-file-names'

const DB = 'flight-local-dirs'
const STORE = 'handles'
const SESSION_OK = 'flight-auto-folder-ok'

function labelKey(kind: DirKind): string {
  return kind === 'auto' ? 'flight-auto-folder-label' : `flight-${kind}-folder-label`
}

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

const PHONE_ROOTS = ['iCloud Drive', 'このiPhone内']

/** iPhone の先頭表示はファイルアプリの場所ではない。表示と保存から外す。 */
export function withoutPhoneRoot(label: string): string {
  let rest = label.trim()
  const roots = [...PHONE_ROOTS].sort((a, b) => b.length - a.length)
  for (const candidate of roots) {
    if (rest === candidate || rest.startsWith(`${candidate}/`)) {
      return rest.slice(candidate.length).replace(/^\//, '')
    }
  }
  return rest
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

async function idbDelete(key: string): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(key)
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

/** ファイルアプリは空フォルダの中身を返さない。ディレクトリ名は取れるときだけ入る。 */
export class EmptyFolderUnreported extends Error {
  directory: string
  constructor(directory = '') {
    super('empty-folder')
    this.name = 'EmptyFolderUnreported'
    this.directory = directory
  }
}

export function rememberDirectory(kind: DirKind, name: string): void {
  const trimmed = name.trim() || '空のフォルダ'
  sessionStorage.setItem(labelKey(kind), trimmed)
  localStorage.setItem(labelKey(kind), trimmed)
  if (kind === 'auto') sessionStorage.setItem(SESSION_OK, '1')
}

export function directoryLabel(kind: DirKind): string {
  return (sessionStorage.getItem(labelKey(kind)) || localStorage.getItem(labelKey(kind)) || '').trim()
}

/** バックアップからフォルダ名だけ戻す。書き込み許可は戻さない。 */
export async function restoreDirectoryLabel(kind: DirKind, name: string): Promise<void> {
  const trimmed = name.trim()
  if (!trimmed || trimmed === '未設定') {
    sessionStorage.removeItem(labelKey(kind))
    localStorage.removeItem(labelKey(kind))
    if (kind === 'auto') sessionStorage.removeItem(SESSION_OK)
    try {
      await idbDelete(kind)
    } catch {
      /* 表示名の消去を優先する */
    }
    return
  }
  const leaf = trimmed.split('/').filter(Boolean).pop() || trimmed
  try {
    const handle = await idbGet(kind)
    if (handle?.name && handle.name !== leaf) await idbDelete(kind)
  } catch {
    /* 許可の照合に失敗しても名前は戻す */
  }
  sessionStorage.setItem(labelKey(kind), trimmed)
  localStorage.setItem(labelKey(kind), trimmed)
  if (kind === 'auto') sessionStorage.removeItem(SESSION_OK)
}

export function acceptEmptyAutoFolder(name = ''): void {
  rememberDirectory('auto', name || '空のフォルダ')
}

/** この端末で選んであるフォルダ名。未選択は「未設定」。 */
export async function directoryStatus(kind: DirKind): Promise<string> {
  const fromSession = (
    sessionStorage.getItem(labelKey(kind)) || localStorage.getItem(labelKey(kind))
  )?.trim()
  if (fromSession) {
    if (canPersistDirectory()) return fromSession
    const stripped = withoutPhoneRoot(fromSession)
    if (stripped) return stripped
  }
  try {
    const handle = await idbGet(kind)
    const fromHandle = handle?.name?.trim()
    if (fromHandle) return fromHandle
  } catch {
    /* 表示用。失敗しても案内は続ける */
  }
  return '未設定'
}

/** ファイル名を除いた共通のディレクトリ。`drone/data/a.txt` なら `drone/data`。 */
function directoryNameFromInput(input: HTMLInputElement): string {
  const files = Array.from(input.files || []) as Array<File & { webkitRelativePath?: string }>
  const directories = files
    .map((file) => (file.webkitRelativePath || '').split('/').filter(Boolean).slice(0, -1))
    .filter((parts) => parts.length > 0)
  if (!directories.length) return ''
  const common: string[] = []
  for (let i = 0; i < directories[0].length; i++) {
    const part = directories[0][i]
    if (!directories.every((parts) => parts[i] === part)) break
    common.push(part)
  }
  return common.join('/')
}

const pickedFiles = new Map<DirKind, File[]>()
let primedRead: Promise<DirHandle | null> | null = null

function rememberPickedFiles(kind: DirKind, list: FileList | File[]): void {
  pickedFiles.set(kind, Array.from(list))
}

async function reopenStoredDirectory(kind: DirKind): Promise<DirHandle | null> {
  const handle = await idbGet(kind)
  if (!handle) return null
  const h = handle as FileSystemDirectoryHandle & {
    queryPermission?: (d: { mode: 'readwrite' }) => Promise<PermissionState>
    requestPermission?: (d: { mode: 'readwrite' }) => Promise<PermissionState>
  }
  try {
    let state: PermissionState = 'granted'
    if (h.queryPermission) state = await h.queryPermission({ mode: 'readwrite' })
    if (state === 'prompt' && h.requestPermission) {
      state = await h.requestPermission({ mode: 'readwrite' })
    }
    return state === 'granted' ? handle : null
  } catch {
    return null
  }
}

/**
 * 取り込み確定のクリックで呼ぶ。
 * Safari はフォルダを後から開けないので、選んだファイルを残す。無ければその場で選び直す。
 * Chromium は切れた許可を同じ操作の中で開き直す。
 */
export function primeDirectoryRead(kind: DirKind): void {
  if (!canPersistDirectory()) {
    if (pickedFiles.get(kind)?.length) {
      primedRead = Promise.resolve(null)
      return
    }
    primedRead = pickWithFileInput(kind, { keepLabel: true }).then(() => null)
    return
  }
  primedRead = (async () => {
    const existing = await reopenStoredDirectory(kind)
    if (existing) return existing
    const pick = picker()
    if (!pick) return null
    const handle = await pick({ mode: 'readwrite' })
    await idbSet(kind, handle)
    if (!directoryLabel(kind)) rememberDirectory(kind, handle.name)
    return handle
  })()
}

/** クリックの直後に呼ぶ。対応ブラウザはフォルダ許可、それ以外はファイルアプリ。 */
export function beginDirectoryPick(kind: DirKind): Promise<string> {
  const pick = picker()
  if (pick) {
    try {
      return pick({ mode: 'readwrite' }).then(async (handle) => {
        await idbSet(kind, handle)
        rememberDirectory(kind, handle.name)
        return handle.name
      })
    } catch (error) {
      if (pickerWasCancelled(error)) throw error
      return pickWithFileInput(kind)
    }
  }
  return pickWithFileInput(kind)
}

function pickWithFileInput(kind: DirKind, opts?: { keepLabel?: boolean }): Promise<string> {
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
      if (!opts?.keepLabel) rememberDirectory(kind, name)
      resolve(name)
    }
    const fail = (error: Error) => {
      if (settled) return
      settled = true
      input.remove()
      reject(error)
    }
    input.addEventListener('change', () => {
      const folder = directoryNameFromInput(input)
      const file = input.files?.[0] as (File & { webkitRelativePath?: string }) | undefined
      if (!file || !folder) {
        fail(new EmptyFolderUnreported(folder))
        return
      }
      rememberPickedFiles(kind, input.files || [])
      succeed(folder)
    })
    input.addEventListener('cancel', () => {
      const folder = directoryNameFromInput(input)
      window.setTimeout(() => fail(new EmptyFolderUnreported(folder)), 400)
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

const AUTO_ACCESS = 'flight-local-auto-access'
const LOCAL_SETUP_DONE = 'flight-local-setup-done'

/** 未設定はオン。明示的にオフにしたときだけ '0'。 */
export function localAutoAccessOn(): boolean {
  return localStorage.getItem(AUTO_ACCESS) !== '0'
}

export function setLocalAutoAccess(on: boolean): void {
  localStorage.setItem(AUTO_ACCESS, on ? '1' : '0')
}

/** settings の取り込みで Local 自動バックアップの初期設定を終えた。 */
export function markLocalSetupDone(): void {
  localStorage.setItem(LOCAL_SETUP_DONE, '1')
}

export function clearLocalSetupDone(): void {
  localStorage.removeItem(LOCAL_SETUP_DONE)
}

export function localSetupDone(): boolean {
  return localStorage.getItem(LOCAL_SETUP_DONE) === '1'
}

export async function writeJsonFiles(
  kind: DirKind,
  files: Record<string, unknown>,
): Promise<string[]> {
  const payload = applyLocalStamp(files, localStamp())
  const handle = await storedDirectory(kind)
  if (!handle) throw new Error('フォルダが未指定か、許可が切れています')
  const written: string[] = []
  const errors: string[] = []
  for (const [name, data] of Object.entries(payload)) {
    try {
      const body = JSON.stringify(data, null, 2)
      const fh = await handle.getFileHandle(name, { create: true })
      const w = await fh.createWritable()
      await w.write(new Blob([body], { type: 'application/json' }))
      await w.close()
      const saved = await (await fh.getFile()).text()
      if (saved !== body) throw new Error(`${name} をフォルダに確認できませんでした`)
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

/** クリックの中で呼ぶ。ファイルアプリで保存先をその場で選ばせる。 */
export function sharePreparedFiles(files: Record<string, unknown>): Promise<string[]> {
  const payload = applyLocalStamp(files, localStamp())
  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean }
  const build = (type: string) =>
    Object.entries(payload).map(([name, data]) => new File([JSON.stringify(data, null, 2)], name, { type }))
  const asJson = build('application/json')
  const asText = build('text/plain')
  const shared =
    asJson.length && nav.canShare?.({ files: asJson })
      ? asJson
      : asText.length && nav.canShare?.({ files: asText })
        ? asText
        : []
  if (!shared.length || !navigator.share) {
    throw new Error('この端末はファイルアプリへファイルを渡せません')
  }
  const pending = navigator.share({ files: shared })
  return pending.then(() => shared.map((file) => file.name))
}

function pathDepth(file: File): number {
  const relative = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name
  return relative.split('/').filter(Boolean).length
}

async function parseJsonFile(name: string, text: string, strict: boolean): Promise<unknown | null> {
  try {
    return JSON.parse(text) as unknown
  } catch {
    if (strict) throw new Error(`${name} の内容を読めません`)
    return null
  }
}

async function namesInDirectory(handle: DirHandle): Promise<string[]> {
  const names: string[] = []
  const dir = handle as FileSystemDirectoryHandle & {
    entries?: () => AsyncIterable<[string, FileSystemHandle]>
  }
  if (!dir.entries) return names
  for await (const [name, entry] of dir.entries()) {
    if (entry.kind === 'file') names.push(name)
  }
  return names
}

async function readHandleFiles(
  handle: DirHandle,
  names: string[],
  strict: boolean,
): Promise<{ files: Record<string, unknown>; used: string[] } | null> {
  const present = (await namesInDirectory(handle)).map((fileName) => ({ item: fileName, fileName, depth: 1 }))
  const out: Record<string, unknown> = {}
  const used: string[] = []
  for (const name of names) {
    const picked = pickLatestEntry(present, name)
    const label = localKindLabel(name)
    if (!picked) {
      if (!strict) return null
      throw new Error(`${label} がフォルダにありません`)
    }
    try {
      const fh = await handle.getFileHandle(picked.item)
      const text = await (await fh.getFile()).text()
      const parsed = await parseJsonFile(picked.fileName, text, strict)
      if (parsed == null && !strict) return null
      out[name] = parsed
      used.push(picked.fileName)
    } catch (error) {
      if (!strict) return null
      if (error instanceof Error && error.message.includes('内容を読めません')) throw error
      throw new Error(`${label} を読めませんでした`)
    }
  }
  return { files: out, used }
}

async function readPickedFiles(
  files: readonly File[],
  names: string[],
  strict: boolean,
): Promise<{ files: Record<string, unknown>; used: string[] } | null> {
  const present = files.map((file) => ({ item: file, fileName: file.name, depth: pathDepth(file) }))
  const out: Record<string, unknown> = {}
  const used: string[] = []
  for (const name of names) {
    const picked = pickLatestEntry(present, name)
    const label = localKindLabel(name)
    if (!picked) {
      if (!strict) return null
      throw new Error(`${label} がフォルダにありません`)
    }
    let text = ''
    try {
      text = await picked.item.text()
    } catch {
      if (!strict) return null
      throw new Error(`${label} を読めませんでした`)
    }
    const parsed = await parseJsonFile(picked.fileName, text, strict)
    if (parsed == null && !strict) return null
    out[name] = parsed
    used.push(picked.fileName)
  }
  return { files: out, used }
}

export async function readJsonFiles(
  kind: DirKind,
  names: string[],
  opts?: { strict?: boolean },
): Promise<{ files: Record<string, unknown>; used: string[] } | null> {
  const strict = !!opts?.strict
  const primed = primedRead
  primedRead = null
  let primedHandle: DirHandle | null = null
  if (primed) {
    try {
      primedHandle = await primed
    } catch (error) {
      if (strict) throw error
      return null
    }
  }
  const handle = primedHandle || (await storedDirectory(kind))
  if (handle) return readHandleFiles(handle, names, strict)
  const files = pickedFiles.get(kind)
  if (files?.length) return readPickedFiles(files, names, strict)
  if (strict) {
    throw new Error('フォルダ名だけでは中のファイルを開けません。フォルダを選び直してください。')
  }
  return null
}
