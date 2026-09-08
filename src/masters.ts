/**
 * ショートカット埋め込みマスタ（リスト／氏名／機種）
 * 出典: iPhoneショートカット説明書.xlsx ショートカット19
 */

export const OK2 = ['正常', '異常'] as const

export const NAMES = ['長沼 清美', '山田 太郎'] as const
export const NAME_CUSTOM = '任意の氏名の入力'

export const FLT1 = [
  '空撮',
  '報道取材',
  '警備',
  '農林水産',
  '測量',
  '環境調査',
  '設備メンテ',
  '点検保守',
  '資材管理',
  '輸送宅配',
  '自然観測',
  '事故災害',
  '趣味',
  '研究開発',
  '飛行練習',
] as const

/** 複数選択可。保存時は + 連結 */
export const FLT2 = [
  '非特定飛行',
  '屋内',
  '空港周辺',
  '高度150m以上',
  'DID上空',
  '夜間',
  '目視外',
  '物件30ｍ未満',
  'イベント上空',
  '危険物',
  '物件落下',
] as const

export const OBST = [
  'なし',
  '水面',
  '山地崖',
  '谷間崖',
  '森林',
  '住宅',
  'ビル',
  '鉄塔',
  '電柱',
  '電線',
  '樹木',
  '道路',
  '線路',
  'ガード',
  '風車',
  '橋',
  '自動車',
  '人',
  '壁',
  '天井',
] as const

export const ELEMAG = [
  'なし',
  'アンテナ電波塔',
  '電波機器',
  '高圧電線',
  '鉄道',
  '鉄骨鉄板',
] as const

export const THIRD = ['なし', 'あり'] as const

export const WIND = ['北', '北東', '東', '南東', '南', '南西', '西', '北西'] as const

export const MODE = ['1', '2', '3', '4'] as const

export const FAILS = ['RTH', '着陸', 'ホバリング'] as const

/** 実データ頻出。Excel 項目22はテキスト入力だが候補として提示 */
export const BATN = ['No1', 'No2', 'No3', 'No4'] as const
export const BATN_CUSTOM = '任意のバッテリー番号の入力'

export const PLACE_CUSTOM = '任意の場所名の入力'

export { DRONE_TYPES, DRONE_IDS, DRONE_ID_CUSTOM, isDroneType } from './drone-master'
export type { DroneType } from './drone-master'
