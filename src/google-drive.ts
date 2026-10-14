/**
 * Google Drive API v3 — JSON ファイルの検索・取得・更新
 */

import { splitFolderPath } from './folder-path'
import { loadGoogleFolder, type GoogleFolderKind } from './google-folder'
import { localStamp, pickLatestEntry, stampedFileName } from './local-file-names'
import { getAccessToken } from './google-auth'
import { getSettings, type GoogleProviderConfig } from './settings'

export type DriveFileHit = { id: string; name: string; mimeType: string }

const DRIVE_DEADLINE_MS = 60_000
let driveSignal: AbortSignal | undefined

/** Drive への通信が止まったまま画面を占有しない。 */
export async function withDriveDeadline<T>(work: () => Promise<T>): Promise<T> {
  const ctrl = new AbortController()
  const prev = driveSignal
  driveSignal = ctrl.signal
  let timer = 0
  const timeout = new Promise<never>((_, reject) => {
    timer = window.setTimeout(() => {
      ctrl.abort()
      reject(new Error('Google の処理が時間内に終わりませんでした。通信を確認して、もう一度実行してください。'))
    }, DRIVE_DEADLINE_MS)
  })
  try {
    return await Promise.race([work(), timeout])
  } finally {
    window.clearTimeout(timer)
    driveSignal = prev
  }
}

async function driveFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = getAccessToken()
  if (!token) throw new Error('Google にログインしていません')
  const url = path.startsWith('http')
    ? path
    : `https://www.googleapis.com/drive/v3/${path.replace(/^\//, '')}`
  const headers = new Headers(init?.headers)
  headers.set('Authorization', `Bearer ${token}`)
  return fetch(url, { ...init, headers, signal: driveSignal })
}

async function driveJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await driveFetch(path, init)
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Drive API ${res.status}: ${body.slice(0, 200) || res.statusText}`)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export function googleFileNames(): GoogleProviderConfig['files'] {
  const g = getSettings().providers.google
  return {
    log: String(g?.files?.log || 'log.json'),
    pos: String(g?.files?.pos || 'pos.json'),
    tmp: String(g?.files?.tmp || 'tmp.json'),
    masters: String(g?.files?.masters || 'masters.json'),
    settings: String(g?.files?.settings || 'settings.json'),
  }
}

/** マイドライブ直下などで名前一致のフォルダを探す */
export async function findFolderByName(folderName: string): Promise<DriveFileHit | null> {
  const name = folderName.replace(/'/g, "\\'")
  const q = [
    `name='${name}'`,
    `mimeType='application/vnd.google-apps.folder'`,
    'trashed=false',
  ].join(' and ')
  const data = await driveJson<{ files?: DriveFileHit[] }>(
    `files?pageSize=10&fields=files(id,name,mimeType)&q=${encodeURIComponent(q)}`,
  )
  return data.files?.[0] ?? null
}

export async function createFolder(folderName: string): Promise<DriveFileHit> {
  return driveJson<DriveFileHit>('files?fields=id,name,mimeType', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
    }),
  })
}

export async function listChildren(folderId: string): Promise<DriveFileHit[]> {
  const q = `'${folderId}' in parents and trashed=false`
  const data = await driveJson<{ files?: DriveFileHit[] }>(
    `files?pageSize=50&fields=files(id,name,mimeType)&q=${encodeURIComponent(q)}&orderBy=name`,
  )
  return data.files ?? []
}

export async function findChildByName(
  folderId: string,
  fileName: string,
): Promise<DriveFileHit | null> {
  const name = fileName.replace(/'/g, "\\'")
  const q = `'${folderId}' in parents and name='${name}' and trashed=false`
  const data = await driveJson<{ files?: DriveFileHit[] }>(
    `files?pageSize=5&fields=files(id,name,mimeType)&q=${encodeURIComponent(q)}`,
  )
  return data.files?.[0] ?? null
}

async function foldersNamed(
  parentId: string,
  name: string,
): Promise<DriveFileHit[]> {
  const safe = name.replace(/'/g, "\\'")
  const q = [
    `'${parentId}' in parents`,
    `name='${safe}'`,
    `mimeType='application/vnd.google-apps.folder'`,
    'trashed=false',
  ].join(' and ')
  const data = await driveJson<{ files?: DriveFileHit[] }>(
    `files?pageSize=20&fields=files(id,name,mimeType)&q=${encodeURIComponent(q)}`,
  )
  return data.files ?? []
}

/** この端末で選んだ保管先。未選択なら送受信しない。 */
export async function resolveSyncFolder(
  kind: GoogleFolderKind = 'auto',
): Promise<{ folderName: string; folderId: string }> {
  const saved = loadGoogleFolder(kind)
  if (!saved) throw new Error('Google のフォルダが未選択です')
  return saved
}

/** マイドライブからのパスを1段ずつ開く。同じ名前が複数なら、その段で選ばせる。 */
export async function listDriveFolders(parentId: string, name: string): Promise<DriveFileHit[]> {
  return foldersNamed(parentId, name)
}

export function drivePathSegments(path: string): string[] {
  return splitFolderPath(path)
}

export async function downloadJsonByFileId(fileId: string): Promise<unknown> {
  const res = await driveFetch(`files/${fileId}?alt=media`)
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Drive 読込 ${res.status}: ${body.slice(0, 200) || res.statusText}`)
  }
  return JSON.parse(await res.text()) as unknown
}

/** フォルダ内のファイルをページ単位で全部読む。 */
export async function listAllChildren(folderId: string): Promise<DriveFileHit[]> {
  const out: DriveFileHit[] = []
  let pageToken = ''
  do {
    const q = `'${folderId}' in parents and trashed=false`
    const token = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''
    const data = await driveJson<{ files?: DriveFileHit[]; nextPageToken?: string }>(
      `files?pageSize=100&fields=nextPageToken,files(id,name,mimeType)&q=${encodeURIComponent(q)}&orderBy=name${token}`,
    )
    out.push(...(data.files ?? []))
    pageToken = data.nextPageToken || ''
  } while (pageToken)
  return out
}

/** 一覧の中から、種類ごとにいちばん新しい JSON を読む。無ければ null */
export async function readListedJson(
  files: readonly DriveFileHit[],
  canonical: string,
): Promise<{ name: string; data: unknown } | null> {
  const picked = pickLatestEntry(
    files
      .filter((file) => file.mimeType !== 'application/vnd.google-apps.folder')
      .map((file) => ({ item: file, fileName: file.name, depth: 1 })),
    canonical,
  )
  if (!picked) return null
  return { name: picked.item.name, data: await downloadJsonByFileId(picked.item.id) }
}

/** 種類ごとに、14桁がいちばん大きい JSON を読む。無ければ null */
export async function downloadLatestJson(
  folderId: string,
  canonical: string,
): Promise<{ name: string; data: unknown } | null> {
  return readListedJson(await listAllChildren(folderId), canonical)
}

/** 日時付きの新しいファイルを追加する。 */
export async function uploadStampedJson(
  folderId: string,
  canonical: string,
  data: unknown,
  stamp = localStamp(),
): Promise<string> {
  const name = stampedFileName(canonical, stamp)
  await uploadJsonByName(folderId, name, data)
  return name
}

/** フォルダ内の名前で JSON を読む。無ければ null */
export async function downloadJsonByName(
  folderId: string,
  fileName: string,
): Promise<unknown | null> {
  const hit = await findChildByName(folderId, fileName)
  if (!hit) return null
  return downloadJsonByFileId(hit.id)
}

/** 同名があれば内容更新、無ければ新規作成 */
export async function uploadJsonByName(
  folderId: string,
  fileName: string,
  data: unknown,
): Promise<DriveFileHit> {
  const body = JSON.stringify(data, null, 2)
  const existing = await findChildByName(folderId, fileName)
  if (existing) {
    const res = await driveFetch(
      `https://www.googleapis.com/upload/drive/v3/files/${existing.id}?uploadType=media`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body,
      },
    )
    if (!res.ok) {
      const t = await res.text().catch(() => '')
      throw new Error(`Drive 更新 ${res.status}: ${t.slice(0, 200) || res.statusText}`)
    }
    return existing
  }

  const meta = {
    name: fileName,
    parents: [folderId],
    mimeType: 'application/json',
  }
  const boundary = 'flight_pwa_boundary'
  const multipart =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(meta)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: application/json\r\n\r\n` +
    `${body}\r\n` +
    `--${boundary}--`
  const created = await driveJson<DriveFileHit>(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType',
    {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body: multipart,
    },
  )
  return created
}

/** settings の folderName を使い、フォルダ内ファイル名を返す疎通テスト */
export async function probeConfiguredDriveFolder(): Promise<{
  folderName: string
  folderId: string
  files: DriveFileHit[]
}> {
  const { folderName, folderId } = await resolveSyncFolder()
  const files = await listChildren(folderId)
  return { folderName, folderId, files }
}
