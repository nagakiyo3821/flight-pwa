/** UA による粗い OS 判定（エクスポート完了通知の分岐用） */

export function isIosDevice(): boolean {
  const ua = navigator.userAgent
  if (/iPad|iPhone|iPod/.test(ua)) return true
  // iPadOS 13+ は Mac 扱いに見えることがある
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
}

export function isAndroidDevice(): boolean {
  return /Android/i.test(navigator.userAgent)
}
