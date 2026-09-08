import type { FlightRecord, TmpFlag } from './types'
import { filled } from './fields'

const PRE_KEYS_OUTDOOR = [
  'A_DRONE',
  'A_CARRY',
  'A_FLT2',
  'A_THIRD',
  'A_WINDD',
  'A_ATTA',
  'A_PERR',
  'A_BATN',
  'A_BATV',
  'A_GNSS',
  'A_MAXH',
  'A_LIGHT',
  'A_STICK',
] as const

const PRE_KEYS_INDOOR = PRE_KEYS_OUTDOOR.filter((k) => k !== 'A_GNSS' && k !== 'A_WINDD')

function isIndoor(flt2: string): boolean {
  return flt2.includes('屋内')
}

function allFilled(rec: FlightRecord, keys: readonly string[]): boolean {
  return keys.every((k) => filled(rec[k as keyof FlightRecord]))
}

/** FLAG 再計算。TIME はセット実行時刻（呼び出し側が渡す）。A_DATE やキーから入れない */
export function computeTmp(
  rec: FlightRecord,
  drone: string,
  setTime = '',
): TmpFlag {
  const indoor = isIndoor(rec.A_FLT2 || '')
  const preOk = allFilled(rec, indoor ? PRE_KEYS_INDOOR : PRE_KEYS_OUTDOOR)
  const takeoffOk = filled(rec.A_DATE) && filled(rec.A_POS)
  const landingOk = filled(rec.B_DATE) && filled(rec.B_POS)
  const postOk =
    filled(rec.B_BATB) && filled(rec['B_PBAT%']) && filled(rec.B_PROP)

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
    DRONE: drone || (rec.A_DRONE.split('_')[0] ?? 'Mavic2Pro'),
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
