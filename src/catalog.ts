/**
 * 選択肢マスタ（JSON カタログ）。
 * 共通 lists ＋ 機種別 profiles。個人値はユーザー masters に置く。
 */

export type ListKey =
  | 'ok2'
  | 'names'
  | 'flt1'
  | 'flt2'
  | 'obst'
  | 'elemag'
  | 'third'
  | 'wind'
  | 'mode'
  | 'fails'
  | 'batn'

export type LabelKey = 'nameCustom' | 'batnCustom' | 'placeCustom' | 'droneIdCustom'

export interface DroneProfile {
  lists?: Partial<Record<ListKey, string[]>>
  /**
   * 機種ごとの項目取捨（PWA は 1〜63 全項目定義が前提）。
   * ここに列挙した JSON キーは編集一覧・チェックリストから隠す。
   * FLAG 必須判定からも除外する（空のままで進行可）。
   * 新項目の追加は FIELDS 再構成が必要（本配列では不可）。
   */
  hiddenKeys?: string[]
}

export interface MastersFile {
  version: number
  lists: Partial<Record<ListKey, string[]>> & Record<string, string[] | undefined>
  drones: {
    types: string[]
    ids: Record<string, string[]>
    profiles?: Record<string, DroneProfile>
  }
  labels: Partial<Record<LabelKey, string>> & Record<string, string | undefined>
}

const LIST_KEYS: ListKey[] = [
  'ok2',
  'names',
  'flt1',
  'flt2',
  'obst',
  'elemag',
  'third',
  'wind',
  'mode',
  'fails',
  'batn',
]

const LABEL_KEYS: LabelKey[] = [
  'nameCustom',
  'batnCustom',
  'placeCustom',
  'droneIdCustom',
]

let catalog: MastersFile | null = null
let bundledDefault: MastersFile | null = null

export function getCatalog(): MastersFile {
  if (!catalog) {
    throw new Error('masters catalog が未ロードです（ensureCatalog を先に呼んでください）')
  }
  return catalog
}

export function setCatalog(m: MastersFile): void {
  catalog = m
}

export function isCatalogReady(): boolean {
  return catalog != null
}

/** A_DRONE（機種_識別）または tmp.DRONE から機種名 */
export function droneTypeFrom(recDrone: string | undefined, tmpDrone?: string): string {
  const fromRec = String(recDrone ?? '')
    .split('_')[0]
    ?.trim()
  if (fromRec) return fromRec
  const fromTmp = String(tmpDrone ?? '').trim()
  return fromTmp || 'Mavic2Pro'
}

export function getList(key: ListKey | string, droneType?: string): string[] {
  const c = getCatalog()
  const type = (droneType || '').trim()
  if (type) {
    const prof = c.drones.profiles?.[type]
    const fromProf = prof?.lists?.[key as ListKey]
    if (fromProf && Array.isArray(fromProf)) return [...fromProf]
  }
  const base = c.lists[key]
  return Array.isArray(base) ? [...base] : []
}

/** 機種別識別番号を追加（既存なら false） */
export function appendDroneId(type: string, id: string): boolean {
  const t = String(type ?? '').trim()
  const v = String(id ?? '').trim()
  if (!t || !v) return false
  const c = getCatalog()
  const list = Array.isArray(c.drones.ids[t]) ? [...c.drones.ids[t]!] : []
  if (list.includes(v)) return false
  list.push(v)
  c.drones.ids[t] = list
  setCatalog(c)
  return true
}

export function getDroneTypes(): string[] {
  return [...(getCatalog().drones.types || [])]
}

export function getDroneIds(type: string): string[] {
  const ids = getCatalog().drones.ids?.[type]
  return Array.isArray(ids) ? [...ids] : []
}

export function isKnownDroneType(s: string): boolean {
  return getDroneTypes().includes(s)
}

export function getLabel(key: LabelKey): string {
  const v = getCatalog().labels[key]
  return typeof v === 'string' && v ? v : key
}

export function getHiddenKeys(droneType?: string): string[] {
  const type = (droneType || '').trim()
  if (!type) return []
  const keys = getCatalog().drones.profiles?.[type]?.hiddenKeys
  return Array.isArray(keys) ? [...keys] : []
}

function emptyMasters(): MastersFile {
  return {
    version: 1,
    lists: Object.fromEntries(LIST_KEYS.map((k) => [k, []])) as MastersFile['lists'],
    drones: { types: [], ids: {}, profiles: {} },
    labels: {},
  }
}

/** 欠落キーのみデフォルトで補完。ユーザー側にあるキーは置換済み前提でベースに載せる */
export function mergeMasters(base: MastersFile, overlay: Partial<MastersFile> | null | undefined): MastersFile {
  const out = structuredClone(base)
  if (!overlay) return out

  if (typeof overlay.version === 'number') out.version = overlay.version

  if (overlay.lists) {
    for (const [k, v] of Object.entries(overlay.lists)) {
      if (Array.isArray(v)) out.lists[k] = [...v]
    }
  }

  if (overlay.drones) {
    if (Array.isArray(overlay.drones.types)) out.drones.types = [...overlay.drones.types]
    if (overlay.drones.ids) {
      out.drones.ids = { ...out.drones.ids }
      for (const [k, v] of Object.entries(overlay.drones.ids)) {
        if (Array.isArray(v)) out.drones.ids[k] = [...v]
      }
    }
    if (overlay.drones.profiles) {
      out.drones.profiles = { ...(out.drones.profiles || {}) }
      for (const [type, prof] of Object.entries(overlay.drones.profiles)) {
        const prev = out.drones.profiles[type] || {}
        const next: DroneProfile = {
          lists: { ...(prev.lists || {}) },
          hiddenKeys: prev.hiddenKeys ? [...prev.hiddenKeys] : [],
        }
        if (prof.lists) {
          for (const [lk, lv] of Object.entries(prof.lists)) {
            if (Array.isArray(lv)) next.lists![lk as ListKey] = [...lv]
          }
        }
        if (Array.isArray(prof.hiddenKeys)) next.hiddenKeys = [...prof.hiddenKeys]
        out.drones.profiles[type] = next
      }
    }
  }

  if (overlay.labels) {
    out.labels = { ...out.labels }
    for (const [k, v] of Object.entries(overlay.labels)) {
      if (typeof v === 'string') out.labels[k] = v
    }
  }

  // 必須リストキーの欠落補完
  for (const k of LIST_KEYS) {
    if (!Array.isArray(out.lists[k])) out.lists[k] = Array.isArray(base.lists[k]) ? [...base.lists[k]!] : []
  }
  for (const k of LABEL_KEYS) {
    if (!out.labels[k] && base.labels[k]) out.labels[k] = base.labels[k]
  }
  for (const t of out.drones.types) {
    if (!Array.isArray(out.drones.ids[t])) out.drones.ids[t] = []
  }

  return out
}

export async function loadBundledDefault(): Promise<MastersFile> {
  if (bundledDefault) return structuredClone(bundledDefault)
  try {
    const res = await fetch('./data/masters.default.json')
    if (!res.ok) throw new Error(String(res.status))
    const data = (await res.json()) as MastersFile
    bundledDefault = data
    return structuredClone(data)
  } catch {
    return emptyMasters()
  }
}

export async function tryLoadLocalMastersFile(): Promise<MastersFile | null> {
  try {
    const res = await fetch('./data/masters.json')
    if (!res.ok) return null
    return (await res.json()) as MastersFile
  } catch {
    return null
  }
}

export function exportCatalogClone(): MastersFile {
  return structuredClone(getCatalog())
}

export type JsonEditKind = 'text' | 'lines'

export type JsonEditRow = {
  key: string
  kind: JsonEditKind
  current: string
}

function linesText(value: readonly string[] | undefined): string {
  return (value || []).filter((item) => String(item).length > 0).join('\n')
}

function parseLines(raw: string): string[] {
  return raw
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}

function appendLines(current: readonly string[] | undefined, raw: string): string[] {
  const add = parseLines(raw)
  if (!add.length) throw new Error('追加する値を入力してください')
  const out = [...(current || [])]
  for (const item of add) {
    if (!out.includes(item)) out.push(item)
  }
  return out
}

/** mst.json の編集対象。配列は改行区切りで見せる。 */
export function mastersEditRows(): JsonEditRow[] {
  const c = getCatalog()
  const rows: JsonEditRow[] = []
  const listKeys = [...new Set([...LIST_KEYS, ...Object.keys(c.lists || {})])].sort()
  for (const key of listKeys) {
    rows.push({ key: `lists.${key}`, kind: 'lines', current: linesText(c.lists[key]) })
  }
  rows.push({ key: 'drones.types', kind: 'lines', current: linesText(c.drones.types) })
  const idTypes = [...new Set([...(c.drones.types || []), ...Object.keys(c.drones.ids || {})])].sort()
  for (const type of idTypes) {
    rows.push({ key: `drones.ids.${type}`, kind: 'lines', current: linesText(c.drones.ids[type]) })
  }
  for (const type of Object.keys(c.drones.profiles || {}).sort()) {
    const profile = c.drones.profiles?.[type]
    rows.push({
      key: `drones.profiles.${type}.hiddenKeys`,
      kind: 'lines',
      current: linesText(profile?.hiddenKeys),
    })
    for (const key of Object.keys(profile?.lists || {}).sort()) {
      rows.push({
        key: `drones.profiles.${type}.lists.${key}`,
        kind: 'lines',
        current: linesText(profile?.lists?.[key as ListKey]),
      })
    }
  }
  const labelKeys = [...new Set([...LABEL_KEYS, ...Object.keys(c.labels || {})])].sort()
  for (const key of labelKeys) {
    rows.push({ key: `labels.${key}`, kind: 'text', current: String(c.labels[key] || '') })
  }
  return rows
}

/** 選んだキーを置き換えるか、配列へ足す。 */
export function updateMastersKey(path: string, mode: 'replace' | 'append', raw: string): void {
  const c = structuredClone(getCatalog())
  const writeLines = (current: readonly string[] | undefined): string[] =>
    mode === 'append' ? appendLines(current, raw) : parseLines(raw)
  if (path.startsWith('lists.')) {
    const key = path.slice('lists.'.length)
    c.lists[key] = writeLines(c.lists[key])
  } else if (path === 'drones.types') {
    c.drones.types = writeLines(c.drones.types)
    for (const type of c.drones.types) {
      if (!Array.isArray(c.drones.ids[type])) c.drones.ids[type] = []
    }
  } else if (path.startsWith('drones.ids.')) {
    const type = path.slice('drones.ids.'.length)
    c.drones.ids[type] = writeLines(c.drones.ids[type])
  } else if (path.startsWith('drones.profiles.')) {
    const rest = path.slice('drones.profiles.'.length)
    const hiddenMark = '.hiddenKeys'
    const listsMark = '.lists.'
    if (rest.endsWith(hiddenMark)) {
      const type = rest.slice(0, -hiddenMark.length)
      c.drones.profiles = c.drones.profiles || {}
      const profile = c.drones.profiles[type] || {}
      profile.hiddenKeys = writeLines(profile.hiddenKeys)
      c.drones.profiles[type] = profile
    } else {
      const at = rest.indexOf(listsMark)
      if (at < 0) throw new Error('このキーは修正できません')
      const type = rest.slice(0, at)
      const key = rest.slice(at + listsMark.length) as ListKey
      c.drones.profiles = c.drones.profiles || {}
      const profile = c.drones.profiles[type] || {}
      profile.lists = profile.lists || {}
      profile.lists[key] = writeLines(profile.lists[key])
      c.drones.profiles[type] = profile
    }
  } else if (path.startsWith('labels.')) {
    if (mode === 'append') throw new Error('このキーは修正だけです')
    const key = path.slice('labels.'.length)
    const value = raw.trim()
    if (value) c.labels[key] = value
    else delete c.labels[key]
  } else {
    throw new Error('このキーは修正できません')
  }
  setCatalog(c)
}
