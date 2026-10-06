/**
 * 利用条件（LICENSE / TERMS.md と揃える）
 * 同意は端末の localStorage に残す（飛行データとは別）。
 */

export const TERMS_VERSION = '2026-10-07'
const STORAGE_KEY = 'flight-pwa-terms-accepted'

export const TERMS_ISSUES_URL =
  'https://github.com/nagakiyo3821/flight-pwa/issues'
export const TERMS_VIOLATION_ISSUE_URL =
  'https://github.com/nagakiyo3821/flight-pwa/issues/new?title=%5B%E5%88%A9%E7%94%A8%E6%9D%A1%E4%BB%B6%E9%81%95%E5%8F%8D%E3%81%AE%E5%A0%B1%E5%91%8A%5D'
export const TERMS_LICENSE_URL =
  'https://github.com/nagakiyo3821/flight-pwa/blob/main/LICENSE'
export const TERMS_DOC_URL =
  'https://github.com/nagakiyo3821/flight-pwa/blob/main/TERMS.md'

/** 同意ダイアログ・再表示用の本文 */
export const TERMS_SUMMARY = [
  '本アプリは個人・非商用での利用を想定しています。',
  '',
  '・再配布・再公開は禁止です',
  '・商用利用には事前の許諾が必要です',
  '・違反の報告・許諾依頼は GitHub Issues へ',
  '',
  '詳細: LICENSE / TERMS.md（リポジトリ）',
].join('\n')

export function hasAcceptedTerms(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === TERMS_VERSION
  } catch {
    return false
  }
}

export function acceptTerms(): void {
  try {
    localStorage.setItem(STORAGE_KEY, TERMS_VERSION)
  } catch {
    /* private mode 等では記憶できないが利用は継続 */
  }
}
