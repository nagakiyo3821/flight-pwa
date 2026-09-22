/**
 * 同期・格納先設定（settings.json）
 * Google を当面の実装対象。他プロバイダはスキーマ予約。
 */

export type SyncProviderId = 'none' | 'google' | 'webdav' | 's3compatible'

export interface SyncOptions {
  enabled: boolean
  provider: SyncProviderId
  mode: 'auto' | 'manual'
  onLaunch: boolean
  onOnline: boolean
  onEdit: boolean
}

export interface GoogleProviderConfig {
  folderName: string
  folderId: string
  files: {
    log: string
    pos: string
    tmp: string
    masters: string
    settings: string
  }
  createFolderIfMissing: boolean
}

export interface SettingsFile {
  version: number
  sync: SyncOptions
  active: SyncProviderId
  providers: {
    none?: Record<string, never>
    google?: Partial<GoogleProviderConfig> & Record<string, unknown>
    webdav?: Record<string, unknown>
    s3compatible?: Record<string, unknown>
  }
  manualIoAlwaysAvailable?: boolean
  notes?: string
}

const defaultGoogle: GoogleProviderConfig = {
  folderName: 'drone',
  folderId: '',
  files: {
    log: 'log.json',
    pos: 'pos.json',
    tmp: 'tmp.json',
    masters: 'masters.json',
    settings: 'settings.json',
  },
  createFolderIfMissing: true,
}

export function defaultSettingsNone(): SettingsFile {
  return {
    version: 1,
    sync: {
      enabled: false,
      provider: 'none',
      mode: 'manual',
      onLaunch: false,
      onOnline: false,
      onEdit: false,
    },
    active: 'none',
    providers: { none: {} },
    manualIoAlwaysAvailable: true,
    notes: '手動 JSON 入出力のみ。',
  }
}

/** 取込 JSON を正規化（空や不正は none へ） */
export function normalizeSettings(raw: unknown): SettingsFile {
  const base = defaultSettingsNone()
  if (!raw || typeof raw !== 'object') return base
  const o = raw as Record<string, unknown>
  const syncIn = (o.sync && typeof o.sync === 'object' ? o.sync : {}) as Record<string, unknown>
  const activeRaw = String(o.active ?? syncIn.provider ?? 'none')
  const provider = (['none', 'google', 'webdav', 's3compatible'].includes(activeRaw)
    ? activeRaw
    : 'none') as SyncProviderId

  const enabled = Boolean(syncIn.enabled) && provider !== 'none'
  const mode = syncIn.mode === 'auto' ? 'auto' : 'manual'

  const providersIn =
    o.providers && typeof o.providers === 'object'
      ? (o.providers as SettingsFile['providers'])
      : {}

  const gIn = providersIn.google || {}
  const google: GoogleProviderConfig = {
    ...defaultGoogle,
    folderName: String((gIn as GoogleProviderConfig).folderName || defaultGoogle.folderName),
    folderId: String((gIn as GoogleProviderConfig).folderId || ''),
    files: {
      ...defaultGoogle.files,
      ...((gIn as GoogleProviderConfig).files || {}),
    },
    createFolderIfMissing:
      (gIn as GoogleProviderConfig).createFolderIfMissing !== false,
  }

  return {
    version: typeof o.version === 'number' ? o.version : 1,
    sync: {
      enabled,
      provider: enabled ? provider : 'none',
      mode: enabled ? mode : 'manual',
      onLaunch: enabled ? Boolean(syncIn.onLaunch) : false,
      onOnline: enabled ? Boolean(syncIn.onOnline) : false,
      onEdit: enabled ? Boolean(syncIn.onEdit) : false,
    },
    active: enabled ? provider : 'none',
    providers: {
      none: {},
      google: { ...google } as SettingsFile['providers']['google'],
      webdav: providersIn.webdav || { baseUrl: '', username: '', path: '/drone' },
      s3compatible: providersIn.s3compatible || {
        endpoint: '',
        bucket: '',
        prefix: 'drone/',
      },
    },
    manualIoAlwaysAvailable: o.manualIoAlwaysAvailable !== false,
    notes: typeof o.notes === 'string' ? o.notes : base.notes,
  }
}

let current: SettingsFile = defaultSettingsNone()

export function getSettings(): SettingsFile {
  return current
}

export function setSettings(s: SettingsFile): void {
  current = normalizeSettings(s)
}

export function isServerSyncConfigured(): boolean {
  const s = getSettings()
  return s.sync.enabled && s.active !== 'none'
}

export function syncStatusLabel(): string {
  const s = getSettings()
  if (!s.sync.enabled || s.active === 'none') return '手動のみ'
  if (s.active === 'google') return 'Google（Drive 同期可）'
  return `${s.active}（未対応プロバイダ・手動のみ動作）`
}

/** 設定画面用の詳細行（表示専用） */
export function settingsDetailLines(): string[] {
  const s = getSettings()
  const lines = [
    `モード: ${syncStatusLabel()}`,
    `provider / active: ${s.sync.provider} / ${s.active}`,
    `sync.mode: ${s.sync.mode}`,
    `onLaunch: ${s.sync.onLaunch ? 'on' : 'off'}`,
    `onOnline: ${s.sync.onOnline ? 'on' : 'off'}`,
    `onEdit: ${s.sync.onEdit ? 'on' : 'off'}`,
  ]
  if (s.active === 'google' && s.providers.google) {
    const g = s.providers.google
    lines.push(
      `Drive フォルダ: ${String(g.folderName || 'drone')}`,
      `folderId: ${String(g.folderId || '（空＝名前で検索）')}`,
    )
  }
  if (s.notes) lines.push(`notes: ${s.notes}`)
  return lines
}

/** 自動同期の案内（ログイン後に onLaunch / ボタンで実行） */
export function syncNotImplementedMessage(): string {
  return '衝突時は端末優先でマージ後に Drive へ送ります。settings ファイル自体は Drive 同期しません。'
}
