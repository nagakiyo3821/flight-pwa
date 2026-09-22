/**
 * @deprecated 選択肢は catalog / masters JSON へ移行済み。
 * 互換のため getList 等への薄い再エクスポートのみ残す。
 */
export {
  getDroneIds,
  getDroneTypes,
  getLabel,
  getList,
  isKnownDroneType as isDroneType,
} from './catalog'

export type { ListKey } from './catalog'
