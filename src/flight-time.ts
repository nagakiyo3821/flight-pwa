/**
 * 離陸日時(A_DATE)・着陸日時(B_DATE)・飛行時間(HH:mm) の3値同期。
 * 出典: ショートカット19 IF文(38)(39)(40)
 *
 * - 飛行時間は JSON 専用キーなし。作業用キャッシュ＋ A/B の差で扱う
 * - A 更新かつ飛行時間あり → B = A + 飛行時間
 * - B 更新かつ飛行時間あり → A = B − 飛行時間
 * - 飛行時間なしで A/B 両方あり → 差から飛行時間を算出（A>B なら揃えて 0）
 * - 飛行時間更新 → A ありなら B=A+τ、否则 B ありなら A=B−τ
 */

export type FlightDateParts = { y: number; mo: number; d: number; h: number; mi: number }

/** セッション内の飛行時間 HH:mm（Shortcuts の TIME 変数相当） */
let cachedFlightHm: string | null = null

export function getCachedFlightHm(): string | null {
  return cachedFlightHm
}

export function setCachedFlightHm(hm: string | null): void {
  cachedFlightHm = hm
}

/** レコードの A/B からキャッシュを初期化（両方有効なとき） */
export function hydrateFlightDurationCache(aDate: string, bDate: string): void {
  const mins = diffMinutes(aDate, bDate)
  if (mins != null && mins >= 0) cachedFlightHm = formatFlightHm(mins)
}

export function parseFlightDate(raw: string): Date | null {
  const s = raw.trim().replace(/-/g, '/')
  const m = s.match(
    /^(\d{4})\/(\d{1,2})\/(\d{1,2})(?:\s+|T)(\d{1,2}):(\d{2})(?::\d{2})?$/,
  )
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  const h = Number(m[4])
  const mi = Number(m[5])
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null
  const dt = new Date(y, mo - 1, d, h, mi, 0, 0)
  if (
    dt.getFullYear() !== y ||
    dt.getMonth() !== mo - 1 ||
    dt.getDate() !== d ||
    dt.getHours() !== h ||
    dt.getMinutes() !== mi
  ) {
    return null
  }
  return dt
}

export function formatFlightDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export function formatYmd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())}`
}

export function formatHmFromDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}`
}

/** 分 → HH:mm（24h超も可: 90分 → 01:30） */
export function formatFlightHm(totalMinutes: number): string {
  const m = Math.max(0, Math.round(totalMinutes))
  const h = Math.floor(m / 60)
  const mm = m % 60
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

/** HH:mm / H:mm / 分の数字 → 分。不正は null */
export function parseFlightHm(raw: string): number | null {
  const s = raw.trim()
  if (!s) return null
  if (/^\d+$/.test(s)) {
    const n = Number(s)
    return Number.isFinite(n) && n >= 0 ? n : null
  }
  const m = s.match(/^(\d{1,3}):(\d{2})$/)
  if (!m) return null
  const h = Number(m[1])
  const mi = Number(m[2])
  if (!Number.isFinite(h) || mi > 59) return null
  return h * 60 + mi
}

export function diffMinutes(aRaw: string, bRaw: string): number | null {
  const a = parseFlightDate(aRaw)
  const b = parseFlightDate(bRaw)
  if (!a || !b) return null
  return Math.round((b.getTime() - a.getTime()) / 60000)
}

export function addMinutesToDate(raw: string, minutes: number): string | null {
  const d = parseFlightDate(raw)
  if (!d) return null
  d.setMinutes(d.getMinutes() + minutes)
  return formatFlightDate(d)
}

/** 月日文字列 + 時刻 → yyyy/mm/dd HH:mm */
export function combineYmdAndHm(ymdRaw: string, hmRaw: string): string | null {
  const ymd = ymdRaw.trim().replace(/-/g, '/')
  const ym = ymd.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/)
  if (!ym) return null
  const hm = hmRaw.trim()
  const tm = hm.match(/^(\d{1,2}):(\d{2})$/)
  if (!tm) return null
  return parseFlightDate(
    `${ym[1]}/${ym[2]}/${ym[3]} ${tm[1]}:${tm[2]}`,
  )
    ? formatFlightDate(parseFlightDate(`${ym[1]}/${ym[2]}/${ym[3]} ${tm[1]}:${tm[2]}`)!)
    : null
}

export type SyncResult = {
  A_DATE: string
  B_DATE: string
  flightHm: string
}

/**
 * 離陸日時を確定したあとの同期。
 * TIME(飛行時間)あり → B = A+TIME
 * なしで B あり → TIME = B−A（負なら A=B, TIME=0）
 */
export function syncAfterTakeoffDate(aDate: string, bDate: string): SyncResult {
  let a = aDate
  let b = bDate
  if (cachedFlightHm != null) {
    const mins = parseFlightHm(cachedFlightHm)
    if (mins != null) {
      const nb = addMinutesToDate(a, mins)
      if (nb) b = nb
      return { A_DATE: a, B_DATE: b, flightHm: formatFlightHm(mins) }
    }
  }
  if (b.trim()) {
    let mins = diffMinutes(a, b)
    if (mins == null) {
      return { A_DATE: a, B_DATE: b, flightHm: cachedFlightHm || '00:00' }
    }
    if (mins < 0) {
      a = b
      mins = 0
    }
    cachedFlightHm = formatFlightHm(mins)
    return { A_DATE: a, B_DATE: b, flightHm: cachedFlightHm }
  }
  return { A_DATE: a, B_DATE: b, flightHm: cachedFlightHm || '00:00' }
}

/**
 * 着陸日時を確定したあとの同期。
 * TIME あり → A = B−TIME
 * なしで A あり → TIME = B−A（負なら B=A, TIME=0）
 */
export function syncAfterLandingDate(aDate: string, bDate: string): SyncResult {
  let a = aDate
  let b = bDate
  if (cachedFlightHm != null) {
    const mins = parseFlightHm(cachedFlightHm)
    if (mins != null) {
      const na = addMinutesToDate(b, -mins)
      if (na) a = na
      return { A_DATE: a, B_DATE: b, flightHm: formatFlightHm(mins) }
    }
  }
  if (a.trim()) {
    let mins = diffMinutes(a, b)
    if (mins == null) {
      return { A_DATE: a, B_DATE: b, flightHm: cachedFlightHm || '00:00' }
    }
    if (mins < 0) {
      b = a
      mins = 0
    }
    cachedFlightHm = formatFlightHm(mins)
    return { A_DATE: a, B_DATE: b, flightHm: cachedFlightHm }
  }
  return { A_DATE: a, B_DATE: b, flightHm: cachedFlightHm || '00:00' }
}

/**
 * 飛行時間を確定したあとの同期。
 * A あり → B = A+τ / A なし B あり → A = B−τ
 * 両方未設定は呼び出し側で拒否。
 */
export function syncAfterFlightDuration(
  aDate: string,
  bDate: string,
  hm: string,
): SyncResult | { error: string } {
  const mins = parseFlightHm(hm)
  if (mins == null) return { error: '飛行時間は HH:mm（または分）で入力してください' }
  cachedFlightHm = formatFlightHm(mins)
  if (aDate.trim()) {
    const nb = addMinutesToDate(aDate, mins)
    if (!nb) return { error: '離陸日時が不正です' }
    return { A_DATE: aDate, B_DATE: nb, flightHm: cachedFlightHm }
  }
  if (bDate.trim()) {
    const na = addMinutesToDate(bDate, -mins)
    if (!na) return { error: '着陸日時が不正です' }
    return { A_DATE: na, B_DATE: bDate, flightHm: cachedFlightHm }
  }
  return { error: '離陸日時または着陸日時が必要です' }
}

/** 表示用。両方あるとき HH:mm、なければキャッシュまたは空 */
export function displayFlightHm(aDate: string, bDate: string): string {
  const mins = diffMinutes(aDate, bDate)
  if (mins != null && mins >= 0) return formatFlightHm(mins)
  return cachedFlightHm || ''
}
