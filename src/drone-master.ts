/**
 * ショートカット埋め込みマスタ「辞書01(機種DRONE)」相当
 * 出典: iPhoneショートカット説明書.xlsx ショートカット19
 */
export const DRONE_TYPES = ['Mavic2Pro', 'Tello', 'Other'] as const

export type DroneType = (typeof DRONE_TYPES)[number]

export const DRONE_IDS: Record<DroneType, string[]> = {
  Mavic2Pro: ['JU322647FF', 'Juxxxxxxxx'],
  Tello: ['001', '002'],
  Other: ['AAA', 'BBB'],
}

/** リスト末尾の任意入力（テキスト159） */
export const DRONE_ID_CUSTOM = '任意の機体識別番号の入力'

export function isDroneType(s: string): s is DroneType {
  return (DRONE_TYPES as readonly string[]).includes(s)
}
