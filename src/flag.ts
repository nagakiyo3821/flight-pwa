import type { FlightRecord, TmpFlag } from './types'
import { FIELDS, filled } from './fields'
import { getHiddenKeys, isCatalogReady } from './catalog'

/** 屋内飛行時は GNSS・地上風向を必須から外す（従来どおり） */
const PRE_OPTIONAL_INDOOR = new Set(['A_GNSS', 'A_WINDD'])

function isIndoor(flt2: string): boolean {
  return flt2.includes('屋内')
}

function hiddenFor(drone: string): Set<string> {
  if (!isCatalogReady()) return new Set()
  return new Set(getHiddenKeys(drone))
}

/**
 * 離陸前チェック（NEWA 1〜37）の必須キー。
 * #?項目／一覧の空欄判定と同じ範囲（skipEmptyCheck・機種 hidden 除外）。
 */
function preRequiredKeys(
  indoor: boolean,
  hidden: Set<string>,
): string[] {
  return FIELDS.filter((f) => {
    if (f.no < 1 || f.no > 37) return false
    if (!f.key || f.skipEmptyCheck) return false
    if (hidden.has(f.key)) return false
    if (indoor && PRE_OPTIONAL_INDOOR.has(f.key)) return false
    return true
  }).map((f) => f.key!)
}

function requiredFilled(
  rec: FlightRecord,
  keys: readonly string[],
): boolean {
  return keys.every((k) => filled(rec[k as keyof FlightRecord]))
}

/** FLAG 再計算。TIME はセット実行時刻（呼び出し側が渡す）。A_DATE やキーから入れない */
export function computeTmp(
  rec: FlightRecord,
  drone: string,
  setTime = '',
): TmpFlag {
  const type = drone || (rec.A_DRONE.split('_')[0] ?? 'Mavic2Pro')
  const hidden = hiddenFor(type)
  const indoor = isIndoor(rec.A_FLT2 || '')
  const preOk = requiredFilled(rec, preRequiredKeys(indoor, hidden))
  const takeoffOk = filled(rec.A_DATE) && filled(rec.A_POS)
  const landingOk = filled(rec.B_DATE) && filled(rec.B_POS)
  const postOk = requiredFilled(
    rec,
    ['B_BATB', 'B_PBAT%', 'B_PROP'].filter((k) => !hidden.has(k)),
  )

  let DATA1 = '0'
  let DATA2 = '0'
  let DATA3 = '0'
  let DATA4 = '0'
  let DATA5 = '0'

  if (!preOk) {
    DATA1 = '2'
  } else if (!takeoffOk) {
    DATA1 = '1'
    DATA2 = '2'
  } else if (!landingOk) {
    DATA1 = '1'
    DATA2 = '1'
    DATA3 = '2'
  } else if (!postOk) {
    DATA1 = '0'
    DATA2 = '1'
    DATA3 = '1'
    DATA4 = '2'
  } else {
    DATA1 = '0'
    DATA2 = '1'
    DATA3 = '1'
    DATA4 = '1'
    DATA5 = '2'
  }

  return {
    DATA1,
    DATA2,
    DATA3,
    DATA4,
    DATA5,
    TIME: setTime,
    DRONE: type,
    A_SR: rec.A_SR || '',
    A_SS: rec.A_SS || '',
  }
}

export function menuLabel(
  kind: 1 | 2 | 3 | 4 | 5,
  flag: string,
): string {
  const f = flag || '0'
  if (kind === 2 || kind === 3) {
    if (f === '2') return '時間場所設定'
    if (f === '1') return '場所のみ更新'
    return 'ロック中'
  }
  if (f === '2') return '設定待ち'
  if (f === '1') return '修正可能'
  return 'ロック中'
}

export function canOpen(flag: string): boolean {
  return flag === '1' || flag === '2'
}

export function formatNow(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** 秒付き（同一分内のキー衝突回避） */
export function formatNowSeconds(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

export function newWorkingKey(time = formatNow()): string {
  return `NEW${time}`
}
