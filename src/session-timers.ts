/**
 * セット／リセット用タイマー（ショートカット互換）
 * - T = tmp.TIME（セット日時）からの経過秒。セット実行で実質ゼロ
 * - セット期限: 2 時間超 → 気象の再セット要求
 * - リセット期限: 24 時間超 → データリセット要求
 */
import { parseFlightDate } from './flight-time'

/** 気象セットの有効時間（時間） */
export const SET_TIMER_HOURS = 2
/** NEW 日時超過でリセット要求（時間） */
export const RESET_TIMER_HOURS = 24

export type TimerNeed = 'ok' | 'need_set' | 'need_reset' | 'no_time'

export function parseSetTime(timeRaw: string | undefined | null): Date | null {
  const s = String(timeRaw ?? '').trim()
  if (!s || s === '-1' || s === '-2') return null
  return parseFlightDate(s)
}

/** セット日時からの経過秒。不明時は null */
export function elapsedSecondsSinceSet(timeRaw: string | undefined | null): number | null {
  const d = parseSetTime(timeRaw)
  if (!d) return null
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000))
}

export function evaluateTimers(timeRaw: string | undefined | null): TimerNeed {
  const sec = elapsedSecondsSinceSet(timeRaw)
  if (sec == null) return 'no_time'
  if (sec >= RESET_TIMER_HOURS * 3600) return 'need_reset'
  if (sec >= SET_TIMER_HOURS * 3600) return 'need_set'
  return 'ok'
}
