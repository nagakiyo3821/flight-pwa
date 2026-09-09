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
    const client = oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_SCOPE,
      callback: (resp) => {
        if (resp.error || !resp.access_token) {
          reject(
            new Error(
              resp.error_description || resp.error || 'Google ログインに失敗しました',
            ),
          )
          return
        }
        accessToken = resp.access_token
        const sec = Number(resp.expires_in) || 3600
        tokenExpiresAt = Date.now() + sec * 1000
        persistToken()
        resolve(accessToken)
      },
      error_callback: (err) => {
        reject(new Error(err.message || err.type || 'Google ログインがキャンセルされました'))
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
