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
const FILE_NAMES = ['log.json', 'pos.json', 'tmp.json', 'masters.json'] as const

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

async function bundleFromDb(): Promise<Record<string, unknown>> {
  return {
    'log.json': await exportLog(),
    'pos.json': await exportPos(),
    'tmp.json': await exportTmp(),
    'masters.json': await exportMasters(),
  }
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
  return exportToFolder('manual')
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

/** 手動エクスポート。フォルダが未設定なら、その場で選ばせる。 */
export async function exportToFolder(kind: 'manual' | 'icloud'): Promise<string> {
  await ensureDirectory(kind)
  const written = await writeJsonFiles(kind, await bundleFromDb())
  const dir = await directoryStatus(kind)
  const label = kind === 'manual' ? 'Local' : 'iCloud'
  return `${label}「${dir}」へ書き出しました（${written.join(', ')}）`
}

/** 手動インポート。フォルダ内の 4 ファイルで端末データを更新する。 */
export async function importFromFolder(kind: 'manual' | 'icloud'): Promise<string> {
  await ensureDirectory(kind)
  const files = await readJsonFiles(kind, [...FILE_NAMES])
  if (!files) throw new Error('ディレクトリ内の 4 ファイルを読めませんでした')
  await importLog(files['log.json'] as LogFile)
  await importPos(files['pos.json'] as PosFile)
  await importTmp(files['tmp.json'] as TmpFlag)
  await importMasters(files['masters.json'] as MastersFile)
  const dir = await directoryStatus(kind)
  const label = kind === 'manual' ? 'Local' : 'iCloud'
  return `${label}「${dir}」から取り込みました`
}
