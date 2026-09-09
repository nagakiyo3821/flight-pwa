/** 現行ショートカット互換の型（値はすべて文字列） */

export type FlagLevel = '0' | '1' | '2' // ロック / 修正可能 / 設定待ち

export interface TmpFlag {
  DATA1: string
  DATA2: string
  DATA3: string
  DATA4: string
  DATA5: string
  TIME: string
  DRONE: string
  A_SR: string
  A_SS: string
}

export interface FlightRecord {
  A_ADRS: string
  A_ATTA: string
  'A_BAT%': string
  A_BATB: string
  A_BATN: string
  A_BATT: string
  A_BATV: string
  A_CAM: string
  A_CARRY: string
  A_DATA1: string
  A_DATA2: string
  A_DATA3: string
  A_DATE: string
  A_DRONE: string
  A_ELEMAG: string
  A_ERR: string
  A_FAILS: string
  A_FLT1: string
  A_FLT2: string
  A_FRAME: string
  A_GNSS: string
  A_HELTH: string
  A_LIGHT: string
  A_MAXD: string
  A_MAXH: string
  A_MODE: string
  A_NAME1: string
  A_NAME2: string
  A_NOISE: string
  A_OBST: string
  'A_PBAT%': string
  A_PERR: string
  A_POS: string
  A_PROP: string
  'A_RAIN%': string
  A_REMID: string
  A_RTHH: string
  A_SR: string
  A_SS: string
  A_STICK: string
  A_TEMP: string
  A_THIRD: string
  A_WINDD: string
  A_WINDS: string
  A_WTH: string
  B_ADRS: string
  B_ATTA: string
  'B_BAT%': string
  B_BATB: string
  B_BATT: string
  B_BATV: string
  B_DATA1: string
  B_DATA2: string
  B_DATA3: string
  B_DATE: string
  B_DIRT: string
  B_FEVER: string
  B_FRAME: string
  'B_PBAT%': string
  B_POS: string
  B_PROP: string
  REMARK: string
}

export type LogFile = Record<string, FlightRecord>

export interface PlaceRecord {
  DATA1: string
  DATA2: string
  DATA3: string
  ADRS: string
  POSAC: string
  ALTAC: string
}

export type PosFile = Record<string, PlaceRecord>

export type FieldKey = keyof FlightRecord

export type OptionsKey =
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

export type CustomLabelKey = 'nameCustom' | 'batnCustom' | 'placeCustom'

export interface FieldDef {
  no: number
  key: FieldKey | null
  label: string
  group: 'pre' | 'ops' | 'takeoff' | 'post' | 'meta'
  /** choice2=正常/異常など2択, text=記述, number=数値記述, select=候補選択, readonly=表示のみ, datetime=離着陸日時, time=時分, flightDuration=飛行時間HH:mm */
  input: 'choice2' | 'text' | 'number' | 'select' | 'readonly' | 'datetime' | 'time' | 'flightDuration'
  /** カタログ lists のキー（実行時に getList で解決） */
  optionsKey?: OptionsKey
  /** 旧: 直書き options（places 動的などは呼び出し側で上書き） */
  options?: string[]
  /** 飛行条件など複数選択（+ 連結） */
  multi?: boolean
  /** リスト末尾に任意入力を付ける */
  allowCustom?: boolean
  customLabel?: string
  customLabelKey?: CustomLabelKey
  /** true なら #?項目の空欄判定対象外（REMARK など任意メモ） */
  skipEmptyCheck?: boolean
}
