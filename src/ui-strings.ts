/**
 * ショートカット（ver03）画面文言の正本寄せ。
 * 出典: iPhoneショートカット説明書.xlsx「ショートカット19」
 * 以後、独自文言を増やさずここに揃える。
 */

export const VER = '03'

/** 飛行記録03 メイン：リストからの選択プロンプト */
export const MENU_PROMPT = `項目を選択してください。（ver${VER}）`

/** 登録データ管理 NEWA（動作説明＋実機指摘） */
export const CMD_BACK = '#戻る'
export const CMD_DATASET = '#データセット'
export const CMD_ALL = '#全項目'
export const CMD_EMPTY = '#?項目'
export const CMD_DELETE = '#データ削除'
export const CMD_COMMIT = '#データ登録'
export const CMD_RESET = '#データリセット'
export const CMD_TAKEOFF = '#離陸'
export const CMD_LANDING = '#着陸'

/** 登録データ管理 直接起動（レコード一覧） */
export const REC_MENU_BACK = '%戻る'
export const REC_JSON_IO = '%JSON入出力'

export const REC_DEL_PROMPT = '本当にこのデータを削除しますか？'
export const REC_DEL_OK = '1.削除'
export const REC_DEL_BACK = '2.戻る'
/** 項目入力ダイアログの確定／中断 */
export const ITEM_OK = '確定'
export const ITEM_BACK = '戻る'

/** ショートカット19 数値サブ処理と同じ（空は未入力として別扱い） */
export const NUMBER_RE = /^[+-]?([1-9]\d*|0)(\.\d+)?$/

export function isValidNumberInput(value: string): boolean {
  const v = value.trim()
  return v === '' || NUMBER_RE.test(v)
}

/** データ表示はショートカットどおり (値)。空は (?) */
export function parenData(value: string | undefined | null): string {
  const v = String(value ?? '').trim()
  return `(${v || '?'})`
}

/**
 * 項目 1〜63 の説明文（ショートカット19）。
 * 末尾に現在値 `(…)` を fieldPrompt 側で付与する。
 * 43/44・48/49 は仕様どおり JSON（DATA1=緯度・DATA2=経度）に合わせた文言。
 */
const FIELD_PROMPT_BODY: Record<number, string> = {
  1: '環境条件:\n・機種名と機体識別番号を確認',
  2: '環境条件:\n・操縦者の氏名を選択',
  3: '環境条件:\n・操縦者の体調を確認',
  4: '環境条件:\n・許可証、飛行日誌の携帯を確認',
  5: '環境条件:\n・安全運航管理者の氏名を選択',
  6: '環境条件:\n・飛行目的を確認',
  7: '環境条件:\n・飛行条件を選択(複数選択可)',
  8: '環境条件:\n・飛行空域の主な物理的障害物を確認',
  9: '環境条件:\n・飛行空域の主な電磁気障害物を確認',
  10: '環境条件:\n・飛行空域の第３者の存在確認',
  11: '環境条件:\n・飛行空域の天候を確認',
  12: '環境条件:\n・飛行空域の降水確率を確認',
  13: '環境条件:\n・飛行空域の地上風向を確認',
  14: '環境条件:\n・飛行空域の地上風速を確認',
  15: '環境条件:\n・飛行空域の地上気温を確認',
  16: '作動前点検:\n・各機器の取り付け状態を確認\n・機体識別番号\n・各部のネジ\n・モーター\n・プロペラ\n・プロペラガード\n・灯火\n・カメラ',
  17: '作動前点検:\n・1枚毎プロペラの損傷や歪みを確認',
  18: '作動前点検:\n・フレームの傷や歪みを確認',
  19: '作動前点検:\n・操縦装置外観、アンテナ、ケーブル、コネクタ確認、スティック、スイッチの動作確認\n・.操縦装置バッテリーLED確認\n・.操縦装置電源オン●\n・スティックエラー等が発生してないか？',
  20: '作動前点検:\n・操縦装置バッテリー量を確認',
  21: '作動前、作動点検:\n・機体バッテリーLED確認\n・機体バッテリー膨張、発熱確認\n・機体バッテリー取付確認\n・機体電源オン●\n・コンパスキャリブレーションエラー等が発生してないか？',
  22: '作動点検:\n・機体バッテリー番号を確認',
  23: '作動点検:\n・機体バッテリー量を確認\n・50%以上、100%以下',
  24: '作動点検:\n・機体バッテリーバランスを確認\n・各セル電圧差が0.05V未満',
  25: '作動点検:\n・機体バッテリー電圧を確認\n・14.5V以上、17.0V以下',
  26: '作動点検:\n・機体バッテリー温度を確認\n・15.0℃以上、55..0℃以下',
  27: '作動点検:\n・リモートID動作状態を確認\n・免除されている場合は正常とする',
  28: '作動点検:\n・現在のGNSS捕捉数を確認\n・最低10基あればPモード可\n・屋内の場合は0基で可',
  29: '作動点検:\n・操縦モード設定を確認\nMODE',
  30: '作動点検:\n・RTH高度設定を確認\n・周囲最も高い障害物+20~30m\n・20m～150m',
  31: '作動点検:\n・最大高度設定を確認\n・離陸地上高度基準20~150m\n・ビル屋上等は補正要',
  32: '作動点検:\n・最大距離設定を確認\n・20m～500m、無効化は0mを設定',
  33: '作動点検:\n・フェールセーフ設定を確認\n　屋外の場合(RTH)\n　屋内の場合(ホバリング)',
  34: '作動点検:\n・前方灯火が赤の●点灯\n・後方灯火が緑の●点滅(Pモード)\n・後方灯火が黄の●点滅(Aモード)',
  35: '作動点検:\n・指先等カメラで撮影し画像確認',
  36: '飛行点検:\n起動後、\n・スロットルスティック動作で発動機やモーター異音を確認',
  37: '飛行点検:\n離陸後、\n・すべてのスティック動作確認\n・カメラのチルト動作確認\nその後、着陸',
  38: '時間管理:\n・離陸月日を確認\n・離陸時間を確認',
  39: '時間管理:\n・着陸月日を確認\n・着陸時間を確認',
  40: '時間管理:\n・飛行時間を確認',
  41: '時間管理:\n・日の出時間を確認',
  42: '時間管理:\n・日の入時間を確認',
  43: '離陸地点情報:\n・離陸地点の経度を確認',
  44: '離陸地点情報:\n・離陸地点の緯度を確認',
  45: '離陸地点情報:\n・離陸地点の高度を確認',
  46: '離陸地点情報:\n・離陸地点の住所を確認',
  47: '離陸地点情報:\n・離陸地点の場所を確認',
  48: '着陸地点情報:\n・着陸地点の経度を確認',
  49: '着陸地点情報:\n・着陸地点の緯度を確認',
  50: '着陸地点情報:\n・着陸地点の高度を確認',
  51: '着陸地点情報:\n・着陸地点の住所を確認',
  52: '着陸地点情報:\n・着陸地点の場所を確認',
  53: '飛行後点検:\n・機体バッテリー量を確認\n・50%以上、100%以下',
  54: '飛行後点検:\n・機体バッテリーバランスを確認\n・各セル電圧差が0.05V未満',
  55: '飛行後点検:\n・機体バッテリー電圧を確認\n・14.5V以上、17.0V以下',
  56: '飛行後点検:\n・機体バッテリー温度を確認\n・15.0℃以上、55..0℃以下\n・確認後、機体電源オフ●:',
  57: '飛行後点検:\n・操縦装置バッテリー残容量を確認\n・確認後、操縦装置電源オフ●',
  58: '飛行後点検:\n・各機器の取り付け状態を確認\n・機体識別番号\n・各部のネジ\n・モーター\n・プロペラ\n・プロペラガード\n・灯火\n・カメラ',
  59: '飛行後点検:\n・機体ゴミ、汚れ等付着を確認',
  60: '飛行後点検:\n・1枚毎プロペラの損傷や歪みを確認',
  61: '飛行後点検:\n・フレームの傷や歪みを確認',
  62: '飛行後点検:\n・各機器からの異常な発熱を確認\n・機体本体\n・機体モーター\n・機体バッテリー\n・操縦装置\n・スマートフォン等',
  63: 'その他:\n飛行の安全に影響のあった状況を20文字以内で簡素にまとめる\n・事故\n・重大インシデント\n・エラー発生等',
}

/** 項目入力ダイアログのタイトル（カテゴリ見出し＋現在値） */
export function fieldPromptText(
  no: number,
  current: string,
  fallbackLabel?: string,
  currentDisplay?: string,
): string {
  const shown = currentDisplay ?? parenData(current)
  const body = FIELD_PROMPT_BODY[no]
  if (body) return `${body}\n${shown}`
  return `${no}.${fallbackLabel ?? ''}\n${shown}`
}

/** 項目1 機種選択プロンプト（ショートカット19 テキスト158 系） */
export function droneTypePrompt(current: string): string {
  return `環境条件:\n・機種名と機体識別番号を確認\n${parenData(current)}\n・機種名を選択`
}

/** 項目1 識別番号選択プロンプト（テキスト160 系） */
export function droneIdPrompt(current: string, typeName: string): string {
  return `環境条件:\n・機種名と機体識別番号を確認\n${parenData(current)}\n・機種名を選択\n${parenData(typeName)}\n・機体識別番号を選択`
}

/** 項目1 識別番号の任意入力プロンプト（テキスト161 系） */
export function droneIdInputPrompt(current: string, typeName: string): string {
  return `環境条件:\n・機種名と機体識別番号を確認\n${parenData(current)}\n・機種名を選択\n${parenData(typeName)}\n・機体識別番号を入力`
}

/** NEWA タイトル（ユーザー実機: 飛行点検／ver+機種連結） */
export function newaPrompt(drone: string): string {
  return `更新したい飛行点検を選択してください。（ver${VER}${drone}）`
}

/** NEWB タイトル（ショートカット19） */
export function newbPrompt(drone: string): string {
  return `更新したい飛行後点検を選択してください。（ver${VER}${drone}）`
}

/** 登録データ管理 直接起動（FREE）タイトル */
export function freePrompt(drone: string): string {
  return `更新したい項目1~63を選択してください。(ver${VER}${drone})`
}

export function targetDataLine(sel: string): string {
  // 動作説明: NEW / NEWyyyy/mm/dd hh:mm / yyyy/mm/dd hh:mm
  return `対象データ:${sel}`
}

/** 6.データリセット確認（飛行記録03・リストからの選択） */
export const RESET_PROMPT =
  '記録中のデータをリセットし、現在地の気象データをセットしますか？'
export const RESET_OK = '1.リセット'
export const RESET_BACK = '2.戻る'

/** #データセット確認（登録データ管理・リストからの選択） */
export const SET_PROMPT = '本当に現在地の気象データをセットしますか？'
export const SET_OK = '1.セット'
export const SET_BACK = '2.戻る'

/** セット／リセット期限切れ（メニュー起動時） */
export const TIMER_SET_PROMPT =
  'セットから2時間以上経過しました。気象データをセットし直してください。'
export const TIMER_SET_OK = '1.セット'
export const TIMER_SET_LATER = '2.後で'
export const TIMER_RESET_PROMPT =
  'セットから24時間以上経過しました。データをリセットして気象をセットし直してください。'
export const TIMER_RESET_OK = '1.リセットしてセット'
export const TIMER_RESET_LATER = '2.後で'

/** 5.データ登録確認（飛行記録03・リストからの選択） */
export const COMMIT_PROMPT =
  'データ登録すると一部データがリセットされ、離陸前チェックに戻ります。'
export const COMMIT_OK = '1.データ登録'
export const COMMIT_BACK = '2.戻る'

/** GPS 未定値の手入力（必要な項目だけ） */
export const GPS_LABEL_LAT = '緯度'
export const GPS_LABEL_LNG = '経度'
export const GPS_LABEL_ALT = '高度'

export function gpsMissingPrompt(
  need: { lat: boolean; lng: boolean; alt: boolean },
  opts?: { lowAccuracy?: boolean; pcManual?: boolean },
): string {
  const labels: string[] = []
  if (need.lat) labels.push(GPS_LABEL_LAT)
  if (need.lng) labels.push(GPS_LABEL_LNG)
  if (need.alt) labels.push(GPS_LABEL_ALT)
  const list = labels.join('・')
  if (opts?.pcManual) {
    return (
      `PCでは位置情報の精度が期待できないため、手動入力します。\n` +
      `マップをタップするか、${list}を入力してください（マップと数値は連動します）。`
    )
  }
  if (opts?.lowAccuracy) {
    return (
      `位置の精度が低いため確認が必要です。\n` +
      `（PCでは回線・Wi‑Fiの概算位置になることがあります）\n` +
      `${list}を確認・入力してください。`
    )
  }
  if (need.lat && need.lng && need.alt) {
    return `位置情報が取得できません。\n${list}を入力してください。`
  }
  return `${list}が取得できません。\n${list}を入力してください。`
}

/** 離着陸・場所 CMD6 相当 */
export const MAP_DONE = '完了'
export const MAP_PROMPT = '現在地を確認してください。'

export const PLACE_CHOICE_SKIP = '1.登録しない'
export const PLACE_CHOICE_HIT = '2.検索結果の場所名で登録'
export const PLACE_CHOICE_NEW = '3.新規生成の場所名で登録'
export const PLACE_CHOICE_LIST = '4.場所リストから選択登録'

/** 新規／編集の場所名入力（ショートカット「1.場所」と同じ） */
export const PLACE_NAME_PROMPT = '場所情報の登録、修正 ・20文字以内、空白不可'

export const TAKEOFF_UPDATE_PROMPT = '本当に離陸地点を更新しますか？'
export const TAKEOFF_UPDATE_OK = '1.離陸地点更新'
export const LANDING_UPDATE_PROMPT = '本当に着陸地点を更新しますか？'
export const LANDING_UPDATE_OK = '1.着陸地点更新'
export const PLACE_UPDATE_BACK = '2.戻る'

export function parenOrQ(value: string | undefined | null): string {
  const v = String(value ?? '').trim()
  return `(${v || '?'})`
}

/** 離着陸 CMD6 の詳細＋タイトル（選択肢は別リスト） */
export function placeDecisionCopy(parts: {
  curPos: string
  curAdrs: string
  lat: number
  lng: number
  alt: number
  hitName: string
  hitAdrs: string
  posDif: string
  altDif: string
  newName: string
}): { title: string; detail: string } {
  return {
    title: '離陸着陸地データ',
    detail: [
      `・場所${parenOrQ(parts.curPos)}`,
      `・住所${parenOrQ(parts.curAdrs)}`,
      `・緯度${parenOrQ(String(parts.lat))}°`,
      `・経度${parenOrQ(String(parts.lng))}°`,
      `・高度${parenOrQ(String(parts.alt))}m`,
      '',
      '検索結果',
      `・場所${parenOrQ(parts.hitName)}`,
      `・住所${parenOrQ(parts.hitAdrs)}`,
      `・位置誤差${parenOrQ(parts.posDif)}m`,
      `・高度誤差${parenOrQ(parts.altDif)}m`,
      '',
      '新規生成の場所',
      `・場所${parenOrQ(parts.newName)}`,
    ].join('\n'),
  }
}

/** @deprecated use placeDecisionCopy */
export function placeDecisionPrompt(parts: Parameters<typeof placeDecisionCopy>[0]): string {
  const { title, detail } = placeDecisionCopy(parts)
  return `${title}\n${detail}`
}

/** 8.場所データ管理（直接起動） */
export const PLACE_MENU_BACK = '%戻る'
export const PLACE_MENU_HERE = '%現在地検索'
export const PLACE_HERE_SKIP = '1.登録しない'
export const PLACE_HERE_NEW = '2.新規生成の場所名で登録'
export const PLACE_EDIT_BACK = '#戻る'
export const PLACE_EDIT_DEL = '#データ削除'
export const PLACE_EDIT_MAP = '#マップ表示'
export const PLACE_EDIT_PROMPT = '削除または更新したい項目1~7を選択してください。（ver03）'
export const PLACE_DEL_PROMPT = '本当にこの場所データを削除しますか？'
export const PLACE_DEL_OK = '1.削除'
export const PLACE_DEL_BACK = '2.戻る'

/** 通信失敗時（操作ごと。常時オンライン表示はしない） */
export const NET_FAIL_ADDRESS =
  '住所を取得できませんでした（通信を確認してください）'
export const NET_FAIL_ELEVATION =
  '標高を取得できませんでした（通信を確認してください）'
export const NET_FAIL_WEATHER =
  '気象データを取得できませんでした（通信を確認してください）'

export function placeEditCopyCmd(name: string): string {
  return `#データコピー(${name})`
}

/** 現在地検索（場所管理直起動）用サマリ */
export function placeHereCopy(parts: {
  curAdrs: string
  lat: number
  lng: number
  alt: number
  hitName: string
  hitAdrs: string
  posDif: string
  altDif: string
  newName: string
}): { title: string; detail: string } {
  return {
    title: '現在地データ',
    detail: [
      `・場所${parenOrQ('')}`,
      `・住所${parenOrQ(parts.curAdrs)}`,
      `・緯度${parenOrQ(String(parts.lat))}°`,
      `・経度${parenOrQ(String(parts.lng))}°`,
      `・高度${parenOrQ(String(parts.alt))}m`,
      '',
      '検索結果',
      `・場所${parenOrQ(parts.hitName)}`,
      `・住所${parenOrQ(parts.hitAdrs)}`,
      `・位置誤差${parenOrQ(parts.posDif)}m`,
      `・高度誤差${parenOrQ(parts.altDif)}m`,
      '',
      '新規生成の場所',
      `・場所${parenOrQ(parts.newName)}`,
    ].join('\n'),
  }
}

/** @deprecated use placeHereCopy */
export function placeHerePrompt(parts: Parameters<typeof placeHereCopy>[0]): string {
  const { title, detail } = placeHereCopy(parts)
  return `${title}\n${detail}`
}
