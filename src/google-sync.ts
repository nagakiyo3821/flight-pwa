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
import {
  ensureGoogleAccessToken,
  isGoogleClientConfigured,
  isGoogleSignedIn,
} from './google-auth'
import { getSettings, isServerSyncConfigured, normalizeSettings, setSettings } from './settings'
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

export async function runGoogleDriveSync(direction: SyncDirection): Promise<SyncReport> {
  if (!isServerSyncConfigured() || getSettings().active !== 'google') {
    throw new Error('settings が Google 同期になっていません')
  }
  if (!isGoogleClientConfigured()) {
    throw new Error('VITE_GOOGLE_CLIENT_ID が未設定です')
  }
  await ensureGoogleAccessToken()

  const { folderName, folderId } = await resolveSyncFolder()
  await persistFolderId(folderId)
  const names = googleFileNames()
  const lines: string[] = [`フォルダ: ${folderName} (${folderId})`]

  if (direction === 'pull' || direction === 'both') {
    const remoteLog = asLog(await downloadJsonByName(folderId, names.log))
    const remotePos = asPos(await downloadJsonByName(folderId, names.pos))
    const remoteTmp = asTmp(await downloadJsonByName(folderId, names.tmp))
    const remoteMasters = asMasters(await downloadJsonByName(folderId, names.masters))

    const localLog = await exportLog()
    const localPos = await exportPos()
    const localTmp = await exportTmp()
    const localMasters = await exportMasters()

    const mergedLog = mergeLog(remoteLog, localLog)
    const mergedPos = mergePos(remotePos, localPos)
    const mergedTmp = mergeTmp(remoteTmp, localTmp)
    const mergedMasters = mergeMasters(remoteMasters, localMasters)

    await importLog(mergedLog)
    await importPos(mergedPos)
    await importTmp(mergedTmp)
    await importMasters(mergedMasters)

    lines.push(
      `取得マージ: log ${Object.keys(mergedLog).length} / pos ${Object.keys(mergedPos).length}` +
        ` / tmp / masters` +
        `（端末優先。Driveのみ: log=${remoteLog ? Object.keys(remoteLog).length : 0}）`,
    )
  }

  if (direction === 'push' || direction === 'both') {
    const log = await exportLog()
    const pos = await exportPos()
    const tmp = await exportTmp()
    const masters = await exportMasters()
    await uploadJsonByName(folderId, names.log, log)
    await uploadJsonByName(folderId, names.pos, pos)
    await uploadJsonByName(folderId, names.tmp, tmp)
    await uploadJsonByName(folderId, names.masters, masters)
    lines.push(
      `送信: ${names.log} / ${names.pos} / ${names.tmp} / ${names.masters}` +
        `（log ${Object.keys(log).length}・pos ${Object.keys(pos).length}）`,
    )
  }

  return { ok: true, folderId, folderName, lines }
}

let launchSyncDone = false
let onlineSyncRunning = false

/** 起動時・オンライン復帰。未ログインなら静かにスキップ */
export async function maybeAutoSync(reason: 'launch' | 'online'): Promise<string | null> {
  if (!isServerSyncConfigured() || getSettings().active !== 'google') return null
  if (!isGoogleClientConfigured()) return null
  const s = getSettings().sync
  if (reason === 'launch' && !s.onLaunch) return null
  if (reason === 'online' && !s.onOnline) return null
  if (reason === 'launch' && launchSyncDone) return null
  if (!isGoogleSignedIn()) {
    return reason === 'launch'
      ? 'Google 同期: 未ログインのためスキップ（システムデータ管理でログイン可）'
      : null
  }
  if (onlineSyncRunning) return null
  onlineSyncRunning = true
  try {
    const report = await runGoogleDriveSync('both')
    if (reason === 'launch') launchSyncDone = true
    return `Google 同期完了（${reason}）\n` + report.lines.join('\n')
  } catch (e) {
    return `Google 同期失敗（${reason}）: ${(e as Error).message}`
  } finally {
    onlineSyncRunning = false
  }
}

export function resetLaunchSyncFlag(): void {
  launchSyncDone = false
}
