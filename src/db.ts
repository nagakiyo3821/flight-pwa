import Dexie, { type Table } from 'dexie'
import type { FlightRecord, LogFile, PosFile, PlaceRecord, TmpFlag } from './types'
import { emptyRecord } from './fields'
import { computeTmp, formatNow, formatNowSeconds, newWorkingKey } from './flag'
import { parseFlightDate } from './flight-time'

export interface MetaRow {
  id: string
  workingKey: string
  tmp: TmpFlag
}

/** 初期作業キー（日時なし） */
export const PLAIN_NEW_KEY = 'NEW'

export function isPlainNewKey(key: string): boolean {
  return key === PLAIN_NEW_KEY
}

export function isDatedNewKey(key: string): boolean {
  return key.startsWith('NEW') && key.length > 3
}

/** 離陸日時が有効なら NEW＋その日時、無効ならプレーン NEW */
export function newKeyFromADate(aDate: string | undefined | null): string {
  const s = String(aDate ?? '').trim()
  if (s && parseFlightDate(s)) return `NEW${s}`
  return PLAIN_NEW_KEY
}

class FlightDB extends Dexie {
  flights!: Table<FlightRecord & { key: string }, string>
  places!: Table<PlaceRecord & { name: string }, string>
  meta!: Table<MetaRow, string>

  constructor() {
    super('flight-record-pwa')
    this.version(1).stores({
      flights: 'key',
      places: 'name',
      meta: 'id',
    })
  }
}

export const db = new FlightDB()

const META_ID = 'main'

export async function ensureBootstrap(): Promise<void> {
  const meta = await db.meta.get(META_ID)
  if (!meta) {
    const key = PLAIN_NEW_KEY
    const rec = emptyRecord()
    await db.flights.put({ ...rec, key })
    const tmp = computeTmp(rec, 'Mavic2Pro', '')
    tmp.DRONE = 'Mavic2Pro'
    await db.meta.put({ id: META_ID, workingKey: key, tmp })
  }

  // iCloud Drive/drone と同じ pos03 を public/data に置き、未取込なら自動投入
  if ((await db.places.count()) === 0) {
    const pos = await fetchJson<PosFile>('./data/pos03.json')
    if (pos) await importPos(pos)
  }
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

export async function getMeta(): Promise<MetaRow> {
  await ensureBootstrap()
  return (await db.meta.get(META_ID))!
}

export async function getWorking(): Promise<{ key: string; rec: FlightRecord }> {
  const meta = await getMeta()
  const row = await db.flights.get(meta.workingKey)
  if (!row) {
    const rec = emptyRecord()
    await db.flights.put({ ...rec, key: meta.workingKey })
    return { key: meta.workingKey, rec }
  }
  const { key, ...rec } = row
  return { key, rec }
}

/** log キー一覧。通常の文字列昇順（日時キーが先、NEW 系は後ろ） */
export async function listFlightKeys(): Promise<string[]> {
  const keys = (await db.flights.toArray()).map((r) => r.key)
  return keys.sort((a, b) => a.localeCompare(b))
}

export function isNewRecordKey(key: string): boolean {
  return key.startsWith('NEW')
}

/** 作業中レコードを切り替え（登録データ管理の選択） */
export async function setWorkingKey(key: string): Promise<void> {
  const meta = await getMeta()
  let row = await db.flights.get(key)
  if (!row) {
    const rec = emptyRecord()
    await db.flights.put({ ...rec, key })
    row = { ...rec, key }
  }
  const { key: _k, ...rec } = row
  const drone = rec.A_DRONE.split('_')[0] || meta.tmp.DRONE || 'Mavic2Pro'
  // tmp.TIME はセット時刻。作業キー切替で上書きしない
  const tmp = computeTmp(rec, drone, meta.tmp.TIME)
  tmp.A_SR = rec.A_SR || meta.tmp.A_SR || ''
  tmp.A_SS = rec.A_SS || meta.tmp.A_SS || ''
  tmp.DRONE = drone
  await db.meta.put({ id: META_ID, workingKey: key, tmp })
}

/**
 * #データ削除相当。
 * NEW 系・本登録キーとも log からキーを削除する。
 * 作業中キーを消した場合は、残りのレコードへ切替。無ければプレーンな `NEW` を新規作成
 * （同一分の `NEWyyyy/mm/dd hh:mm` 再発行だと「消えていない」ように見えるため）。
 */
export async function deleteOrResetRecord(key: string): Promise<void> {
  const meta = await getMeta()
  const drone = meta.tmp.DRONE || 'Mavic2Pro'
  await db.transaction('rw', db.flights, db.meta, async () => {
    await db.flights.delete(key)
    if (meta.workingKey !== key) return

    const remain = await db.flights.toArray()
    const next =
      remain.map((r) => r.key).find((k) => k.startsWith('NEW')) ||
      remain.map((r) => r.key).sort((a, b) => b.localeCompare(a))[0]
    if (next) {
      const row = await db.flights.get(next)
      let rec: FlightRecord = emptyRecord()
      if (row) {
        const { key: _k, ...rest } = row
        rec = rest
      }
      const tmp = computeTmp(rec, drone, meta.tmp.TIME)
      tmp.A_SR = rec.A_SR || ''
      tmp.A_SS = rec.A_SS || ''
      tmp.DRONE = drone
      await db.meta.put({ id: META_ID, workingKey: next, tmp })
      return
    }

    // 空になったら Shortcuts 同様の初期作業キー `NEW`（日時なし）
    let nk = 'NEW'
    if (await db.flights.get(nk)) {
      let guard = 0
      do {
        nk = newWorkingKey(formatNowSeconds() + (guard > 0 ? `-${guard}` : ''))
        guard++
      } while ((nk === key || (await db.flights.get(nk))) && guard < 20)
    }
    const rec = emptyRecord()
    const tmp = computeTmp(rec, drone, meta.tmp.TIME)
    tmp.DRONE = drone
    await db.flights.put({ ...rec, key: nk })
    await db.meta.put({ id: META_ID, workingKey: nk, tmp })
  })
}

export async function saveWorking(rec: FlightRecord): Promise<void> {
  const meta = await getMeta()
  const drone = rec.A_DRONE.split('_')[0] || meta.tmp.DRONE || 'Mavic2Pro'
  let key = meta.workingKey

  // NEW 系: 当初どおりキー付け替え（旧削除＋新登録）
  // NEW → NEW＋日時 / NEW＋旧 → NEW＋新 / NEW＋日時 → NEW
  if (key.startsWith('NEW')) {
    const target = newKeyFromADate(rec.A_DATE)
    if (target !== key) {
      await db.transaction('rw', db.flights, db.meta, async () => {
        await db.flights.delete(key)
        if (await db.flights.get(target)) await db.flights.delete(target)
        const tmp = computeTmp(rec, drone, meta.tmp.TIME)
        tmp.A_SR = rec.A_SR || meta.tmp.A_SR || ''
        tmp.A_SS = rec.A_SS || meta.tmp.A_SS || ''
        tmp.DRONE = drone
        await db.flights.put({ ...rec, key: target })
        await db.meta.put({ id: META_ID, workingKey: target, tmp })
      })
      return
    }
  } else {
    // 本登録（日時キー）: 離陸日時変更時は旧キー残し、新 A_DATE キーを追加（既存同日時は置換）
    const target = String(rec.A_DATE ?? '').trim()
    if (target && parseFlightDate(target) && target !== key) {
      await db.transaction('rw', db.flights, db.meta, async () => {
        if (await db.flights.get(target)) await db.flights.delete(target)
        const tmp = computeTmp(rec, drone, meta.tmp.TIME)
        tmp.A_SR = rec.A_SR || meta.tmp.A_SR || ''
        tmp.A_SS = rec.A_SS || meta.tmp.A_SS || ''
        tmp.DRONE = drone
        await db.flights.put({ ...rec, key: target })
        await db.meta.put({ id: META_ID, workingKey: target, tmp })
      })
      return
    }
  }

  const tmp = computeTmp(rec, drone, meta.tmp.TIME)
  tmp.A_SR = rec.A_SR || meta.tmp.A_SR || ''
  tmp.A_SS = rec.A_SS || meta.tmp.A_SS || ''
  await db.flights.put({ ...rec, key })
  await db.meta.put({ ...meta, workingKey: key, tmp })
}

export async function importLog(log: LogFile): Promise<number> {
  const entries = Object.entries(log)
  await db.transaction('rw', db.flights, db.meta, async () => {
    for (const [key, rec] of entries) {
      await db.flights.put({ ...emptyRecord(), ...rec, key })
    }
    const working =
      entries.map(([k]) => k).find((k) => k.startsWith('NEW')) ||
      entries.sort((a, b) => b[0].localeCompare(a[0]))[0]?.[0]
    if (working) {
      const rec = { ...emptyRecord(), ...log[working] }
      const drone = rec.A_DRONE.split('_')[0] || 'Mavic2Pro'
      // log のみ取込時はセット時刻不明。TIME は空（tmp JSON 取込で別途設定）
      const tmp = computeTmp(rec, drone, '')
      await db.meta.put({ id: META_ID, workingKey: working, tmp })
    }
  })
  return entries.length
}

export async function importPos(pos: PosFile): Promise<number> {
  const names = Object.keys(pos)
  await db.transaction('rw', db.places, async () => {
    for (const [name, p] of Object.entries(pos)) {
      await db.places.put({ ...p, name })
    }
  })
  return names.length
}

export async function exportLog(): Promise<LogFile> {
  const rows = await db.flights.toArray()
  const out: LogFile = {}
  for (const row of rows) {
    const { key, ...rec } = row
    out[key] = rec
  }
  return out
}

export async function exportPos(): Promise<PosFile> {
  const rows = await db.places.toArray()
  const out: PosFile = {}
  for (const row of rows) {
    const { name, ...p } = row
    out[name] = p
  }
  return out
}

export async function exportTmp(): Promise<TmpFlag> {
  return (await getMeta()).tmp
}

/** tmp03.json を取り込み（SR/SS/FLAG 等）。作業キーは TIME から NEW を復元 */
export async function importTmp(tmp: TmpFlag): Promise<void> {
  const meta = await getMeta()
  const time = (tmp.TIME || '').trim()
  const workingKey =
    time && time !== '-1' && time !== '-2' ? `NEW${time}` : meta.workingKey
  const merged: TmpFlag = {
    DATA1: tmp.DATA1 ?? meta.tmp.DATA1,
    DATA2: tmp.DATA2 ?? meta.tmp.DATA2,
    DATA3: tmp.DATA3 ?? meta.tmp.DATA3,
    DATA4: tmp.DATA4 ?? meta.tmp.DATA4,
    DATA5: tmp.DATA5 ?? meta.tmp.DATA5,
    TIME: time || meta.tmp.TIME,
    DRONE: tmp.DRONE || meta.tmp.DRONE,
    A_SR: tmp.A_SR ?? meta.tmp.A_SR,
    A_SS: tmp.A_SS ?? meta.tmp.A_SS,
  }
  await db.meta.put({ id: META_ID, workingKey, tmp: merged })
  const row = await db.flights.get(workingKey)
  if (row) {
    const { key, ...rec } = row
    if (merged.A_SR) rec.A_SR = merged.A_SR
    if (merged.A_SS) rec.A_SS = merged.A_SS
    await db.flights.put({ ...rec, key })
  }
}

export function downloadJson(filename: string, data: unknown): void {
  const text = JSON.stringify(data, null, 4)
  const blob = new Blob([text], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}

/** 場所名一覧（通常の文字列昇順・日本語ロケール） */
export async function listPlaceNames(): Promise<string[]> {
  return (await db.places.toArray())
    .map((p) => p.name)
    .sort((a, b) => a.localeCompare(b, 'ja'))
}

export async function getPlace(name: string): Promise<(PlaceRecord & { name: string }) | undefined> {
  return db.places.get(name)
}

export type PlaceMatch = {
  name: string
  place: PlaceRecord
  dist: number
  altDiff: number
}

/** pos 照合（水平 < POSAC かつ 高度差 < ALTAC）。最短を採用。 */
export async function findNearestPlace(
  lat: number,
  lng: number,
  alt: number,
): Promise<PlaceMatch | null> {
  const places = await db.places.toArray()
  let best: PlaceMatch | null = null
  for (const row of places) {
    const { name, ...place } = row
    const plat = Number(place.DATA1)
    const plng = Number(place.DATA2)
    const palt = Number(place.DATA3)
    const posac = Number(place.POSAC) || 60
    const altac = Number(place.ALTAC) || 10
    if (![plat, plng].every((n) => Number.isFinite(n))) continue
    const dist = haversineM(lat, lng, plat, plng)
    const altDiff = Number.isFinite(palt) ? Math.abs(alt - palt) : Number.POSITIVE_INFINITY
    if (dist < posac && altDiff < altac) {
      if (!best || dist < best.dist) best = { name, place, dist, altDiff }
    }
  }
  return best
}

/** ヒット名から派生（例: 自宅 → 自宅_0）。無ければ stem_0。 */
export async function nextDerivedPlaceName(baseName: string): Promise<string> {
  const stem = baseName.replace(/_\d+$/, '').trim() || '新規'
  const names = await listPlaceNames()
  let max = -1
  const re = new RegExp(`^${escapeRegExp(stem)}_(\\d+)$`)
  for (const n of names) {
    const m = n.match(re)
    if (m) max = Math.max(max, Number(m[1]))
  }
  return `${stem}_${max + 1}`
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 場所マスタへ新規／上書き（現在地座標で登録） */
export async function upsertPlace(
  name: string,
  data: {
    lat: number
    lng: number
    alt: number
    adrs: string
    posac?: string
    altac?: string
  },
): Promise<void> {
  const existing = await db.places.get(name)
  await db.places.put({
    name,
    DATA1: String(data.lat),
    DATA2: String(data.lng),
    DATA3: String(data.alt),
    ADRS: data.adrs || existing?.ADRS || '',
    POSAC: data.posac || existing?.POSAC || '60',
    ALTAC: data.altac || existing?.ALTAC || '10',
  })
}

export async function savePlaceRecord(
  name: string,
  place: PlaceRecord,
): Promise<void> {
  await db.places.put({ name, ...place })
}

export async function deletePlace(name: string): Promise<void> {
  await db.places.delete(name)
}

export async function renamePlace(oldName: string, newName: string): Promise<void> {
  const row = await db.places.get(oldName)
  if (!row) return
  const trimmed = newName.trim()
  if (!trimmed || trimmed === oldName) return
  const { name: _n, ...data } = row
  await db.transaction('rw', db.places, async () => {
    await db.places.delete(oldName)
    await db.places.put({ ...data, name: trimmed })
  })
}

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6378137
  const toR = (d: number) => (d * Math.PI) / 180
  const dLat = toR(lat2 - lat1)
  const dLng = toR(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

/**
 * NEWR 相当: 作業用にプレーン `NEW`（全項目空）を用意する。
 * 既存の NEW / NEW＋日時は置き換え（削除して NEW を追加）。
 */
export async function resetWorking(): Promise<void> {
  const meta = await getMeta()
  const drone = meta.tmp.DRONE || 'Mavic2Pro'
  const rec = emptyRecord()
  const tmp = computeTmp(rec, drone, '')
  tmp.A_SR = ''
  tmp.A_SS = ''
  tmp.DRONE = drone

  await db.transaction('rw', db.flights, db.meta, async () => {
    const keys = (await db.flights.toArray()).map((r) => r.key)
    for (const k of keys) {
      if (k.startsWith('NEW')) await db.flights.delete(k)
    }
    await db.flights.put({ ...rec, key: PLAIN_NEW_KEY })
    await db.meta.put({ id: META_ID, workingKey: PLAIN_NEW_KEY, tmp })
  })
}

/**
 * NEWS / #データセット相当。
 * - 作業中が NEW／NEW＋日時なら **そのキーのまま** 中身にセット反映（日時キー→プレーン NEW へ落とさない）
 * - NEW 系が無ければプレーン NEW を追加して反映
 * - セット自体ではプレーン NEW を日時付きに改名しない
 * - tmp.TIME はセット実行時刻（T タイマー用）
 */
export async function applyWeatherSet(weather: {
  A_WTH: string
  'A_RAIN%': string
  A_WINDD: string
  A_WINDS: string
  A_TEMP: string
  A_SR: string
  A_SS: string
}): Promise<void> {
  const meta = await getMeta()
  const when = formatNow()

  await db.transaction('rw', db.flights, db.meta, async () => {
    const keys = (await db.flights.toArray()).map((r) => r.key)
    const plain = keys.find((k) => k === PLAIN_NEW_KEY)
    const dated = keys.filter((k) => isDatedNewKey(k))
    // 作業中が NEW 系ならそれを更新。無ければプレーン NEW → いずれかの日時付き → 新規
    const key =
      meta.workingKey.startsWith('NEW') && keys.includes(meta.workingKey)
        ? meta.workingKey
        : plain ?? dated[0] ?? PLAIN_NEW_KEY

    let rec = emptyRecord()
    const row = await db.flights.get(key)
    if (row) {
      const { key: _k, ...rest } = row
      rec = rest
    }

    rec.A_WTH = weather.A_WTH
    rec['A_RAIN%'] = weather['A_RAIN%']
    rec.A_WINDD = weather.A_WINDD
    rec.A_WINDS = weather.A_WINDS
    rec.A_TEMP = weather.A_TEMP
    rec.A_SR = weather.A_SR
    rec.A_SS = weather.A_SS

    const drone = rec.A_DRONE.split('_')[0] || meta.tmp.DRONE || 'Mavic2Pro'
    const tmp = computeTmp(rec, drone, when)
    tmp.A_SR = rec.A_SR
    tmp.A_SS = rec.A_SS
    tmp.DRONE = drone

    await db.flights.put({ ...rec, key })
    await db.meta.put({ id: META_ID, workingKey: key, tmp })
  })
}

export async function commitWorking(): Promise<string | null> {
  const meta = await getMeta()
  const { key, rec } = await getWorking()
  if (!rec.A_DATE) return null
  const newKey = rec.A_DATE
  const committed = { ...rec }
  await db.flights.put({ ...committed, key: newKey })
  // NEW 側はバッテリー・離着陸まわりをクリア（仕様の NEWM 相当・簡易）
  const next = emptyRecord()
  Object.assign(next, committed)
  const clearKeys: (keyof FlightRecord)[] = [
    'A_PBAT%',
    'A_BATN',
    'A_BAT%',
    'A_BATB',
    'A_BATV',
    'A_BATT',
    'A_DATE',
    'B_DATE',
    'A_DATA1',
    'A_DATA2',
    'A_DATA3',
    'A_ADRS',
    'A_POS',
    'B_DATA1',
    'B_DATA2',
    'B_DATA3',
    'B_ADRS',
    'B_POS',
    'B_BAT%',
    'B_BATB',
    'B_BATV',
    'B_BATT',
    'B_PBAT%',
  ]
  for (const k of clearKeys) next[k] = ''
  const nextKey = PLAIN_NEW_KEY
  await db.flights.put({ ...next, key: nextKey })
  if (key.startsWith('NEW') && key !== newKey) {
    await db.flights.delete(key)
  }
  const drone = next.A_DRONE.split('_')[0] || 'Mavic2Pro'
  const tmp = computeTmp(next, drone, meta.tmp.TIME)
  tmp.DRONE = drone
  await db.meta.put({ id: META_ID, workingKey: nextKey, tmp })
  return newKey
}

export function getCurrentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('位置情報が使えません'))
      return
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 20000,
      maximumAge: 0,
    })
  })
}
