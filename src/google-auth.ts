/**
 * Google Identity Services（トークン方式）
 * Client ID は VITE_GOOGLE_CLIENT_ID（.env）。settings JSON には書かない。
 */

const GIS_SRC = 'https://accounts.google.com/gsi/client'
/** 既存の手動作成フォルダを読むため当面 drive。後で drive.file 等へ絞れる */
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive'

type TokenClient = {
  requestAccessToken: (overrideConfig?: { prompt?: string }) => void
}

type TokenResponse = {
  access_token?: string
  error?: string
  error_description?: string
  expires_in?: number
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string
            scope: string
            callback: (resp: TokenResponse) => void
            error_callback?: (err: { type?: string; message?: string }) => void
          }) => TokenClient
          revoke: (token: string, done: () => void) => void
        }
      }
    }
  }
}

let accessToken: string | null = null
let tokenExpiresAt = 0
let gisLoad: Promise<void> | null = null

const TOKEN_STORE = 'flight-pwa.google.access'
const AUTO_PAUSED = 'flight-google-auto-paused'

function persistToken(): void {
  try {
    if (!accessToken || !tokenExpiresAt) {
      sessionStorage.removeItem(TOKEN_STORE)
      return
    }
    sessionStorage.setItem(
      TOKEN_STORE,
      JSON.stringify({ accessToken, tokenExpiresAt }),
    )
  } catch {
    /* ignore */
  }
}

function restoreToken(): void {
  try {
    const raw = sessionStorage.getItem(TOKEN_STORE)
    if (!raw) return
    const o = JSON.parse(raw) as { accessToken?: string; tokenExpiresAt?: number }
    if (o.accessToken && o.tokenExpiresAt && Date.now() < o.tokenExpiresAt - 30_000) {
      accessToken = o.accessToken
      tokenExpiresAt = o.tokenExpiresAt
    } else {
      sessionStorage.removeItem(TOKEN_STORE)
    }
  } catch {
    /* ignore */
  }
}

restoreToken()

export function getGoogleClientId(): string {
  return String(import.meta.env.VITE_GOOGLE_CLIENT_ID || '').trim()
}

export function isGoogleClientConfigured(): boolean {
  return getGoogleClientId().length > 0
}

export function getAccessToken(): string | null {
  if (!accessToken) restoreToken()
  if (!accessToken) return null
  if (tokenExpiresAt && Date.now() >= tokenExpiresAt - 30_000) {
    accessToken = null
    tokenExpiresAt = 0
    persistToken()
    return null
  }
  return accessToken
}

export function isGoogleSignedIn(): boolean {
  return Boolean(getAccessToken())
}

export function clearGoogleSession(): void {
  const t = accessToken
  accessToken = null
  tokenExpiresAt = 0
  persistToken()
  if (t && window.google?.accounts.oauth2.revoke) {
    try {
      window.google.accounts.oauth2.revoke(t, () => {})
    } catch {
      /* ignore */
    }
  }
}

/** 「停止」を押したあとは、ログインが残っていても動作中へ戻さない。 */
export function pauseGoogleAuto(): void {
  localStorage.setItem(AUTO_PAUSED, '1')
}

export function resumeGoogleAutoIntent(): void {
  localStorage.removeItem(AUTO_PAUSED)
}

export function googleAutoPaused(): boolean {
  return localStorage.getItem(AUTO_PAUSED) === '1'
}

let googleResumeTried = false

/**
 * フォルダが設定済みで、停止されていず、ブラウザ側の Google 許可が残っていればトークンを取り直す。
 * 画面は出さない。失敗しても停止中のまま。
 */
export async function resumeGoogleAutoIfGranted(): Promise<boolean> {
  if (googleResumeTried || googleAutoPaused()) return isGoogleSignedIn()
  googleResumeTried = true
  if (isGoogleSignedIn()) return true
  try {
    await requestGoogleAccessToken()
    return true
  } catch {
    return false
  }
}

function loadGis(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve()
  if (gisLoad) return gisLoad
  gisLoad = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SRC}"]`)
    if (existing) {
      existing.addEventListener('load', () => resolve())
      existing.addEventListener('error', () => reject(new Error('GIS の読込に失敗しました')))
      if (window.google?.accounts?.oauth2) resolve()
      return
    }
    const s = document.createElement('script')
    s.src = GIS_SRC
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('GIS の読込に失敗しました'))
    document.head.appendChild(s)
  })
  return gisLoad
}

/** 同意画面を出してアクセストークンを取得（メモリ保持のみ） */
export async function requestGoogleAccessToken(opts?: {
  promptConsent?: boolean
}): Promise<string> {
  const clientId = getGoogleClientId()
  if (!clientId) {
    throw new Error(
      'VITE_GOOGLE_CLIENT_ID が未設定です。.env にクライアント ID を入れて dev を再起動してください。',
    )
  }
  await loadGis()
  const oauth2 = window.google?.accounts.oauth2
  if (!oauth2) throw new Error('Google Identity Services が利用できません')

  return new Promise((resolve, reject) => {
    let settled = false
    const timer = window.setTimeout(() => {
      finish(() => reject(new Error('Google ログインが時間内に終わりませんでした。もう一度実行してください。')))
    }, 180_000)
    const finish = (fn: () => void) => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      fn()
    }
    const client = oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_SCOPE,
      callback: (resp) => {
        if (resp.error || !resp.access_token) {
          finish(() =>
            reject(
              new Error(resp.error_description || resp.error || 'Google ログインに失敗しました'),
            ),
          )
          return
        }
        accessToken = resp.access_token
        const sec = Number(resp.expires_in) || 3600
        tokenExpiresAt = Date.now() + sec * 1000
        persistToken()
        finish(() => resolve(accessToken as string))
      },
      error_callback: (err) => {
        finish(() => reject(new Error(err.message || err.type || 'Google ログインがキャンセルされました')))
      },
    })
    client.requestAccessToken({
      prompt: opts?.promptConsent ? 'consent' : '',
    })
  })
}

/** 有効トークンが無ければログイン UI を出す */
export async function ensureGoogleAccessToken(): Promise<string> {
  const existing = getAccessToken()
  if (existing) return existing
  return requestGoogleAccessToken()
}
