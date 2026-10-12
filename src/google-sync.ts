/**
 * Google Drive 同期（log / pos / tmp / masters）
 * 衝突時は端末（IndexedDB）優先。手動取込＝最新方針に合わせる。
 * settings.json の Drive 同期は当面しない（接続設定のループ回避）。
 */

import type { MastersFile } from './catalog'
import {
  exportLog,
  exportMasters,
  exportPos,
  exportTmp,
  importLog,
  importMasters,
  importPos,
  importSettings,
  importTmp,
} from './db'
import {
  downloadJsonByName,
  googleFileNames,
  resolveSyncFolder,
  uploadJsonByName,
} from './google-drive'
import type { GoogleFolderKind } from './google-folder'
import {
  ensureGoogleAccessToken,
  isGoogleClientConfigured,
} from './google-auth'
import { getSettings, normalizeSettings, setSettings } from './settings'
import type { LogFile, PosFile, TmpFlag } from './types'

export type SyncDirection = 'pull' | 'push' | 'both'

export type SyncReport = {
  ok: boolean
  folderId: string
  folderName: string
  lines: string[]
}

function uniqStrings(a: string[] = [], b: string[] = []): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const x of [...a, ...b]) {
    const s = String(x ?? '').trim()
    if (!s || seen.has(s)) continue
    seen.add(s)
    out.push(s)
  }
  return out
}

function mergeLog(remote: LogFile | null, local: LogFile): LogFile {
  return { ...(remote || {}), ...local }
}

function mergePos(remote: PosFile | null, local: PosFile): PosFile {
  return { ...(remote || {}), ...local }
}

/** tmp は端末優先（飛行中セッションを Drive の古い FLAG で潰さない） */
function mergeTmp(remote: TmpFlag | null, local: TmpFlag): TmpFlag {
  if (!remote) return local
  return { ...remote, ...local }
}

function mergeMasters(remote: MastersFile | null, local: MastersFile): MastersFile {
  if (!remote) return local
  const listKeys = new Set([
    ...Object.keys(remote.lists || {}),
    ...Object.keys(local.lists || {}),
  ])
  const lists: MastersFile['lists'] = {}
  for (const k of listKeys) {
    lists[k] = uniqStrings(remote.lists?.[k], local.lists?.[k])
  }
  const idKeys = new Set([
    ...Object.keys(remote.drones?.ids || {}),
    ...Object.keys(local.drones?.ids || {}),
  ])
  const ids: Record<string, string[]> = {}
  for (const k of idKeys) {
    ids[k] = uniqStrings(remote.drones?.ids?.[k], local.drones?.ids?.[k])
  }
  return {
    version: Math.max(Number(remote.version) || 1, Number(local.version) || 1),
    lists,
    drones: {
      types: uniqStrings(remote.drones?.types, local.drones?.types),
      ids,
      profiles: {
        ...(remote.drones?.profiles || {}),
        ...(local.drones?.profiles || {}),
      },
    },
    labels: { ...(remote.labels || {}), ...(local.labels || {}) },
  }
}

function asLog(data: unknown): LogFile | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  return data as LogFile
}
function asPos(data: unknown): PosFile | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  return data as PosFile
}
function asTmp(data: unknown): TmpFlag | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  return data as TmpFlag
}
function asMasters(data: unknown): MastersFile | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  const m = data as MastersFile
  if (!m.lists || !m.drones) return null
  return m
}

/** 解決した folderId を settings に残す（次回検索を省略） */
export async function persistFolderId(folderId: string): Promise<void> {
  const s = getSettings()
  const cur = String(s.providers.google?.folderId || '').trim()
  if (cur === folderId) return
  const next = normalizeSettings({
    ...s,
    providers: {
      ...s.providers,
      google: { ...(s.providers.google || {}), folderId },
    },
  })
  await importSettings(next)
  setSettings(next)
}

const DRIVE_DATA_KEYS = ['log', 'pos', 'tmp', 'masters'] as const
type DriveDataKey = (typeof DRIVE_DATA_KEYS)[number]

function selectedDriveKeys(only?: readonly DriveDataKey[]): DriveDataKey[] {
  const keys = only?.length ? DRIVE_DATA_KEYS.filter((key) => only.includes(key)) : [...DRIVE_DATA_KEYS]
  if (!keys.length) throw new Error('ファイルが選ばれていません')
  return keys
}

export async function runGoogleDriveSync(
  direction: SyncDirection,
  only?: readonly DriveDataKey[],
  kind: GoogleFolderKind = 'auto',
): Promise<SyncReport> {
  if (!isGoogleClientConfigured()) {
    throw new Error('VITE_GOOGLE_CLIENT_ID が未設定です')
  }
  await ensureGoogleAccessToken()

  const { folderName, folderId } = await resolveSyncFolder(kind)
  const names = googleFileNames()
  const keys = selectedDriveKeys(only)
  const lines: string[] = [`フォルダ: ${folderName} (${folderId})`]
  const fileName: Record<DriveDataKey, string> = {
    log: names.log,
    pos: names.pos,
    tmp: names.tmp,
    masters: names.masters,
  }

  if (direction === 'pull' || direction === 'both') {
    if (keys.includes('log')) {
      const remoteLog = asLog(await downloadJsonByName(folderId, names.log))
      await importLog(mergeLog(remoteLog, await exportLog()))
    }
    if (keys.includes('pos')) {
      const remotePos = asPos(await downloadJsonByName(folderId, names.pos))
      await importPos(mergePos(remotePos, await exportPos()))
    }
    if (keys.includes('tmp')) {
      const remoteTmp = asTmp(await downloadJsonByName(folderId, names.tmp))
      await importTmp(mergeTmp(remoteTmp, await exportTmp()))
    }
    if (keys.includes('masters')) {
      const remoteMasters = asMasters(await downloadJsonByName(folderId, names.masters))
      await importMasters(mergeMasters(remoteMasters, await exportMasters()))
    }
    lines.push(`取得: ${keys.map((key) => fileName[key]).join(' / ')}`)
  }

  if (direction === 'push' || direction === 'both') {
    const payloads: Record<DriveDataKey, () => Promise<unknown>> = {
      log: exportLog,
      pos: exportPos,
      tmp: exportTmp,
      masters: exportMasters,
    }
    for (const key of keys) {
      await uploadJsonByName(folderId, fileName[key], await payloads[key]())
    }
    lines.push(`送信: ${keys.map((key) => fileName[key]).join(' / ')}`)
  }

  return { ok: true, folderId, folderName, lines }
}

/** 起動時・通信復帰の自動同期はしない。書き出しは 5.データ登録のあと。 */
export async function maybeAutoSync(_reason: 'launch' | 'online'): Promise<string | null> {
  return null
}
