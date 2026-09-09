/**
 * Google Drive API v3 — JSON ファイルの検索・取得・更新
 */

import { getAccessToken } from './google-auth'
import { getSettings, type GoogleProviderConfig } from './settings'

export type DriveFileHit = { id: string; name: string; mimeType: string }

async function driveFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = getAccessToken()
  if (!token) throw new Error('Google にログインしていません')
  const url = path.startsWith('http')
    ? path
    : `https://www.googleapis.com/drive/v3/${path.replace(/^\//, '')}`
  const headers = new Headers(init?.headers)
  headers.set('Authorization', `Bearer ${token}`)
  return fetch(url, { ...init, headers })
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

/** settings の folderId / folderName。無ければ作成可 */
export async function resolveSyncFolder(): Promise<{ folderName: string; folderId: string }> {
  const s = getSettings()
  const folderName = String(s.providers.google?.folderName || 'drone')
  const configuredId = String(s.providers.google?.folderId || '').trim()
  if (configuredId) return { folderName, folderId: configuredId }

  const hit = await findFolderByName(folderName)
  if (hit) return { folderName, folderId: hit.id }

  const create = s.providers.google?.createFolderIfMissing !== false
  if (!create) {
    throw new Error(`マイドライブにフォルダ「${folderName}」が見つかりません。`)
  }
  const created = await createFolder(folderName)
  return { folderName, folderId: created.id }
}

export async function downloadJsonByFileId(fileId: string): Promise<unknown> {
  const res = await driveFetch(`files/${fileId}?alt=media`)
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Drive 読込 ${res.status}: ${body.slice(0, 200) || res.statusText}`)
  }
  return JSON.parse(await res.text()) as unknown
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
