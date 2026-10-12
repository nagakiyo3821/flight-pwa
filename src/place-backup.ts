/**
 * 5.データ登録のあと、自動ローカルへ 4 ファイルを書く。
 * 成功したときだけ、条件がそろったクラウドへ追加で書く。
 */

import { db, exportLog, exportMasters, exportPos, exportTmp, importLog, importMasters, importPos, importTmp, PLAIN_NEW_KEY } from './db'
import { isGoogleSignedIn } from './google-auth'
import { runGoogleDriveSync } from './google-sync'
import { autoFolderReady, beginDirectoryPick, directoryStatus, EmptyFolderUnreported, readJsonFiles, rememberDirectory, storedDirectory, writeJsonFiles } from './local-dirs'
import { getSettings, isServerSyncConfigured } from './settings'
import type { LogFile, PosFile, TmpFlag } from './types'
import type { MastersFile } from './catalog'

const PENDING = 'flight-local-export-pending'
export const MANUAL_IO_FILES = [
  { key: 'log', file: 'log.json' },
  { key: 'pos', file: 'pos.json' },
  { key: 'tmp', file: 'tmp.json' },
  { key: 'masters', file: 'masters.json' },
] as const
export type ManualIoKey = (typeof MANUAL_IO_FILES)[number]['key']
const FILE_NAMES = MANUAL_IO_FILES.map((item) => item.file)

export async function internalIsInitialEmpty(): Promise<boolean> {
  const flights = await db.flights.toArray()
  const places = await db.places.count()
  if (places !== 0 || flights.length !== 1) return false
  const row = flights[0]
  return row.key === PLAIN_NEW_KEY && !String(row.A_DATE || '').trim()
}

export async function needsLocalGate(): Promise<boolean> {
  if (localStorage.getItem(PENDING) === '1') return true
  return !(await autoFolderReady())
}

const EXPORTERS: Record<ManualIoKey, () => Promise<unknown>> = {
  log: exportLog,
  pos: exportPos,
  tmp: exportTmp,
  masters: exportMasters,
}

async function bundleSelected(keys: readonly ManualIoKey[]): Promise<Record<string, unknown>> {
  const want = new Set(keys)
  const out: Record<string, unknown> = {}
  for (const item of MANUAL_IO_FILES) {
    if (!want.has(item.key)) continue
    out[item.file] = await EXPORTERS[item.key]()
  }
  if (!Object.keys(out).length) throw new Error('ファイルが選ばれていません')
  return out
}

async function bundleFromDb(): Promise<Record<string, unknown>> {
  return bundleSelected(MANUAL_IO_FILES.map((item) => item.key))
}

export async function restoreFromAutoIfEmpty(isEmpty: boolean): Promise<string | null> {
  if (!isEmpty) return null
  const files = await readJsonFiles('auto', [...FILE_NAMES])
  if (!files) return null
  await importLog(files['log.json'] as LogFile)
  await importPos(files['pos.json'] as PosFile)
  await importTmp(files['tmp.json'] as TmpFlag)
  await importMasters(files['masters.json'] as MastersFile)
  return '自動ローカルから復元しました'
}

/** 本登録のあと。失敗しても本登録は戻さない。 */
export async function writeAfterCommit(): Promise<string> {
  const lines: string[] = []
  try {
    const written = await writeJsonFiles('auto', await bundleFromDb())
    localStorage.removeItem(PENDING)
    lines.push(`自動ローカルへ書き出しました（${written.join(', ')}）`)
  } catch (e) {
    localStorage.setItem(PENDING, '1')
    return `自動ローカルへ書けませんでした。${(e as Error).message}`
  }

  const s = getSettings()
  if (s.icloud?.folderName) {
    if (await storedDirectory('icloud')) {
      try {
        await writeJsonFiles('icloud', await bundleFromDb())
        lines.push(`iCloud「${s.icloud.folderName}」へ書き出しました`)
      } catch (e) {
        lines.push(`iCloud はスキップ（${(e as Error).message}）`)
      }
    } else {
      lines.push('iCloud のフォルダが未選択のためスキップ')
    }
  }

  if (isServerSyncConfigured() && s.active === 'google') {
    if (!isGoogleSignedIn()) {
      lines.push('Google は未ログインのためスキップ')
    } else {
      try {
        const report = await runGoogleDriveSync('push')
        lines.push(report.lines[0] || 'Google へ書き出しました')
      } catch (e) {
        lines.push(`Google はスキップ（${(e as Error).message}）`)
      }
    }
  }
  return lines.join('\n')
}

export async function writeManualLocal(): Promise<string> {
  return exportToFolder(
    'manual',
    MANUAL_IO_FILES.map((item) => item.key),
  )
}

async function ensureDirectory(kind: 'manual' | 'icloud'): Promise<void> {
  if ((await directoryStatus(kind)) !== '未設定') return
  try {
    await beginDirectoryPick(kind)
  } catch (error) {
    if (!(error instanceof EmptyFolderUnreported)) throw error
    rememberDirectory(kind, error.directory || '空のフォルダ')
  }
}

/** 手動エクスポート。選んだファイルだけ書く。 */
export async function exportToFolder(
  kind: 'manual' | 'icloud',
  keys: readonly ManualIoKey[],
): Promise<string> {
  await ensureDirectory(kind)
  const written = await writeJsonFiles(kind, await bundleSelected(keys))
  const dir = await directoryStatus(kind)
  const label = kind === 'manual' ? 'Local' : 'iCloud'
  return `${label}「${dir}」へ書き出しました（${written.join(', ')}）`
}

/** 手動インポート。選んだファイルだけ端末データを更新する。 */
export async function importFromFolder(
  kind: 'manual' | 'icloud',
  keys: readonly ManualIoKey[],
): Promise<string> {
  await ensureDirectory(kind)
  const names = MANUAL_IO_FILES.filter((item) => keys.includes(item.key)).map((item) => item.file)
  if (!names.length) throw new Error('ファイルが選ばれていません')
  const files = await readJsonFiles(kind, names)
  if (!files) throw new Error('選んだファイルをフォルダから読めませんでした')
  if (files['log.json']) await importLog(files['log.json'] as LogFile)
  if (files['pos.json']) await importPos(files['pos.json'] as PosFile)
  if (files['tmp.json']) await importTmp(files['tmp.json'] as TmpFlag)
  if (files['masters.json']) await importMasters(files['masters.json'] as MastersFile)
  const dir = await directoryStatus(kind)
  const label = kind === 'manual' ? 'Local' : 'iCloud'
  return `${label}「${dir}」から取り込みました（${names.join(', ')}）`
}
