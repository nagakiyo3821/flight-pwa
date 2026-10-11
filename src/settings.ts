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
  /** 手動書き出し専用。自動ローカルとは別フォルダ */
  manualLocal?: { folderName: string }
  /** iCloud Drive 上の相対パス。Android では使わない */
  icloud?: { folderName: string }
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
  const known = ['none', 'google', 'webdav', 's3compatible']
  const asProvider = (value: unknown): SyncProviderId | '' => {
    const s = String(value ?? '')
    return known.includes(s) ? (s as SyncProviderId) : ''
  }
  const fromActive = asProvider(o.active)
  const fromSync = asProvider(syncIn.provider)
  // 書出ファイルは active が none のまま残ることがある。enabled で同期を求めていれば provider を優先する。
  let provider: SyncProviderId = 'none'
  if (Boolean(syncIn.enabled)) {
    if (fromSync && fromSync !== 'none') provider = fromSync
    else if (fromActive && fromActive !== 'none') provider = fromActive
  }
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
    createFolderIfMissing: false,
  }

  const topGoogle =
    o.google && typeof o.google === 'object' ? (o.google as Record<string, unknown>) : null
  if (topGoogle) {
    const name = String(topGoogle.folderName || '').trim()
    if (name) {
      google.folderName = name
      provider = 'google'
    }
    const id = String(topGoogle.folderId || '').trim()
    if (id) google.folderId = id
  }
  const enabledNow = provider !== 'none'

  const named = (value: unknown): { folderName: string } | undefined => {
    if (!value || typeof value !== 'object') return undefined
    const name = String((value as { folderName?: unknown }).folderName || '').trim()
    if (!name) return undefined
    return { folderName: name }
  }

  return {
    version: typeof o.version === 'number' ? o.version : 1,
    sync: {
      enabled: enabledNow,
      provider: enabledNow ? provider : 'none',
      mode: enabledNow ? mode : 'manual',
      onLaunch: false,
      onOnline: false,
      onEdit: false,
    },
    active: enabledNow ? provider : 'none',
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
    manualLocal: named(o.manualLocal),
    icloud: named(o.icloud),
  }
}

/** 利用者が出し入れする settings.json（v2） */
export function settingsDocument(s: SettingsFile = getSettings()): Record<string, unknown> {
  const doc: Record<string, unknown> = { version: 2 }
  if (s.manualLocal?.folderName) doc.manualLocal = { folderName: s.manualLocal.folderName }
  if (s.icloud?.folderName) doc.icloud = { folderName: s.icloud.folderName }
  const g = s.providers.google
  if (s.sync.enabled && s.active === 'google' && g?.folderName) {
    doc.google = {
      folderName: g.folderName,
      folderId: String(g.folderId || ''),
    }
  }
  return doc
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
  if (s.manualLocal?.folderName) lines.push(`Local: ${s.manualLocal.folderName}`)
  if (s.icloud?.folderName) lines.push(`iCloud: ${s.icloud.folderName}`)
  if (s.notes) lines.push(`notes: ${s.notes}`)
  return lines
}

/** 自動同期の案内（ログイン後に onLaunch / ボタンで実行） */
export function syncNotImplementedMessage(): string {
  return '衝突時は端末優先でマージ後に Drive へ送ります。settings ファイル自体は Drive 同期しません。'
}
