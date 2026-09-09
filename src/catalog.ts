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
