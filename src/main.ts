import './style.css'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { FIELDS, filled, resolveCustomLabel, resolveOptions } from './fields'
import {
  canOpen,
  formatNow,
  menuLabel,
} from './flag'
import {
  applyWeatherSet,
  commitWorking,
  deleteOrResetRecord,
  deletePlace,
  startDeviceExport,
  ensureBootstrap,
  exportLog,
  exportMasters,
  exportPos,
  exportSettings,
  exportTmp,
  closestPlace3dFromList,
  ecefDistanceM,
  haversineM,
  isInsideNearestPosac,
  listPlaces,
  parsePlaceCoord,
  getCurrentPosition,
  getMeta,
  getPlace,
  getWorking,
  importLog,
  importMasters,
  importPos,
  importSettings,
  importTmp,
  isNewRecordKey,
  listFlightKeys,
  listPlaceNames,
  nextDerivedPlaceName,
  renamePlace,
  resetLog,
  resetMasters,
  resetPos,
  resetSettings,
  resetTmp,
  resetWorking,
  savePlaceRecord,
  saveWorking,
  setWorkingKey,
  upsertPlace,
} from './db'
import type { FieldDef, FlightRecord, LogFile, PlaceRecord, PosFile, TmpFlag } from './types'
import type { MastersFile } from './catalog'
import {
  droneTypeFrom,
  getDroneIds,
  getDroneTypes,
  getHiddenKeys,
  getLabel,
  isKnownDroneType,
} from './catalog'
import {
  getSettings,
  isServerSyncConfigured,
  settingsDetailLines,
  syncNotImplementedMessage,
  syncStatusLabel,
} from './settings'
import {
  clearGoogleSession,
  isGoogleClientConfigured,
  isGoogleSignedIn,
  requestGoogleAccessToken,
} from './google-auth'
import { probeConfiguredDriveFolder } from './google-drive'
import { maybeAutoSync, persistFolderId, runGoogleDriveSync } from './google-sync'
import {
  COMMIT_BACK,
  COMMIT_OK,
  COMMIT_PROMPT,
  CMD_ALL,
  CMD_BACK,
  CMD_COMMIT,
  CMD_DATASET,
  CMD_DELETE,
  CMD_EMPTY,
  CMD_LANDING,
  CMD_RESET,
  CMD_TAKEOFF,
  GPS_LABEL_ALT,
  GPS_LABEL_LAT,
  GPS_LABEL_LNG,
  GPS_LABEL_ADRS,
  GPS_LABEL_NAME,
  GPS_LABEL_POSAC,
  GPS_LABEL_ALTAC,
  FLIGHT_NEAR_EXPAND,
  FLIGHT_NEAR_MOVE,
  FLIGHT_NEAR_RESET,
  FLIGHT_REGPS,
  FLIGHT_TAP_FROM_GPS,
  FLIGHT_TAP_FROM_NEAR,
  FLIGHT_TAP_UNDO,
  LANDING_CANCEL_MSG,
  LANDING_PLACE_CONFIRM_LINE,
  MAP_DONE,
  MAP_PROMPT,
  ITEM_BACK,
  ITEM_OK,
  ITEM_CANCEL,
  MENU_PROMPT,
  NUMBER_RE,
  NET_FAIL_ADDRESS,
  NET_FAIL_ADDRESS_EMPTY,
  NET_FAIL_ADDRESS_TIMEOUT,
  NET_FAIL_ELEVATION,
  NET_FAIL_WEATHER,
  PLACE_NAME_PROMPT,
  PLACE_DEL_BACK,
  PLACE_DEL_OK,
  PLACE_DEL_PROMPT,
  PLACE_EDIT_BACK,
  PLACE_EDIT_DEL,
  PLACE_EDIT_MAP,
  PLACE_EDIT_PROMPT,
  PLACE_MENU_BACK,
  PLACE_MENU_NEW,
  PLACE_NEW_CONFIRM_LINE,
  TAKEOFF_CANCEL_MSG,
  TAKEOFF_PLACE_CONFIRM_LINE,
  placeNearestTitleLabel,
  formatTwoPointDistance,
  PLACE_GPS_TO_POINT,
  PLACE_PT_UNDO,
  PLACE_DEFAULT_POSAC,
  PLACE_DEFAULT_ALTAC,
  PLACE_REVIEW_CONFIRM_LINE,
  PLACE_REVIEW_DEL,
  PLACE_REVIEW_DEL_PROMPT,
  PLACE_NEW_CANCEL_MSG,
  PLACE_REVIEW_CANCEL_MSG,
  PLACE_REVIEW_DEL_CANCEL_MSG,
  PLACE_REVIEW_NOCHANGE_MSG,
  PLACE_REVIEW_DEL_DONE_PREFIX,
  PLACE_REVIEW_UPDATE_MSG_PREFIX,
  PLACE_NEW_DONE_MSG_PREFIX,
  REC_DEL_BACK,
  REC_DEL_OK,
  REC_DEL_PROMPT,
  REC_MENU_BACK,
  RESET_OK,
  RESET_BACK,
  RESET_PROMPT,
  SET_BACK,
  SET_OK,
  SET_PROMPT,
  SETTINGS_HINT_MANUAL,
  SETTINGS_HINT_OFF_DONE,
  SETTINGS_OFF,
  SETTINGS_OFF_CONFIRM,
  GOOGLE_LOGIN,
  GOOGLE_LOGOUT,
  GOOGLE_PROBE,
  GOOGLE_PULL,
  GOOGLE_PUSH,
  GOOGLE_SYNC,
  SYS_DATA_TITLE,
  TIMER_RESET_LATER,
  TIMER_RESET_OK,
  TIMER_RESET_PROMPT,
  TIMER_SET_LATER,
  TIMER_SET_OK,
  TIMER_SET_PROMPT,
  droneIdInputPrompt,
  droneIdPrompt,
  droneTypePrompt,
  fieldPromptText,
  freePrompt,
  gpsMissingPrompt,
  isValidNumberInput,
  newaPrompt,
  newbPrompt,
  parenData,
  placeEditCopyCmd,
  placeOverwritePrompt,
  PLACE_OVERWRITE_BACK,
  PLACE_OVERWRITE_OK,
  targetDataLine,
} from './ui-strings'
import { fetchWeatherSet } from './weather'
import { APP_VERSION } from './version'
import { isIosDevice } from './platform'
import {
  fetchGroundElevation,
  resolveGpsOrDemAltitude,
  roundAltMeters,
  osmOpenUrl,
  reverseGeocode,
  jpGsiTileOpts,
  jpMapMaxZoom,
  JP_BASE_TILE_URL,
  JP_DETAIL_HANDOFF_ZOOM,
  JP_MAP_VIEW_ZOOM,
  JP_PHOTO_TILE_URL,
  type GsiTileMode,
  type ReverseGeocodeStatus,
} from './geo'
import {
  combineYmdAndHm,
  displayFlightHm,
  formatHmFromDate,
  formatYmd,
  hydrateFlightDurationCache,
  parseFlightDate,
  syncAfterFlightDuration,
  syncAfterLandingDate,
  syncAfterTakeoffDate,
} from './flight-time'
import {
  elapsedSecondsSinceSet,
  evaluateTimers,
  type TimerNeed,
} from './session-timers'

/** ショートカットの T＝セット（tmp.TIME）からの経過秒 */
let menuTick: number | undefined
/** 期限切れダイアログを「後で」したときの抑止 */
let timerPromptDismissed: { time: string; need: TimerNeed } | null = null
let timerCheckRunning = false

type View =
  | 'menu'
  | 'newa'
  | 'newb'
  | 'record-edit'
  | 'records'
  | 'checklist'
  | 'io'
  | 'places'
  | 'place-edit'

let view: View = 'menu'
let placeEditName: string | null = null
let checklistFilter: 'pre' | 'post' | 'all' = 'pre'
/** メニュー再描画後に一度だけ出すメッセージ */
let flashMsg = ''
const app = document.querySelector<HTMLDivElement>('#app')!

async function render(): Promise<void> {
  stopMenuTick()
  clearStickyFocus()
  await ensureBootstrap()
  if (view === 'menu') await renderMenu()
  else if (view === 'newa') await renderEditList('A')
  else if (view === 'newb') await renderEditList('B')
  else if (view === 'record-edit') await renderEditList('F')
  else if (view === 'records') await renderRecords()
  else if (view === 'checklist') await renderChecklist()
  else if (view === 'places') await renderPlaces()
  else if (view === 'place-edit') await renderPlaceEdit()
  else await renderIO()
  clearStickyFocus()
}

let autoSyncWired = false
function wireAutoSync(): void {
  if (autoSyncWired) return
  autoSyncWired = true
  void maybeAutoSync('launch').then((msg) => {
    if (!msg) return
    flashMsg = msg
    void render()
  })
  window.addEventListener('online', () => {
    void maybeAutoSync('online').then((msg) => {
      if (!msg) return
      flashMsg = msg
      if (view === 'menu' || view === 'io') void render()
    })
  })
}

function shell(
  title: string,
  body: string,
  subtitle = '',
  opts: { backId?: string } = {},
): string {
  const back = opts.backId
    ? `<button type="button" class="nav-back" id="${escapeHtml(opts.backId)}" aria-label="戻る">
        <span class="nav-back-chevron" aria-hidden="true"></span>
        <span>戻る</span>
      </button>`
    : ''
  return `
  <header class="top${opts.backId ? ' top--with-back' : ''}">
    ${back}
    <div class="top-titles">
      <h1 class="prompt">${title}</h1>
      ${subtitle ? `<p class="prompt-sub" id="promptSub">${subtitle}</p>` : ''}
    </div>
  </header>
  <main>${body}</main>
  <footer class="foot">飛行記録 PWA · v${APP_VERSION}</footer>`
}

function srSsOrQ(v: string | undefined): string {
  const s = (v || '').trim()
  return s || '?'
}

function elapsedT(timeRaw: string | undefined): number {
  return elapsedSecondsSinceSet(timeRaw) ?? 0
}

function titleSubtitle(sr: string, ss: string, timeRaw: string): string {
  return `SR（${escapeHtml(srSsOrQ(sr))}）、SS（${escapeHtml(srSsOrQ(ss))}）、T（${elapsedT(timeRaw)}）`
}

function stopMenuTick(): void {
  if (menuTick !== undefined) {
    window.clearInterval(menuTick)
    menuTick = undefined
  }
}

async function renderMenu(): Promise<void> {
  const meta = await getMeta()
  const t = meta.tmp
  const items: { action: string; text: string; flag?: string; inert?: boolean }[] = [
    {
      action: 'pre',
      flag: t.DATA1,
      text: `1.離陸前チェック(${menuLabel(1, t.DATA1)})`,
    },
    {
      action: 'takeoff',
      flag: t.DATA2,
      text: `2.離陸登録(${menuLabel(2, t.DATA2)})`,
    },
    {
      action: 'landing',
      flag: t.DATA3,
      text: `3.着陸登録(${menuLabel(3, t.DATA3)})`,
    },
    {
      action: 'post',
      flag: t.DATA4,
      text: `4.着陸後チェック(${menuLabel(4, t.DATA4)})`,
    },
    {
      action: 'commit',
      flag: t.DATA5,
      text: `5.データ登録(${menuLabel(5, t.DATA5)})`,
    },
    { action: 'reset', text: '6.データリセット' },
    { action: 'records', text: '7.登録データ管理' },
    { action: 'places', text: '8.場所データ管理' },
    { action: 'io', text: '9.システムデータ管理' },
    {
      action: 'exit',
      text: '10.終了(手動でタブを閉じる)',
      inert: true,
    },
  ]

  const list = items
    .map((it) => {
      const locked = !!it.inert || (it.flag !== undefined && !canOpen(it.flag))
      const inertAttr = it.inert ? ' data-inert="1"' : ''
      return `<button type="button" class="menu-btn${locked ? ' locked' : ''}" data-action="${it.action}" data-flag="${it.flag ?? ''}"${inertAttr}${locked ? ' aria-disabled="true"' : ''}>${escapeHtml(it.text)}</button>`
    })
    .join('')

  app.innerHTML = shell(
    MENU_PROMPT,
    `
    <p id="msg" class="msg menu-flash"></p>
    <section class="card menu-card">
      <div class="menu">${list}</div>
    </section>`,
    titleSubtitle(t.A_SR, t.A_SS, t.TIME),
  )

  const msgEl = app.querySelector('#msg')!
  if (flashMsg) {
    msgEl.textContent = flashMsg
    flashMsg = ''
  }

  app.querySelectorAll<HTMLButtonElement>('[data-action]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.inert === '1') return
      const action = btn.dataset.action!
      const flag = btn.dataset.flag ?? ''
      if (flag !== '' && !canOpen(flag)) {
        msgEl.textContent = 'ロック中のため実行できません'
        return
      }
      void onMenu(action).catch((e) => {
        msgEl.textContent = `失敗: ${(e as Error).message}`
      })
    })
  })

  menuTick = window.setInterval(() => {
    void (async () => {
      const el = app.querySelector('#promptSub')
      if (!el) return
      const { tmp } = await getMeta()
      el.textContent = `SR（${srSsOrQ(tmp.A_SR)}）、SS（${srSsOrQ(tmp.A_SS)}）、T（${elapsedT(tmp.TIME)}）`
    })()
  }, 1000)

  void enforceSessionTimers(t.TIME)
}

function dialogShell(
  promptHtml: string,
  bodyHtml: string,
  actionsHtml: string,
  detailHtml = '',
  panelClass = '',
): string {
  const detail = detailHtml
    ? `<div class="sc-dialog-detail">${detailHtml}</div>`
    : ''
  const panelCls = panelClass ? ` sc-dialog-panel ${panelClass}` : ' sc-dialog-panel'
  const head =
    String(promptHtml ?? '').trim().length > 0
      ? `<header class="sc-dialog-head">
        <h1 class="prompt">${promptHtml}</h1>
      </header>`
      : ''
  // 選択肢リストはスクロール外に置き、行間隔を揃える
  const choiceOnly = /^\s*<div\s+class="menu\s+sc-choice-list"/.test(bodyHtml)
  const scrollInner = choiceOnly ? detail : `${detail}${bodyHtml}`
  const listPart = choiceOnly ? bodyHtml : ''
  return `
    <div class="${panelCls.trim()}">
      ${head}
      <section class="card sc-dialog-body">
        <div class="sc-dialog-scroll">${scrollInner}</div>
        ${listPart}
        ${actionsHtml}
      </section>
    </div>`
}

function dialogActions(opts: { ok?: boolean; back?: boolean }): string {
  const ok = opts.ok
    ? `<button type="button" class="sc-btn sc-btn-ok" id="sc-ok">${escapeHtml(ITEM_OK)}</button>`
    : ''
  const back =
    opts.back !== false
      ? `<button type="button" class="sc-btn sc-btn-back" id="sc-back">${escapeHtml(ITEM_BACK)}</button>`
      : ''
  return `<div class="sc-actions">${ok}${back}</div>`
}

/** 出力確認。OK タップ＝ユーザー操作内で出力開始（iOS 必須） */
function showExportConfirmDialog(filename: string, data: unknown): Promise<void> {
  return new Promise((resolve) => {
    const root = openDialogRoot()
    root.classList.add('sc-dialog--alert')
    const appEl = document.getElementById('app')
    appEl?.setAttribute('inert', '')
    root.innerHTML = `
      <div class="sc-alert" role="document">
        <p class="sc-alert-msg">${escapeHtml(filename)} を出力します</p>
        <button type="button" class="sc-btn sc-btn-ok" id="sc-ok">OK</button>
      </div>`
    let done = false
    const finish = () => {
      if (done) return
      done = true
      appEl?.removeAttribute('inert')
      closeDialogSafely(root, () => resolve())
    }
    root.querySelector('#sc-ok')?.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      const { done } = startDeviceExport(filename, data, {
        preferShare: isIosDevice(),
      })
      finish()
      void done.then(async (outcome) => {
        const applyIoMsg = (t: string, kind: 'ok' | 'bad') => {
          const el = app.querySelector<HTMLElement>('#msg')
          if (el && view === 'io') {
            el.textContent = t
            el.classList.toggle('ok', kind === 'ok')
            el.classList.toggle('bad', kind === 'bad')
            return
          }
          flashMsg = t
        }
        if (outcome === 'cancelled') {
          applyIoMsg('出力を中止しました', 'ok')
          return
        }
        if (outcome === 'error') {
          applyIoMsg('出力に失敗しました', 'bad')
          return
        }
        await showNoticeDialog(
          `${filename}\nファイル出力が成功したか確認してください。`,
        )
        applyIoMsg(`確認してください（${filename}）`, 'ok')
      })
    })
    root.querySelector('.sc-alert')?.addEventListener('click', (e) => {
      e.stopPropagation()
    })
  })
}

/** 通常アプリ風の通知ダイアログ（半透明オーバーレイ＋中央パネル＋OK） */
function showNoticeDialog(prompt: string): Promise<void> {
  return new Promise((resolve) => {
    const root = openDialogRoot()
    root.classList.add('sc-dialog--alert')
    const appEl = document.getElementById('app')
    appEl?.setAttribute('inert', '')
    const promptHtml = escapeHtml(prompt).replace(/\n/g, '<br/>')
    root.innerHTML = `
      <div class="sc-alert" role="document">
        <p class="sc-alert-msg">${promptHtml}</p>
        <button type="button" class="sc-btn sc-btn-ok" id="sc-ok">OK</button>
      </div>`
    let done = false
    const finish = () => {
      if (done) return
      done = true
      appEl?.removeAttribute('inert')
      closeDialogSafely(root, () => resolve())
    }
    root.querySelector('#sc-ok')?.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      finish()
    })
    root.querySelector('.sc-alert')?.addEventListener('click', (e) => {
      e.stopPropagation()
    })
  })
}

function openDialogRoot(): HTMLDivElement {
  stopMenuTick()
  clearStickyFocus()
  document.getElementById('sc-dialog')?.remove()
  document.getElementById('app')?.removeAttribute('inert')
  const root = document.createElement('div')
  root.id = 'sc-dialog'
  root.className = 'sc-dialog'
  root.setAttribute('role', 'dialog')
  root.setAttribute('aria-modal', 'true')
  document.body.appendChild(root)
  return root
}

/** タッチ後に残る :hover / :focus の見た目を消す */
function clearStickyFocus(): void {
  const el = document.activeElement
  if (el instanceof HTMLElement) el.blur()
}

/** 同一クリックが背面 UI へ貫通しないよう遅延して閉じる */
function closeDialogSafely(root: HTMLElement, after?: () => void): void {
  root.style.pointerEvents = 'none'
  clearStickyFocus()
  window.setTimeout(() => {
    root.remove()
    clearStickyFocus()
    after?.()
  }, 50)
}

/**
 * リスト選択。選択肢をタップで確定。
 * withBackButton=true（項目入力）のとき下部に「戻る」ボタン。null = 戻る。
 * withBackButton=false（リセット確認など）はリスト内の「2.戻る」等を使う。
 *
 * 閉じるときは click 貫通（背面メニューの誤タップ）を防ぐ。
 */
function chooseFromList(
  prompt: string,
  choices: string[],
  opts: { withBackButton?: boolean; detail?: string } = { withBackButton: true },
): Promise<string | null> {
  return new Promise((resolve) => {
    const root = openDialogRoot()
    const promptHtml = escapeHtml(prompt).replace(/\n/g, '<br/>')
    const detailHtml = opts.detail
      ? escapeHtml(opts.detail).replace(/\n/g, '<br/>')
      : ''
    const withBack = opts.withBackButton !== false
    const listHtml = `
      <div class="menu sc-choice-list">
        ${choices
          .map(
            (c, i) =>
              `<button type="button" class="menu-btn" data-choice="${i}">${escapeHtml(c)}</button>`,
          )
          .join('')}
      </div>`
    root.innerHTML = dialogShell(
      promptHtml,
      listHtml,
      withBack ? dialogActions({ back: true }) : '',
      detailHtml,
    )
    let done = false
    const finish = (value: string | null) => {
      if (done) return
      done = true
      closeDialogSafely(root, () => resolve(value))
    }
    root.querySelectorAll<HTMLButtonElement>('[data-choice]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        const i = Number(btn.dataset.choice)
        finish(choices[i] ?? '')
      })
    })
    root.querySelector('#sc-back')?.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      finish(null)
    })
  })
}

/** 複数選択（飛行条件など）。確定／戻るは下部ボタン */
function chooseFromListMulti(
  prompt: string,
  choices: string[],
  preselected: string[] = [],
): Promise<string[] | null> {
  return new Promise((resolve) => {
    const selected = new Set(preselected.filter((x) => choices.includes(x)))
    const root = openDialogRoot()
    const promptHtml = escapeHtml(prompt).replace(/\n/g, '<br/>')

    const renderChoices = () =>
      choices
        .map((c, i) => {
          const on = selected.has(c)
          return `<button type="button" class="menu-btn${on ? ' multi-on' : ''}" data-choice="${i}">${on ? '✓ ' : ''}${escapeHtml(c)}</button>`
        })
        .join('')

    const body = `<div class="menu sc-choice-list" id="sc-multi">${renderChoices()}</div>`
    root.innerHTML = dialogShell(promptHtml, body, dialogActions({ ok: true, back: true }))

    const wire = () => {
      root.querySelectorAll<HTMLButtonElement>('#sc-multi [data-choice]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const c = choices[Number(btn.dataset.choice)]!
          if (selected.has(c)) selected.delete(c)
          else selected.add(c)
          root.querySelector('#sc-multi')!.innerHTML = renderChoices()
          wire()
        })
      })
    }
    wire()
    root.querySelector('#sc-ok')!.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      closeDialogSafely(root, () => resolve([...selected]))
    })
    root.querySelector('#sc-back')!.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      closeDialogSafely(root, () => resolve(null))
    })
  })
}

/** 入力中の下書きを数値用に制限（±・数字・小数点1つ） */
function sanitizeNumberDraft(raw: string): string {
  let out = ''
  let sawDot = false
  let i = 0
  if (raw[0] === '+' || raw[0] === '-') {
    out += raw[0]
    i = 1
  }
  for (; i < raw.length; i++) {
    const c = raw[i]!
    if (c >= '0' && c <= '9') out += c
    else if (c === '.' && !sawDot) {
      out += c
      sawDot = true
    }
  }
  return out
}

function normalizeNumberInput(raw: string): string {
  let t = sanitizeNumberDraft(raw.trim())
  if (t.endsWith('.')) t = t.slice(0, -1)
  if (t === '+' || t === '-') t = ''
  return t
}

/** 記述／数値の1項目入力。確定／戻るは下部ボタン。数値は文字を受け付けない。 */
function askText(
  prompt: string,
  initial: string,
  mode: 'text' | 'number' = 'text',
): Promise<string | null> {
  return new Promise((resolve) => {
    const root = openDialogRoot()
    const promptHtml = escapeHtml(prompt).replace(/\n/g, '<br/>')
    const start = mode === 'number' ? sanitizeNumberDraft(initial) : initial
    const body =
      mode === 'number'
        ? `<div class="sc-field-block">${clearableInputHtml('sc-input', 'class="sc-input" type="text" inputmode="decimal" autocomplete="off"', start)}</div>`
        : `<div class="sc-field-block">${clearableInputHtml('sc-input', 'class="sc-input" type="text" inputmode="text"', start)}</div>`
    root.innerHTML = dialogShell(promptHtml, body, dialogActions({ ok: true, back: true }))
    wireClearableInputs(root)
    const input = root.querySelector<HTMLInputElement>('#sc-input')!
    input.focus()
    input.select()
    let done = false
    const finish = (value: string | null) => {
      if (done) return
      done = true
      closeDialogSafely(root, () => resolve(value))
    }
    const confirm = () => {
      if (mode === 'number') {
        const v = normalizeNumberInput(input.value)
        input.value = v
        if (!isValidNumberInput(v)) {
          input.setCustomValidity('数値を入力してください')
          input.reportValidity()
          return
        }
        input.setCustomValidity('')
        finish(v)
        return
      }
      finish(input.value)
    }
    if (mode === 'number') {
      input.addEventListener('input', () => {
        const cleaned = sanitizeNumberDraft(input.value)
        if (cleaned !== input.value) input.value = cleaned
        input.setCustomValidity('')
      })
    }
    root.querySelector('#sc-ok')!.addEventListener('click', confirm)
    root.querySelector('#sc-back')!.addEventListener('click', () => finish(null))
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') confirm()
      if (e.key === 'Escape') finish(null)
    })
  })
}

/** yyyy/mm/dd → input[type=date] 用 yyyy-mm-dd */
function toDateInputValue(ymd: string): string {
  const m = ymd.trim().replace(/-/g, '/').match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/)
  if (!m) return ''
  const p = (n: string) => n.padStart(2, '0')
  return `${m[1]}-${p(m[2]!)}-${p(m[3]!)}`
}

/** input[type=date] → yyyy/mm/dd */
function fromDateInputValue(iso: string): string {
  const m = iso.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return ''
  return `${m[1]}/${m[2]}/${m[3]}`
}

/** HH:mm を input[type=time] 用に正規化（日時文字列からも時分を抽出） */
function toTimeInputValue(hm: string): string {
  const s = hm.trim()
  const fromHm = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/)
  if (fromHm) return `${fromHm[1]!.padStart(2, '0')}:${fromHm[2]}`
  // yyyy/mm/dd HH:mm や ISO の末尾時分
  const fromDate = s.match(/(?:^|[\sT])(\d{1,2}):(\d{2})(?::\d{2})?(?:\.\d+)?(?:Z)?$/)
  if (fromDate) return `${fromDate[1]!.padStart(2, '0')}:${fromDate[2]}`
  return ''
}

/**
 * カレンダー UI（input type=date）。
 * モバイル／PC とも OS 標準の日付ピッカー。
 */
function askDate(prompt: string, initialYmd: string): Promise<string | null> {
  return new Promise((resolve) => {
    const root = openDialogRoot()
    const promptHtml = escapeHtml(prompt).replace(/\n/g, '<br/>')
    const value = toDateInputValue(initialYmd)
    const body = `<div class="sc-field-block">${clearableInputHtml('sc-input', 'class="sc-input sc-input-date" type="date"', value)}</div>`
    root.innerHTML = dialogShell(promptHtml, body, dialogActions({ ok: true, back: true }))
    wireClearableInputs(root)
    const input = root.querySelector<HTMLInputElement>('#sc-input')!
    input.focus()
    let done = false
    const finish = (v: string | null) => {
      if (done) return
      done = true
      closeDialogSafely(root, () => resolve(v))
    }
    const confirm = () => {
      if (!input.value) {
        input.setCustomValidity('日付を選択してください')
        input.reportValidity()
        return
      }
      input.setCustomValidity('')
      finish(fromDateInputValue(input.value))
    }
    root.querySelector('#sc-ok')!.addEventListener('click', confirm)
    root.querySelector('#sc-back')!.addEventListener('click', () => finish(null))
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') confirm()
      if (e.key === 'Escape') finish(null)
    })
  })
}

/**
 * 時・分ピッカー（input type=time）。
 * iPhone / Android ではローリング UI、PC は OS 標準の時刻 UI。
 */
function askTime(prompt: string, initialHm: string): Promise<string | null> {
  return new Promise((resolve) => {
    const root = openDialogRoot()
    const promptHtml = escapeHtml(prompt).replace(/\n/g, '<br/>')
    const value = toTimeInputValue(initialHm) || '00:00'
    const body = `<div class="sc-field-block">${clearableInputHtml('sc-input', 'class="sc-input sc-input-time" type="time" step="60"', value)}</div>`
    root.innerHTML = dialogShell(promptHtml, body, dialogActions({ ok: true, back: true }))
    wireClearableInputs(root)
    const input = root.querySelector<HTMLInputElement>('#sc-input')!
    input.focus()
    let done = false
    const finish = (v: string | null) => {
      if (done) return
      done = true
      closeDialogSafely(root, () => resolve(v))
    }
    const confirm = () => {
      if (!input.value) {
        input.setCustomValidity('時刻を選択してください')
        input.reportValidity()
        return
      }
      input.setCustomValidity('')
      // 秒付き "HH:mm:ss" になる環境もある
      const hm = toTimeInputValue(input.value.slice(0, 5)) || input.value.slice(0, 5)
      finish(hm)
    }
    root.querySelector('#sc-ok')!.addEventListener('click', confirm)
    root.querySelector('#sc-back')!.addEventListener('click', () => finish(null))
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') confirm()
      if (e.key === 'Escape') finish(null)
    })
  })
}

type LatLngAlt = {
  lat: number
  lng: number
  alt: number
  adrs?: string
  posac?: string
  altac?: string
  /** %新規場所登録で同一画面入力した場所名 */
  name?: string
  /**
   * 離陸・着陸で、精度円の内側として採用した登録場所。
   * 座標や精度円を画面上で直した場合は adjusted。
   */
  flightCommit?: {
    relation: 'inside' | 'touch-out' | 'apart'
    /** 円内。飛行記録は green を使う */
    useNearest: boolean
    green?: {
      baseName: string
      name: string
      lat: number
      lng: number
      alt: number
      adrs: string
      posac: string
      altac: string
      /** 場所マスタへ書く */
      write: boolean
    }
  }
}

/** askDualPlaceGeo の戻り。deleted / delete-cancelled は既存場所プレビュー */
type DualPlaceGeoResult = LatLngAlt | 'deleted' | 'delete-cancelled' | null
type GeoParts = { lat?: number; lng?: number; alt?: number }

function isFiniteNum(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n)
}

function isRequiredNumber(raw: string): boolean {
  const v = normalizeNumberInput(raw)
  return v !== '' && NUMBER_RE.test(v)
}

function geoFieldHtml(
  id: string,
  label: string,
  initial: string,
  opts?: {
    fill?: boolean
    text?: boolean
    labelHtml?: string
    textUndo?: boolean
    undo?: boolean
    /** clear=×直前 / committed=直前に確定した有効値 */
    undoMode?: 'clear' | 'committed'
  },
): string {
  const inputClass = opts?.fill ? 'sc-input sc-input--fill' : 'sc-input'
  const labelInner = opts?.labelHtml ?? escapeHtml(label)
  const withUndo = !!(opts?.undo || opts?.textUndo)
  const undoMode = opts?.undoMode === 'committed' ? 'committed' : 'clear'
  if (opts?.text) {
    const auto = id.includes('adrs') ? 'street-address' : 'off'
    return `<label class="sc-geo-field sc-geo-field--adrs"><span>${labelInner}</span>
    ${clearableInputHtml(
      id,
      `class="${inputClass}" type="text" inputmode="text" autocomplete="${auto}"`,
      initial,
      { undo: withUndo, undoMode },
    )}</label>`
  }
  return `<label class="sc-geo-field"><span class="sc-geo-field-label">${labelInner}</span>
    ${clearableInputHtml(
      id,
      `class="${inputClass}" type="text" inputmode="decimal" autocomplete="off"`,
      sanitizeNumberDraft(initial),
      { undo: withUndo, undoMode },
    )}</label>`
}

/** 数値欄: blur 時に空／不正なら直前の有効値へ戻す */
const numericLastGood = new Map<HTMLInputElement, string>()

function commitNumericLastGood(el: HTMLInputElement): void {
  numericLastGood.set(el, el.value)
}

function wireNumericLastGoodRevert(
  el: HTMLInputElement,
  onRestored?: () => void,
): void {
  if (el.readOnly || el.classList.contains('sc-input--locked')) return
  if (!numericLastGood.has(el)) commitNumericLastGood(el)
  el.addEventListener('blur', () => {
    if (el.readOnly || el.classList.contains('sc-input--locked')) return
    const v = normalizeNumberInput(el.value)
    if (!isRequiredNumber(v)) {
      el.value = numericLastGood.get(el) ?? ''
      el.setCustomValidity('')
      onRestored?.()
      return
    }
    el.value = v
    commitNumericLastGood(el)
  })
}

function dualGeoLabelHtml(kind: 'gps' | 'tap' | 'near', text: string): string {
  const ico =
    kind === 'gps'
      ? '<span class="sc-map-ico sc-map-ico--gps sc-map-ico--inline" aria-hidden="true"></span>'
      : kind === 'near'
        ? '<span class="sc-map-ico sc-map-ico--near sc-map-ico--inline" aria-hidden="true"></span>'
        : '<span class="sc-map-ico sc-map-ico--tap sc-map-ico--inline" aria-hidden="true"></span>'
  return `${ico}<span class="sc-geo-field-label-text">${escapeHtml(text)}</span>`
}

/** テキスト／数値／日付／時刻入力＋消去（×）。undo で復元（常時表示） */
function clearableInputHtml(
  id: string,
  inputAttrs: string,
  value: string,
  opts?: { undo?: boolean; undoMode?: 'clear' | 'committed' },
): string {
  const wrapCls = opts?.undo ? ' sc-input-wrap--with-undo' : ''
  const undoMode = opts?.undoMode === 'committed' ? 'committed' : 'clear'
  const undoBtn = opts?.undo
    ? `<button type="button" class="sc-input-undo" aria-label="1つ前に戻す" tabindex="-1" title="1つ前に戻す" disabled><svg class="sc-input-undo-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z"/></svg></button>`
    : ''
  const modeAttr = opts?.undo ? ` data-undo-mode="${undoMode}"` : ''
  return `<div class="sc-input-wrap${wrapCls}"${modeAttr}>
    <input id="${id}" ${inputAttrs} value="${escapeHtml(value)}" />
    ${undoBtn}
    <button type="button" class="sc-input-clear" aria-label="消去" tabindex="-1" hidden>&times;</button>
  </div>`
}

/** 入力が空でなければ × を表示。undo は常時表示（復元不可時は disabled）。 */
function wireClearableInputs(root: ParentNode): () => void {
  const syncAll: Array<() => void> = []
  root.querySelectorAll<HTMLElement>('.sc-input-wrap').forEach((wrap) => {
    const input = wrap.querySelector<HTMLInputElement>(
      'input:not([type="hidden"]):not([type="radio"]):not([type="checkbox"]):not([type="file"])',
    )
    const btn = wrap.querySelector<HTMLButtonElement>('.sc-input-clear')
    const undoBtn = wrap.querySelector<HTMLButtonElement>('.sc-input-undo')
    if (!input || !btn) return
    const undoMode =
      wrap.dataset.undoMode === 'committed' ? 'committed' : 'clear'
    /** clear: ×直前。committed: 直前に確定した有効値 */
    let undoValue: string | null = null
    let committed = String(input.value ?? '')
    let suppressingCommit = false
    const sync = () => {
      if (input.readOnly || input.classList.contains('sc-input--locked') || btn.disabled) {
        btn.hidden = true
        if (undoBtn) {
          undoBtn.disabled = true
          undoBtn.setAttribute('aria-disabled', 'true')
        }
        return
      }
      btn.hidden = String(input.value ?? '').length === 0
      if (undoBtn) {
        const canUndo =
          undoValue != null && String(input.value ?? '') !== undoValue
        undoBtn.disabled = !canUndo
        undoBtn.setAttribute('aria-disabled', canUndo ? 'false' : 'true')
      }
    }
    sync()
    syncAll.push(sync)
    input.addEventListener('input', sync)
    input.addEventListener('change', sync)
    if (undoMode === 'committed') {
      const commitIfValid = () => {
        if (suppressingCommit) return
        const v = normalizeNumberInput(input.value)
        if (!isRequiredNumber(v)) return
        if (v !== committed) {
          undoValue = committed
          committed = v
          input.value = v
          commitNumericLastGood(input)
        }
        sync()
      }
      input.addEventListener('change', commitIfValid)
      input.addEventListener('blur', commitIfValid)
    }
    btn.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      if (input.readOnly || input.classList.contains('sc-input--locked')) return
      if (undoMode === 'clear') {
        undoValue = String(input.value ?? '')
      }
      input.value = ''
      input.setCustomValidity('')
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
      sync()
      input.focus()
    })
    undoBtn?.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      if (undoValue == null || undoBtn.disabled) return
      const prev = undoValue
      suppressingCommit = true
      input.value = prev
      input.setCustomValidity('')
      if (undoMode === 'committed') {
        // 1つ前へ戻したあと、もう一度で直前値にトグル可
        undoValue = committed
        committed = prev
        commitNumericLastGood(input)
      } else {
        undoValue = null
      }
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
      suppressingCommit = false
      sync()
      input.focus()
    })
  })
  return () => {
    for (const sync of syncAll) sync()
  }
}

/**
 * 未定の座標項目を入力。緯度・経度が必要なときはマップクリックと数値入力が連動。
 * known は GPS などで既に確定した値。戻るで null。
 * mapRegister: フィールドは空開始。マップタップで緯度・経度・高度・住所をセットし、
 * 数値修正でピン移動＋住所再抽出。住所の手修正は確定値として採用。
 * gpsReview: マップ新規場所登録と同じ6値UI。GPS点を表示し、位置（マップ／緯度経度高度）は固定。
 */
function askMissingGeo(
  known: GeoParts,
  need: { lat: boolean; lng: boolean; alt: boolean },
  prefill?: { lat?: string; lng?: string; alt?: string },
  opts?: {
    lowAccuracy?: boolean
    pcManual?: boolean
    mapRegister?: boolean
    /** GPS現在地レビュー（geopick UI・位置固定） */
    gpsReview?: boolean
    /** マップ初期中心（フィールド初期値とは別。mapRegister 用） */
    mapCenter?: { lat: number; lng: number }
    /** gpsReview / mapRegister の住所・精度初期値 */
    extraPrefill?: { adrs?: string; posac?: string; altac?: string }
    /** 地図タイル: classic=従来 / detail=詳細縮小（既定 classic） */
    mapTiles?: GsiTileMode
    /** 見出し差し替え（離陸／着陸）。未指定は位置入力の従来文言 */
    titleLine?: string
  },
): Promise<LatLngAlt | null> {
  return new Promise((resolve) => {
    const root = openDialogRoot()
    const mapReg = !!opts?.mapRegister
    const gpsReview = !!opts?.gpsReview
    const geopick = mapReg || gpsReview
    const mapTiles: GsiTileMode = opts?.mapTiles ?? 'classic'
    const promptText = String(opts?.titleLine ?? '').trim() || gpsMissingPrompt(need, opts)
    const promptHtml = escapeHtml(promptText).replace(/\n/g, '<br/>')
    const showMap = need.lat && need.lng
    const fieldPrefill = mapReg ? {} : prefill
    const parts: string[] = []
    const fill = geopick
    if (need.lat) parts.push(geoFieldHtml('sc-lat', GPS_LABEL_LAT, fieldPrefill?.lat ?? '', { fill }))
    if (need.lng) parts.push(geoFieldHtml('sc-lng', GPS_LABEL_LNG, fieldPrefill?.lng ?? '', { fill }))
    if (need.alt) parts.push(geoFieldHtml('sc-alt', GPS_LABEL_ALT, fieldPrefill?.alt ?? '', { fill }))
    const accHtml = geopick
      ? `<div class="sc-geo-fields--geopick-acc">
          ${geoFieldHtml('sc-posac', GPS_LABEL_POSAC, opts?.extraPrefill?.posac ?? PLACE_DEFAULT_POSAC, { fill, undo: true, undoMode: 'committed' })}
          ${geoFieldHtml('sc-altac', GPS_LABEL_ALTAC, opts?.extraPrefill?.altac ?? PLACE_DEFAULT_ALTAC, { fill, undo: true, undoMode: 'committed' })}
        </div>`
      : ''
    const adrsHtml = geopick
      ? geoFieldHtml('sc-adrs', GPS_LABEL_ADRS, opts?.extraPrefill?.adrs ?? '', {
          fill: true,
          text: true,
          textUndo: true,
        })
      : ''
    const mapHtml = showMap
      ? `<div class="sc-map-pick-wrap">
          <div id="sc-map-pick" class="sc-map-pick" role="application" aria-label="位置選択マップ"></div>
          <p class="sc-map-hint" id="sc-map-hint">${
            gpsReview
              ? mapTiles === 'detail'
                ? 'GPS現在地（位置は変更できません・詳細タイル・拡大可）'
                : 'GPS現在地（位置は変更できません）'
              : mapReg
                ? mapTiles === 'detail'
                  ? 'タップで緯度・経度・高度・住所をセット（詳細タイル・拡大可）'
                  : 'タップで緯度・経度・高度・住所をセット'
                : 'マップをタップすると緯度・経度と地表標高をセット'
          }</p>
        </div>`
      : ''
    const fieldsHtml = geopick
      ? `<div class="sc-geo-fields--geopick">
          <div class="sc-geo-fields--geopick-nums">${parts.join('')}</div>
          ${accHtml}
          ${adrsHtml}
        </div>`
      : `<div class="sc-geo-fields${showMap ? ' sc-geo-fields--above-map' : ''}">${parts.join('')}</div>`
    const body = `${fieldsHtml}${mapHtml}`
    if (geopick) {
      // 全高flexは使わない。幅は CSS（100% / overflow-x）で画面に合わせる。
      root.classList.add('sc-dialog--geopick')
      const hint = gpsReview
        ? 'GPS現在地（位置は変更できません）'
        : 'タップで緯度・経度・高度・住所をセット'
      root.innerHTML = `
        <div class="sc-geopick-stack">
          <div class="sc-geopick-scroll sc-geopick-scroll--fill">
            <h1 class="prompt sc-geopick-title">${promptHtml}</h1>
            ${fieldsHtml}
            <div class="sc-geopick-map-block">
              <div id="sc-map-pick" class="sc-map-pick sc-map-pick--geopick" role="application" aria-label="位置選択マップ"></div>
              <p class="sc-map-hint" id="sc-map-hint">${hint}</p>
            </div>
          </div>
          <div class="sc-actions sc-geopick-actions">
            <button type="button" class="sc-btn sc-btn-ok" id="sc-ok">${escapeHtml(ITEM_OK)}</button>
            <button type="button" class="sc-btn sc-btn-back" id="sc-back">${escapeHtml(ITEM_BACK)}</button>
          </div>
        </div>`
    } else {
      root.innerHTML = dialogShell(
        promptHtml,
        body,
        dialogActions({ ok: true, back: true }),
      )
    }
    const refreshClearable = wireClearableInputs(root)

    const latEl = root.querySelector<HTMLInputElement>('#sc-lat')
    const lngEl = root.querySelector<HTMLInputElement>('#sc-lng')
    const altEl = root.querySelector<HTMLInputElement>('#sc-alt')
    const posacEl = root.querySelector<HTMLInputElement>('#sc-posac')
    const altacEl = root.querySelector<HTMLInputElement>('#sc-altac')
    const adrsEl = root.querySelector<HTMLInputElement>('#sc-adrs')
    const liveEl = root.querySelector<HTMLElement>('#sc-geo-live')
    const inputs = [latEl, lngEl, altEl, posacEl, altacEl].filter(
      (el): el is HTMLInputElement => !!el,
    )

    if (gpsReview) {
      for (const el of [latEl, lngEl, altEl]) {
        if (!el) continue
        el.readOnly = true
        el.classList.add('sc-input--locked')
        const wrap = el.closest('.sc-input-wrap')
        const clr = wrap?.querySelector<HTMLButtonElement>('.sc-input-clear')
        if (clr) {
          clr.hidden = true
          clr.disabled = true
        }
      }
    }

    let map: L.Map | undefined
    let marker: L.CircleMarker | undefined
    let syncing = false
    /** マップタップ由来の標高取得中は、手入力で上書きされないよう世代管理 */
    let elevReq = 0
    /** ポイント移動ごとの住所再抽出の世代管理 */
    let adrsReq = 0

    const parseField = (el: HTMLInputElement | null): number | undefined => {
      if (!el) return undefined
      const v = normalizeNumberInput(el.value)
      return isRequiredNumber(v) ? Number(v) : undefined
    }

    const updateLive = () => {
      if (!liveEl) return
      const lat = parseField(latEl) ?? known.lat
      const lng = parseField(lngEl) ?? known.lng
      const alt = parseField(altEl) ?? known.alt
      const fmt = (n: number | undefined, unit = '') =>
        n != null && Number.isFinite(n) ? `${n}${unit}` : '—'
      liveEl.textContent =
        `選択位置\n緯度 ${fmt(lat)}°\n経度 ${fmt(lng)}°\n高度 ${fmt(alt, 'm')}`
      liveEl.classList.toggle(
        'sc-geo-live--ready',
        lat != null && lng != null && alt != null,
      )
    }

    const setMarker = (lat: number, lng: number, pan: boolean) => {
      if (!map) return
      if (!marker) {
        marker = L.circleMarker([lat, lng], {
          radius: 9,
          color: '#1e5a78',
          fillColor: '#3d8fb5',
          fillOpacity: 0.9,
          weight: 2,
        }).addTo(map)
      } else {
        marker.setLatLng([lat, lng])
      }
      if (pan) map.panTo([lat, lng])
    }

    const applyLatLngToFields = (lat: number, lng: number) => {
      syncing = true
      if (latEl) {
        latEl.value = String(lat)
        latEl.setCustomValidity('')
      }
      if (lngEl) {
        lngEl.value = String(lng)
        lngEl.setCustomValidity('')
      }
      syncing = false
      refreshClearable()
      updateLive()
      if (latEl) commitNumericLastGood(latEl)
      if (lngEl) commitNumericLastGood(lngEl)
    }

    const syncMapFromFields = (pan = true) => {
      if (!map || syncing) return
      const lat = parseField(latEl)
      const lng = parseField(lngEl)
      if (lat == null || lng == null) return
      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return
      setMarker(lat, lng, pan)
      updateLive()
    }

    const mapHint = root.querySelector<HTMLElement>('#sc-map-hint')
    const defaultMapHint = gpsReview
      ? 'GPS現在地（位置は変更不可）'
      : mapReg
        ? 'タップで緯度・経度・高度・住所をセット'
        : 'タップで緯度・経度と標高をセット'

    const fetchElevation = async (
      lat: number,
      lng: number,
      mode: 'mapClick' | 'soft',
    ) => {
      if (!need.alt || !altEl) return
      const req = ++elevReq
      const prev = altEl.value
      if (mode === 'mapClick') {
        altEl.value = ''
        altEl.placeholder = '標高取得中…'
      } else {
        altEl.placeholder = '標高取得中…'
      }
      if (mapHint) mapHint.textContent = '標高を取得中…'
      refreshClearable()
      updateLive()
      const elev = await fetchGroundElevation(lat, lng)
      if (req !== elevReq) return
      altEl.placeholder = ''
      if (elev == null) {
        if (mapHint) {
          mapHint.textContent = NET_FAIL_ELEVATION
          mapHint.classList.add('net-fail')
        }
        refreshClearable()
        updateLive()
        return
      }
      if (mapHint) {
        mapHint.textContent = defaultMapHint
        mapHint.classList.remove('net-fail')
      }
      // マップタップ: 常に地表標高で確定。ソフト: 取得中に手入力されていなければ更新
      if (mode === 'mapClick' || altEl.value === prev || altEl.value === '') {
        altEl.value = String(roundAltMeters(elev))
        altEl.setCustomValidity('')
        commitNumericLastGood(altEl)
      }
      refreshClearable()
      updateLive()
    }

    /** ポイントが動いたら住所を再抽出（手修正は次のポイント移動まで保持） */
    const fetchAddress = async (lat: number, lng: number) => {
      if (!mapReg || !adrsEl) return
      const req = ++adrsReq
      adrsEl.placeholder = '住所取得中…'
      if (mapHint) {
        mapHint.textContent = '住所を取得中…'
        mapHint.classList.remove('net-fail')
      }
      const slowHint = window.setTimeout(() => {
        if (req !== adrsReq) return
        if (mapHint) {
          mapHint.textContent =
            '住所取得が遅いです…（後で手修正可）'
        }
      }, 3000)
      try {
        const geo = await reverseGeocode(lat, lng)
        if (req !== adrsReq) return
        adrsEl.placeholder = ''
        adrsEl.value = String(geo.address ?? '').trim()
        refreshClearable()
        if (!adrsEl.value) {
          if (mapHint) {
            mapHint.textContent = addressFailMessage(geo.status)
            mapHint.classList.add('net-fail')
          }
          return
        }
        if (mapHint) {
          mapHint.textContent = defaultMapHint
          mapHint.classList.remove('net-fail')
        }
      } finally {
        window.clearTimeout(slowHint)
      }
    }

    const onPointMoved = (lat: number, lng: number, elevMode: 'mapClick' | 'soft') => {
      if (gpsReview) return
      void fetchElevation(lat, lng, elevMode)
      void fetchAddress(lat, lng)
    }

    if (showMap) {
      const centerLat =
        opts?.mapCenter?.lat ??
        parseField(latEl) ??
        known.lat ??
        (isRequiredNumber(normalizeNumberInput(prefill?.lat ?? ''))
          ? Number(normalizeNumberInput(prefill!.lat!))
          : 39.672926)
      const centerLng =
        opts?.mapCenter?.lng ??
        parseField(lngEl) ??
        known.lng ??
        (isRequiredNumber(normalizeNumberInput(prefill?.lng ?? ''))
          ? Number(normalizeNumberInput(prefill!.lng!))
          : 140.122693)

      const mapEl = root.querySelector<HTMLDivElement>('#sc-map-pick')!
      const fitMapWidth = () => {
        if (!map) return
        fitGeopickMapHeight(map, mapEl, root)
      }
      if (geopick) {
        mapEl.style.width = '100%'
        mapEl.style.maxWidth = '100%'
      }
      // classic=従来 / detail=引いた表示は詳細、寄ると classic と同じタイル
      map = L.map(mapEl, {
        zoomControl: true,
        maxZoom: jpMapMaxZoom(mapTiles),
        // 上限を超えるピンチのバウンスで画面が消える／フラッシュするのを防ぐ
        bounceAtZoomLimits: false,
      }).setView([centerLat, centerLng], JP_MAP_VIEW_ZOOM)
      mountGsiLayers(map, mapTiles)

      // 初期フィールドに座標があるときだけピン表示（mapRegister は空なのでタップ待ち）
      if (parseField(latEl) != null && parseField(lngEl) != null) {
        setMarker(parseField(latEl)!, parseField(lngEl)!, false)
      }

      if (!gpsReview) {
        map.on('click', (e: L.LeafletMouseEvent) => {
          const { lat, lng } = e.latlng
          const latR = Math.round(lat * 1e8) / 1e8
          const lngR = Math.round(lng * 1e8) / 1e8
          applyLatLngToFields(latR, lngR)
          setMarker(latR, lngR, true)
          onPointMoved(latR, lngR, 'mapClick')
        })
      }

      requestAnimationFrame(() => fitMapWidth())
      setTimeout(() => fitMapWidth(), 100)
      setTimeout(() => fitMapWidth(), 300)
    }

    updateLive()

    let done = false
    const finish = (value: LatLngAlt | null) => {
      if (done) return
      done = true
      map?.remove()
      closeDialogSafely(root, () => resolve(value))
    }

    for (const el of inputs) {
      const lockedGps = gpsReview && (el === latEl || el === lngEl || el === altEl)
      if (!lockedGps) {
        wireNumericLastGoodRevert(el, () => {
          refreshClearable()
          updateLive()
          if (el === latEl || el === lngEl) syncMapFromFields(true)
        })
        commitNumericLastGood(el)
      }
      el.addEventListener('input', () => {
        if (gpsReview && (el === latEl || el === lngEl || el === altEl)) return
        const cleaned = sanitizeNumberDraft(el.value)
        if (cleaned !== el.value) el.value = cleaned
        el.setCustomValidity('')
        updateLive()
        if (!gpsReview && (el === latEl || el === lngEl)) syncMapFromFields(true)
      })
      el.addEventListener('change', () => {
        // 緯度経度を確定編集したら標高・住所も点に合わせて再取得
        if (gpsReview) return
        if (el !== latEl && el !== lngEl) return
        const lat = parseField(latEl)
        const lng = parseField(lngEl)
        if (lat == null || lng == null) return
        if (mapReg) onPointMoved(lat, lng, 'soft')
        else void fetchElevation(lat, lng, 'soft')
      })
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') confirm()
        if (e.key === 'Escape') finish(null)
      })
    }

    // 住所は手修正を許可（ポイント移動で再抽出されるまで保持）
    if (adrsEl) {
      adrsEl.addEventListener('input', () => {
        adrsEl.setCustomValidity('')
      })
      adrsEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') confirm()
        if (e.key === 'Escape') finish(null)
      })
    }

    const readRequired = (el: HTMLInputElement | null): number | null => {
      if (!el) return null
      const v = normalizeNumberInput(el.value)
      el.value = v
      if (!isRequiredNumber(v)) {
        el.setCustomValidity('数値を入力してください')
        el.reportValidity()
        return null
      }
      el.setCustomValidity('')
      return Number(v)
    }

    const confirm = () => {
      let lat = known.lat
      let lng = known.lng
      let alt = known.alt
      if (need.lat) {
        const v = readRequired(latEl)
        if (v === null) return
        lat = v
      }
      if (need.lng) {
        const v = readRequired(lngEl)
        if (v === null) return
        lng = v
      }
      if (need.alt) {
        const v = readRequired(altEl)
        if (v === null) return
        alt = v
      }
      if (!isFiniteNum(lat) || !isFiniteNum(lng) || !isFiniteNum(alt)) return
      let posac: string | undefined
      let altac: string | undefined
      if (geopick) {
        const p = readRequired(posacEl)
        if (p === null) return
        const a = readRequired(altacEl)
        if (a === null) return
        posac = String(p)
        altac = String(a)
      }
      let adrs: string | undefined
      if (geopick) {
        adrs = String(adrsEl?.value ?? '').trim()
        if (!adrs) {
          adrsEl?.setCustomValidity('住所を入力してください')
          adrsEl?.reportValidity()
          return
        }
        adrsEl?.setCustomValidity('')
      }
      finish({
        lat,
        lng,
        alt: roundAltMeters(alt),
        ...(geopick ? { adrs, posac, altac } : {}),
      })
    }

    root.querySelector('#sc-ok')!.addEventListener('click', confirm)
    root.querySelector('#sc-back')!.addEventListener('click', () => finish(null))
  })
}

function leafletDivIcon(kind: 'gps' | 'tap' | 'near'): L.DivIcon {
  const cls =
    kind === 'gps'
      ? 'sc-map-ico sc-map-ico--gps'
      : kind === 'near'
        ? 'sc-map-ico sc-map-ico--near'
        : 'sc-map-ico sc-map-ico--tap'
  // 塗り円統一: 同サイズ・中心アンカー（色のみで区別）
  const size = 16
  return L.divIcon({
    className: 'sc-leaflet-ico',
    html: `<div class="${cls}" aria-hidden="true"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

/** 住所などから場所名の初期候補（空白除去・20文字） */
function placeNamePrefill(raw: string): string {
  const t = String(raw ?? '')
    .trim()
    .replace(/\s+/g, '')
  if (!t) return '新規'
  return [...t].slice(0, 20).join('')
}

function escapeRegExpLiteral(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 場所名の検証（空・空白・長さ・重複） */
async function validatePlaceNameCandidate(
  raw: string,
  opts?: { allowExistingName?: string },
): Promise<{ ok: true; value: string } | { ok: false; err: string }> {
  const value = String(raw ?? '').trim()
  if (!value) return { ok: false, err: '場所名は空にできません' }
  if (/\s/.test(value)) return { ok: false, err: '空白は使えません' }
  if ([...value].length > 20) return { ok: false, err: '20文字以内にしてください' }
  const allow = String(opts?.allowExistingName ?? '').trim()
  if (allow && value === allow) return { ok: true, value }
  const exists = await getPlace(value)
  if (exists) return { ok: false, err: `同じ場所名があります: ${value}` }
  return { ok: true, value }
}

/** ボタン等向けに末尾を … で短縮（書記素単位） */
function ellipsizeText(raw: string, maxChars: number): string {
  const chars = [...String(raw ?? '').trim()]
  if (maxChars < 1) return ''
  if (chars.length <= maxChars) return chars.join('')
  if (maxChars === 1) return '…'
  return `${chars.slice(0, maxChars - 1).join('')}…`
}

/**
 * geopick 地図の高さを決める。
 * 余り高さを地図が埋めて確定ボタン直上まで寄せる。
 * キーボード表示で visualViewport が縮んでも、初回確定の高さを維持する。
 * 横画面では縦で決めたマップ高さを維持（画面はスクロール可）。
 */
function fitGeopickMapHeight(
  map: L.Map,
  mapEl: HTMLElement,
  root: ParentNode,
): void {
  const locked = Number(mapEl.dataset.geopickMapH || 0)
  const vv = window.visualViewport?.height
  const layoutH = window.innerHeight
  const layoutW = window.innerWidth
  const isLandscape = layoutW > layoutH
  const layoutKey = `${layoutW}x${Math.round(layoutH)}`
  const prevKey = mapEl.dataset.geopickLayoutKey || ''
  const layoutChanged = prevKey !== '' && prevKey !== layoutKey
  const keyboardOpen =
    vv != null && Number.isFinite(vv) && vv < layoutH - 72

  // キーボード表示中は高さ再計算せず（向き変更時は除く）
  if (keyboardOpen && locked > 0 && !layoutChanged) {
    applyGeopickMapPixelHeight(map, mapEl, locked)
    return
  }

  const block = root.querySelector<HTMLElement>('.sc-geopick-map-block')
  const hint = root.querySelector<HTMLElement>(
    '.sc-geopick-map-block .sc-map-hint, #sc-map-hint',
  )
  // フロアのみ。上限は画面の約半分まで広げ、マップ下の空きを無くす
  const floor = Math.round(Math.min(120, Math.max(88, layoutH * 0.12)))
  const ceil = Math.round(Math.min(layoutH * 0.52, 480))
  let h = floor
  if (block && block.clientHeight > 0) {
    const hintH = hint?.offsetHeight ?? 0
    h = Math.floor(block.clientHeight - hintH - 2)
  }
  h = Math.max(floor, Math.min(ceil, h))

  if (isLandscape && locked > 0) {
    // 横画面: 縦表示で確保した高さを維持（低くしない）
    h = locked
  } else if (isLandscape) {
    // 横で開いた場合も短辺基準にしない（長い辺の約45%）
    const longSide = Math.max(layoutW, layoutH)
    const landscapeTarget = Math.round(Math.min(longSide * 0.45, 480))
    h = Math.max(h, landscapeTarget)
  } else if (!layoutChanged && locked > 0) {
    // 縦・同一レイアウト: キーボード対策で拡大のみ
    h = Math.max(h, locked)
  }

  mapEl.dataset.geopickLayoutKey = layoutKey
  mapEl.dataset.geopickMapH = String(h)
  applyGeopickMapPixelHeight(map, mapEl, h)
}

function applyGeopickMapPixelHeight(
  map: L.Map,
  mapEl: HTMLElement,
  h: number,
): void {
  mapEl.style.cssText =
    `height:${h}px;min-height:${h}px;max-height:${h}px;width:100%;max-width:100%;overflow:hidden;box-sizing:border-box;flex:0 0 auto;`
  const c = map.getContainer()
  c.style.width = '100%'
  c.style.maxWidth = '100%'
  c.style.height = `${h}px`
  map.invalidateSize({ animate: false })
}

/**
 * %新規場所登録用: GPS（固定）＋タップ地点（移動可）の二重ポイント UI。
 * 確定値はタップ地点の緯度・経度・高度＋住所・精度。
 * placeRef: 既存場所の確認（緑＝登録地点・場所名表示＋POSAC 円）。確定で座標等を返す。
 */
function askDualPlaceGeo(opts: {
  gps: { lat: number; lng: number; alt: number }
  adrs?: string
  posac?: string
  altac?: string
  /** 場所欄の初期値 */
  name?: string
  /** 既存場所プレビュー（緑側・コピーボタンを場所名表示） */
  placeRef?: { name: string }
  /** 新規登録時のタイトル1行目。未指定は「新規場所データの登録」 */
  titleLine?: string
  /** 離陸・着陸。最寄の座標と精度円を同じ画面で直せる */
  flightSite?: boolean
}): Promise<DualPlaceGeoResult> {
  return new Promise((resolve) => {
    const root = openDialogRoot()
    root.classList.add('sc-dialog--geopick')
    const mapTiles: GsiTileMode = 'detail'
    const placeRefName = String(opts.placeRef?.name ?? '').trim()
    const isPlaceReview = !!placeRefName
    const flightSite = !!opts.flightSite && !isPlaceReview
    const gps = {
      lat: Math.round(opts.gps.lat * 1e8) / 1e8,
      lng: Math.round(opts.gps.lng * 1e8) / 1e8,
      alt: roundAltMeters(opts.gps.alt),
    }
    const placeWrapped = isPlaceReview ? `場所(${placeRefName})` : ''
    const titleLine1 = isPlaceReview
      ? PLACE_REVIEW_CONFIRM_LINE
      : String(opts.titleLine ?? '').trim() || PLACE_NEW_CONFIRM_LINE
    const refTitleLabel = isPlaceReview ? placeWrapped : '現在地(GPS)'
    const refIcoKind = isPlaceReview ? 'near' : 'gps'
    const refIcoClass = isPlaceReview
      ? 'sc-map-ico sc-map-ico--near sc-map-ico--inline'
      : 'sc-map-ico sc-map-ico--gps sc-map-ico--inline'
    // プレビュー: 緑＝場所(名前) / 橙＝タップ地点を戻す
    const refBtnLabel = isPlaceReview
      ? ellipsizeText(placeWrapped, 12)
      : '現在地(GPS)'
    const refBtnAria = isPlaceReview
      ? `${placeWrapped}をタップ地点へ`
      : PLACE_GPS_TO_POINT
    const undoBtnLabel = PLACE_PT_UNDO
    const undoBtnAria = PLACE_PT_UNDO
    const nearestTitleInit = placeNearestTitleLabel(null)
    const titleNearestHtml = isPlaceReview
      ? ''
      : `<span class="sc-geopick-title-line sc-geopick-title-line--near" id="sc-title-nearest"><span class="sc-geopick-title-ico" aria-hidden="true"><span class="sc-map-ico sc-map-ico--near sc-map-ico--inline"></span></span><span class="sc-geopick-title-near-text">最寄場所(<span class="sc-geopick-title-near-name" id="sc-title-nearest-name">${escapeHtml(nearestTitleInit.name)}</span>)</span><span class="sc-geopick-title-dist" id="sc-title-nearest-dist">${escapeHtml(nearestTitleInit.distPart)}</span></span>`
    const titleHtml = flightSite
      ? `<span class="sc-geopick-title-stack"><span class="sc-geopick-title-line sc-geopick-title-line--main">${escapeHtml(titleLine1)}</span></span>`
      : `<span class="sc-geopick-title-stack"><span class="sc-geopick-title-line sc-geopick-title-line--main">${escapeHtml(titleLine1)}</span><span class="sc-geopick-title-line sc-geopick-title-line--gps-tap"><span class="sc-geopick-title-ico" aria-hidden="true"><span class="${refIcoClass}"></span></span><span class="sc-geopick-title-label">${escapeHtml(refTitleLabel)}</span><span class="sc-geopick-title-pair sc-geopick-title-pair--tap"><span class="sc-map-ico sc-map-ico--tap sc-map-ico--inline" aria-hidden="true"></span>タップ地点</span></span>${titleNearestHtml}</span>`

    const mapIco = (kind: 'gps' | 'near' | 'tap') =>
      `<span class="sc-map-ico sc-map-ico--${kind} sc-map-ico--inline" aria-hidden="true"></span>`
    const flightBtn = (id: string, html: string, aria: string, kind: 'gps' | 'near' | 'tap') => {
      const cls =
        kind === 'gps'
          ? 'sc-btn-gps-copy'
          : kind === 'near'
            ? 'sc-btn-gps-copy sc-btn-gps-copy--near'
            : 'sc-btn-pt-undo'
      return `<button type="button" class="${cls} sc-flight-grid-btn" id="${id}" aria-label="${escapeHtml(aria)}">${html}</button>`
    }
    const flightHead = `<div class="sc-flight-head">
      <div class="sc-flight-top">
        <div class="sc-flight-points">
          <span class="sc-flight-point">${mapIco('gps')}<span>現在地点(GPS)</span></span>
          <span class="sc-flight-point">${mapIco('tap')}<span>タップ地点</span></span>
        </div>
        ${flightBtn('sc-regps', escapeHtml(FLIGHT_REGPS), FLIGHT_REGPS, 'gps')}
      </div>
      <div class="sc-flight-near-row">
        <span class="sc-flight-near-name">${mapIco('near')}<span>最寄地点(<span id="sc-title-nearest-name">${escapeHtml(nearestTitleInit.name)}</span>)</span></span>
        <span class="sc-flight-two-dist" id="sc-title-nearest-dist">${mapIco('near')}${mapIco('tap')}<span id="sc-title-nearest-dist-val">—</span></span>
      </div>
      <div class="sc-flight-grid">
        ${flightBtn('sc-near-move', `${mapIco('near')}へ${mapIco('tap')}をコピー`, FLIGHT_NEAR_MOVE, 'near')}
        ${flightBtn('sc-near-expand', `${mapIco('near')}位置精度拡大`, FLIGHT_NEAR_EXPAND, 'near')}
        ${flightBtn('sc-near-reset', `${mapIco('near')}初期値へ戻す`, FLIGHT_NEAR_RESET, 'near')}
      </div>
      <div class="sc-flight-grid">
        ${flightBtn('sc-copy-blue', `${mapIco('tap')}へ${mapIco('gps')}をコピー`, FLIGHT_TAP_FROM_GPS, 'tap')}
        ${flightBtn('sc-copy-near', `${mapIco('tap')}へ${mapIco('near')}をコピー`, FLIGHT_TAP_FROM_NEAR, 'tap')}
        ${flightBtn('sc-pt-undo', `${mapIco('tap')}１つ前へ戻す`, FLIGHT_TAP_UNDO, 'tap')}
      </div>
    </div>`
    const gpsNums = flightSite
      ? ''
      : [
      geoFieldHtml('sc-gps-lat', GPS_LABEL_LAT, String(gps.lat), {
        fill: true,
        labelHtml: dualGeoLabelHtml(refIcoKind, GPS_LABEL_LAT),
      }),
      geoFieldHtml('sc-gps-lng', GPS_LABEL_LNG, String(gps.lng), {
        fill: true,
        labelHtml: dualGeoLabelHtml(refIcoKind, GPS_LABEL_LNG),
      }),
      geoFieldHtml('sc-gps-alt', GPS_LABEL_ALT, String(gps.alt), {
        fill: true,
        labelHtml: dualGeoLabelHtml(refIcoKind, GPS_LABEL_ALT),
      }),
    ].join('')
    const ptNums = [
      geoFieldHtml('sc-lat', GPS_LABEL_LAT, String(gps.lat), {
        fill: true,
        labelHtml: dualGeoLabelHtml('tap', GPS_LABEL_LAT),
      }),
      geoFieldHtml('sc-lng', GPS_LABEL_LNG, String(gps.lng), {
        fill: true,
        labelHtml: dualGeoLabelHtml('tap', GPS_LABEL_LNG),
      }),
      geoFieldHtml('sc-alt', GPS_LABEL_ALT, String(gps.alt), {
        fill: true,
        labelHtml: dualGeoLabelHtml('tap', GPS_LABEL_ALT),
      }),
    ].join('')
    const initialName = String(opts.name ?? '').trim() || placeNamePrefill(opts.adrs ?? '')
    const refCopyBtnClass = isPlaceReview
      ? 'sc-btn-gps-copy sc-btn-gps-copy--near'
      : 'sc-btn-gps-copy'
    const accHtml = `<div class="sc-geo-fields--geopick-acc">
        ${geoFieldHtml('sc-posac', flightSite ? '位置精度m' : GPS_LABEL_POSAC, opts.posac ?? PLACE_DEFAULT_POSAC, { fill: true, undo: true, undoMode: 'committed', labelHtml: flightSite ? dualGeoLabelHtml('tap', '位置精度m') : undefined })}
        ${geoFieldHtml('sc-altac', flightSite ? '高度精度m' : GPS_LABEL_ALTAC, opts.altac ?? PLACE_DEFAULT_ALTAC, { fill: true, undo: true, undoMode: 'committed', labelHtml: flightSite ? dualGeoLabelHtml('tap', '高度精度m') : undefined })}
      </div>`
    const textHtml = `${geoFieldHtml('sc-adrs', GPS_LABEL_ADRS, opts.adrs ?? '', { fill: true, text: true, textUndo: true, labelHtml: flightSite ? dualGeoLabelHtml('tap', GPS_LABEL_ADRS) : undefined })}
      ${geoFieldHtml('sc-name', GPS_LABEL_NAME, initialName, { fill: true, text: true, textUndo: true, labelHtml: flightSite ? dualGeoLabelHtml('tap', GPS_LABEL_NAME) : undefined })}`
    const fieldsHtml = flightSite
      ? `<div class="sc-geo-fields--geopick">
      ${flightHead}
      <div class="sc-geo-fields--geopick-nums">${ptNums}</div>
      ${accHtml}
      ${textHtml}
    </div>`
      : `<div class="sc-geo-fields--geopick">
      <div class="sc-geo-fields--geopick-nums">${gpsNums}</div>
      <div class="sc-geo-fields--geopick-nums">${ptNums}</div>
      <div class="sc-geo-dual-btns">
        <button type="button" class="${refCopyBtnClass}" id="sc-gps-to-pt" aria-label="${escapeHtml(refBtnAria)}"><span class="${refIcoClass}" aria-hidden="true"></span><span class="sc-btn-gps-copy-label">${escapeHtml(refBtnLabel)}</span></button>
        <button type="button" class="sc-btn-pt-undo" id="sc-pt-undo" aria-label="${escapeHtml(undoBtnAria)}" disabled><span class="sc-map-ico sc-map-ico--tap sc-map-ico--inline" aria-hidden="true"></span><span class="sc-btn-gps-copy-label">${escapeHtml(undoBtnLabel)}</span></button>
      </div>
      ${accHtml}
      ${textHtml}
    </div>`

    const defaultMapHint = isPlaceReview
      ? `緑＝場所／橙＝タップ（精度円あり）`
      : '青＝GPS／橙＝登録／緑＝最寄（精度円あり）'

    root.innerHTML = `
      <div class="sc-geopick-stack">
        <div class="sc-geopick-scroll sc-geopick-scroll--fill">
          <h1 class="prompt sc-geopick-title">${titleHtml}</h1>
          ${fieldsHtml}
          <div class="sc-geopick-map-block">
            <div id="sc-map-pick" class="sc-map-pick sc-map-pick--geopick" role="application" aria-label="位置選択マップ"></div>
            <p class="sc-map-hint" id="sc-map-hint">${escapeHtml(defaultMapHint)}</p>
          </div>
        </div>
        <div class="sc-actions sc-geopick-actions${isPlaceReview ? ' sc-geopick-actions--triple' : ''}">
          <button type="button" class="sc-btn sc-btn-ok" id="sc-ok">${escapeHtml(ITEM_OK)}</button>
          ${
            isPlaceReview
              ? `<button type="button" class="sc-btn sc-btn-del" id="sc-del">${escapeHtml(PLACE_REVIEW_DEL)}</button>`
              : ''
          }
          <button type="button" class="sc-btn sc-btn-back" id="sc-back">${escapeHtml(ITEM_CANCEL)}</button>
        </div>
      </div>`

    const refreshClearable = wireClearableInputs(root)
    const gpsLatEl = root.querySelector<HTMLInputElement>('#sc-gps-lat')
    const gpsLngEl = root.querySelector<HTMLInputElement>('#sc-gps-lng')
    const gpsAltEl = root.querySelector<HTMLInputElement>('#sc-gps-alt')
    const latEl = root.querySelector<HTMLInputElement>('#sc-lat')!
    const lngEl = root.querySelector<HTMLInputElement>('#sc-lng')!
    const altEl = root.querySelector<HTMLInputElement>('#sc-alt')!
    const posacEl = root.querySelector<HTMLInputElement>('#sc-posac')!
    const altacEl = root.querySelector<HTMLInputElement>('#sc-altac')!
    const adrsEl = root.querySelector<HTMLInputElement>('#sc-adrs')!
    const nameEl = root.querySelector<HTMLInputElement>('#sc-name')!
    const mapHint = root.querySelector<HTMLElement>('#sc-map-hint')
    const titleNearestName = root.querySelector<HTMLElement>('#sc-title-nearest-name')
    const titleNearestDist = root.querySelector<HTMLElement>('#sc-title-nearest-dist')
    const titleNearestDistVal = root.querySelector<HTMLElement>('#sc-title-nearest-dist-val')
    const undoBtn = root.querySelector<HTMLButtonElement>('#sc-pt-undo')!
    let nameTouched = !!(opts.name?.trim() || isPlaceReview)
    /** 自動場所名: 円内=派生_xx / 円外=住所。手編集後は触らない */
    let autoPlaceNameKind: 'derived' | 'address' | null = null
    let autoPlaceNameReq = 0

    if (gpsLatEl && gpsLngEl && gpsAltEl) {
      for (const el of [gpsLatEl, gpsLngEl, gpsAltEl]) {
        el.readOnly = true
        el.classList.add('sc-input--locked')
        const clr = el.closest('.sc-input-wrap')?.querySelector<HTMLButtonElement>('.sc-input-clear')
        if (clr) {
          clr.hidden = true
          clr.disabled = true
        }
      }
    }

    type PtSnap = { lat: number; lng: number; alt: number; adrs: string }
    let undoSnap: PtSnap | null = null
    let preEditSnap: PtSnap | null = null
    let map: L.Map | undefined
    let ptMarker: L.Marker | undefined
    let ptCircle: L.Circle | undefined
    let nearMarker: L.Marker | undefined
    let nearCircle: L.Circle | undefined
    let nearCenter: L.LatLng | null = null
    /** 精度円専用（padding 大）。既定 SVG だとパン後や端付近で円全体がクリップされ消えることがある */
    let nearRenderer: L.SVG | undefined
    let placesCache: Array<PlaceRecord & { name: string }> = []
    let syncing = false
    let elevReq = 0
    let adrsReq = 0

    const parseField = (el: HTMLInputElement | null): number | undefined => {
      if (!el) return undefined
      const v = normalizeNumberInput(el.value)
      return isRequiredNumber(v) ? Number(v) : undefined
    }

    const readPosacM = (): number => {
      const posac = parseField(posacEl)
      return posac != null && posac > 0 ? posac : Number(PLACE_DEFAULT_POSAC)
    }

    const syncNearIconVisibility = () => {
      if (!map || !nearMarker || !nearCenter) return
      // 地理 bounds よりコンテナ座標の方が「画面に見えている」判定に近い
      const pt = map.latLngToContainerPoint(nearCenter)
      const size = map.getSize()
      const pad = 8
      const visible =
        pt.x >= -pad && pt.y >= -pad && pt.x <= size.x + pad && pt.y <= size.y + pad
      const el = nearMarker.getElement()
      if (el) el.style.display = visible ? '' : 'none'
      nearMarker.setOpacity(visible ? 1 : 0)
    }

    const redrawNearCircle = () => {
      if (ptCircle) ptCircle.redraw()
      if (nearCircle) {
        nearCircle.redraw()
        nearCircle.bringToFront()
      }
      if (ptCircle) ptCircle.bringToFront()
      if (ptMarker) ptMarker.setZIndexOffset(600)
      if (nearMarker) nearMarker.setZIndexOffset(650)
      syncNearIconVisibility()
    }

    const clearNearOverlay = () => {
      if (nearMarker) {
        nearMarker.remove()
        nearMarker = undefined
      }
      if (nearCircle) {
        nearCircle.remove()
        nearCircle = undefined
      }
      nearCenter = null
    }

    const setNearOverlay = (lat: number, lng: number, posacM: number) => {
      if (!map) return
      const radius = Number.isFinite(posacM) && posacM > 0 ? posacM : Number(PLACE_DEFAULT_POSAC)
      nearCenter = L.latLng(lat, lng)
      if (!nearRenderer) {
        nearRenderer = L.svg({ padding: 1 })
      }
      // setLatLng だけだと SVG クリップ状態が残ることがあるため作り直す
      if (nearCircle) {
        nearCircle.remove()
        nearCircle = undefined
      }
      nearCircle = L.circle(nearCenter, {
        radius,
        color: '#2ecc71',
        weight: 2,
        opacity: 0.8,
        fillColor: '#2ecc71',
        fillOpacity: 0.2,
        interactive: false,
        renderer: nearRenderer,
      }).addTo(map)
      if (!nearMarker) {
        nearMarker = L.marker(nearCenter, {
          icon: leafletDivIcon('near'),
          interactive: false,
          zIndexOffset: 650,
        }).addTo(map)
      } else {
        nearMarker.setLatLng(nearCenter)
        nearMarker.setZIndexOffset(650)
      }
      redrawNearCircle()
    }

    /** タップ地点（橙）: 画面の位置精度mを半径とする円 */
    const setPtAccuracyCircle = (lat: number, lng: number) => {
      if (!map) return
      const radius = readPosacM()
      if (!nearRenderer) {
        nearRenderer = L.svg({ padding: 1 })
      }
      if (ptCircle) {
        ptCircle.remove()
        ptCircle = undefined
      }
      ptCircle = L.circle([lat, lng], {
        radius,
        color: '#ff7a3d',
        weight: 2,
        opacity: 0.8,
        fillColor: '#ff7a3d',
        fillOpacity: 0.16,
        interactive: false,
        renderer: nearRenderer,
      }).addTo(map)
      redrawNearCircle()
    }

    /** 場所修正: 登録地点の POSAC 円をフォーム値で更新 */
    const syncPlaceReviewOverlay = () => {
      if (!isPlaceReview) return
      setNearOverlay(gps.lat, gps.lng, readPosacM())
    }

    /**
     * %現在地検索相当の場所名自動入力。
     * 最寄の POSAC 円内 → 派生名（場所_xx）、円外／無ヒット → 住所由来。
     * ユーザーが場所欄を手編集したあとは更新しない。
     */
    const applyAutoPlaceName = async (
      hit: {
        name: string
        distHoriz: number
        place: { POSAC?: string }
      } | null,
    ) => {
      if (flightSite || nameTouched || isPlaceReview) return
      const req = ++autoPlaceNameReq
      const inside = !!hit && isInsideNearestPosac(hit, Number(PLACE_DEFAULT_POSAC))
      if (inside && hit) {
        const stem = String(hit.name).replace(/_\d+$/, '').trim() || '新規'
        const cur = String(nameEl.value ?? '').trim()
        // 同一ステムの派生名が既にあれば連番の付け替えを避ける
        if (
          autoPlaceNameKind === 'derived' &&
          new RegExp(`^${escapeRegExpLiteral(stem)}_\\d+$`).test(cur)
        ) {
          return
        }
        const derived = await nextDerivedPlaceName(hit.name)
        if (req !== autoPlaceNameReq || nameTouched) return
        nameEl.value = derived
        autoPlaceNameKind = 'derived'
        refreshClearable()
        return
      }
      const fromAdrs = placeNamePrefill(adrsEl.value)
      if (req !== autoPlaceNameReq || nameTouched) return
      nameEl.value = fromAdrs
      autoPlaceNameKind = 'address'
      refreshClearable()
    }

    /** 離陸・着陸: 画面上だけで直している最寄場所。確定で円内ならマスタへ書く */
    type NearDraft = {
      name: string
      lat: number
      lng: number
      alt: number
      adrs: string
      posac: number
      altac: string
      baseLat: number
      baseLng: number
      baseAlt: number
      basePosac: number
      baseAdrs: string
    }
    let nearDraft: NearDraft | null = null
    let greenEdit: 'none' | 'copy' | 'expand' = 'none'
    let lastMapAdrs = String(opts.adrs ?? '').trim()
    let derivedName = ''
    let derivedStem = ''
    let adrsManual = false
    let nameManual = false
    let syncingText = false
    const nearAdjustEl = root.querySelector<HTMLElement>('#sc-near-adjust')
    const nearPosacEl = root.querySelector<HTMLInputElement>('#sc-near-posac')
    const nearMoveBtn = root.querySelector<HTMLButtonElement>('#sc-near-move')
    const nearExpandBtn = root.querySelector<HTMLButtonElement>('#sc-near-expand')
    const nearResetBtn = root.querySelector<HTMLButtonElement>('#sc-near-reset')

    const nearDirty = (): boolean => {
      if (!nearDraft) return false
      const same = (a: number, b: number, eps: number) => Math.abs(a - b) <= eps
      return !(
        same(nearDraft.lat, nearDraft.baseLat, 1e-8) &&
        same(nearDraft.lng, nearDraft.baseLng, 1e-8) &&
        same(nearDraft.alt, nearDraft.baseAlt, 0.05) &&
        same(nearDraft.posac, nearDraft.basePosac, 0.05)
      )
    }

    const twoPointMeters = (): number | null => {
      if (!nearDraft) return null
      const lat = parseField(latEl)
      const lng = parseField(lngEl)
      const alt = parseField(altEl) ?? (Number.isFinite(gps.alt) ? gps.alt : null)
      if (lat == null || lng == null || alt == null) return null
      return ecefDistanceM(lat, lng, alt, nearDraft.lat, nearDraft.lng, nearDraft.alt)
    }
    const twoPointFar = (): boolean => {
      const dist = twoPointMeters()
      return dist != null && dist >= 100
    }
    const copyLocked = (): boolean => twoPointFar() || greenEdit === 'expand'
    const expandLocked = (): boolean => twoPointFar() || greenEdit === 'copy'

    const syncNearButtons = () => {
      if (nearAdjustEl) nearAdjustEl.hidden = !nearDraft
      if (nearMoveBtn) nearMoveBtn.disabled = !nearDraft || copyLocked()
      if (nearExpandBtn) nearExpandBtn.disabled = !nearDraft || expandLocked()
      if (nearResetBtn) nearResetBtn.disabled = !nearDraft || greenEdit === 'none' || twoPointFar()
      const copyNearBtn = root.querySelector<HTMLButtonElement>('#sc-copy-near')
      if (copyNearBtn) copyNearBtn.disabled = !nearDraft
    }

    const flightRelation = (): 'none' | 'inside' | 'touch-out' | 'apart' => {
      if (!nearDraft) return 'none'
      const lat = parseField(latEl)
      const lng = parseField(lngEl)
      if (lat == null || lng == null) return 'none'
      const dist = haversineM(lat, lng, nearDraft.lat, nearDraft.lng)
      if (dist < nearDraft.posac) return 'inside'
      if (dist <= readPosacM() + nearDraft.posac) return 'touch-out'
      return 'apart'
    }

    const applyFlightText = (el: HTMLInputElement, value: string) => {
      syncingText = true
      el.value = value
      syncingText = false
      refreshClearable()
    }

    const syncFlightFields = async () => {
      if (!flightSite) return
      syncNearButtons()
      const rel = flightRelation()
      if (!adrsManual) {
        applyFlightText(adrsEl, rel === 'inside' ? (nearDraft?.adrs ?? '') : lastMapAdrs)
      }
      if (nameManual) return
      if (rel === 'inside' && nearDraft) {
        derivedStem = ''
        derivedName = ''
        applyFlightText(nameEl, nearDraft.name)
        return
      }
      if (rel === 'touch-out' && nearDraft) {
        const stem = nearDraft.name.replace(/_\d+$/, '').trim() || '新規'
        if (derivedStem !== stem || !derivedName) {
          derivedStem = stem
          derivedName = await nextDerivedPlaceName(nearDraft.name)
        }
        applyFlightText(nameEl, derivedName)
        return
      }
      derivedStem = ''
      derivedName = ''
      applyFlightText(nameEl, placeNamePrefill(lastMapAdrs))
    }

    /** タップ地点（橙）更新のたび、キャッシュ上で ECEF 3D 最短を再検出 */
    const refreshNearest = () => {
      if (isPlaceReview) return
      const updateTitle = (hit: { name: string; dist3d: number } | null) => {
        const parts = placeNearestTitleLabel(hit)
        if (titleNearestName) titleNearestName.textContent = parts.name
        if (flightSite && titleNearestDistVal) {
          titleNearestDistVal.textContent = hit ? formatTwoPointDistance(hit.dist3d) : '—'
        } else if (titleNearestDist) {
          titleNearestDist.textContent = parts.distPart
        }
      }
      const lat = parseField(latEl)
      const lng = parseField(lngEl)
      // 標高取得中はフィールド空になるため GPS 高度で暫定照合
      const alt = parseField(altEl) ?? (Number.isFinite(gps.alt) ? gps.alt : undefined)
      if (lat == null || lng == null || alt == null) {
        updateTitle(null)
        nearDraft = null
        greenEdit = 'none'
        syncNearButtons()
        clearNearOverlay()
        if (flightSite) void syncFlightFields()
        else void applyAutoPlaceName(null)
        return
      }
      const hit = closestPlace3dFromList(placesCache, lat, lng, alt)
      if (!hit) {
        updateTitle(null)
        nearDraft = null
        greenEdit = 'none'
        syncNearButtons()
        clearNearOverlay()
        if (flightSite) void syncFlightFields()
        else void applyAutoPlaceName(null)
        return
      }
      if (flightSite) {
        if (!nearDraft || nearDraft.name !== hit.name) {
          const posacRaw = parsePlaceCoord(hit.place.POSAC)
          const posacM =
            Number.isFinite(posacRaw) && posacRaw > 0 ? posacRaw : Number(PLACE_DEFAULT_POSAC)
          const palt = parsePlaceCoord(hit.place.DATA3)
          const altN = Number.isFinite(palt) ? roundAltMeters(palt) : alt
          greenEdit = 'none'
          derivedStem = ''
          derivedName = ''
          nearDraft = {
            name: hit.name,
            lat: hit.plat,
            lng: hit.plng,
            alt: altN,
            adrs: String(hit.place.ADRS ?? '').trim(),
            posac: posacM,
            altac: String(hit.place.ALTAC ?? '').trim() || PLACE_DEFAULT_ALTAC,
            baseLat: hit.plat,
            baseLng: hit.plng,
            baseAlt: altN,
            basePosac: posacM,
            baseAdrs: String(hit.place.ADRS ?? '').trim(),
          }
        }
        const dist3d = ecefDistanceM(lat, lng, alt, nearDraft.lat, nearDraft.lng, nearDraft.alt)
        updateTitle({ name: nearDraft.name, dist3d })
        setNearOverlay(nearDraft.lat, nearDraft.lng, nearDraft.posac)
        void syncFlightFields()
        return
      }
      updateTitle(hit ? { name: hit.name, dist3d: hit.dist3d } : null)
      const posac = parsePlaceCoord(hit.place.POSAC)
      const posacM = Number.isFinite(posac) && posac > 0 ? posac : Number(PLACE_DEFAULT_POSAC)
      setNearOverlay(hit.plat, hit.plng, posacM)
      void applyAutoPlaceName(hit)
    }

    const readPtSnap = (): PtSnap | null => {
      const lat = parseField(latEl)
      const lng = parseField(lngEl)
      const alt = parseField(altEl)
      if (lat == null || lng == null || alt == null) return null
      return { lat, lng, alt, adrs: String(adrsEl.value ?? '').trim() }
    }

    const setUndoEnabled = () => {
      undoBtn.disabled = !undoSnap
    }

    const rememberUndoFrom = (snap: PtSnap | null) => {
      if (!snap) return
      undoSnap = snap
      setUndoEnabled()
    }

    const setPtMarker = (lat: number, lng: number, pan: boolean) => {
      if (!map) return
      if (!ptMarker) {
        ptMarker = L.marker([lat, lng], { icon: leafletDivIcon('tap'), zIndexOffset: 600 }).addTo(map)
      } else {
        ptMarker.setLatLng([lat, lng])
      }
      setPtAccuracyCircle(lat, lng)
      if (pan) map.panTo([lat, lng])
    }

    const applyPtLatLng = (lat: number, lng: number) => {
      syncing = true
      latEl.value = String(lat)
      lngEl.value = String(lng)
      latEl.setCustomValidity('')
      lngEl.setCustomValidity('')
      syncing = false
      refreshClearable()
      commitNumericLastGood(latEl)
      commitNumericLastGood(lngEl)
    }

    const applyPtSnap = (snap: PtSnap, pan: boolean) => {
      applyPtLatLng(snap.lat, snap.lng)
      altEl.value = String(snap.alt)
      altEl.setCustomValidity('')
      commitNumericLastGood(altEl)
      adrsEl.value = snap.adrs
      setPtMarker(snap.lat, snap.lng, pan)
      refreshClearable()
    }

    const fetchElevation = async (lat: number, lng: number, mode: 'mapClick' | 'soft') => {
      const req = ++elevReq
      const prev = altEl.value
      if (mode === 'mapClick') {
        altEl.value = ''
        altEl.placeholder = '標高取得中…'
      } else {
        altEl.placeholder = '標高取得中…'
      }
      if (mapHint) mapHint.textContent = '標高を取得中…'
      refreshClearable()
      const elev = await fetchGroundElevation(lat, lng)
      if (req !== elevReq) return
      altEl.placeholder = ''
      if (elev == null) {
        if (mapHint) {
          mapHint.textContent = NET_FAIL_ELEVATION
          mapHint.classList.add('net-fail')
        }
        refreshClearable()
        return
      }
      if (mapHint) {
        mapHint.textContent = defaultMapHint
        mapHint.classList.remove('net-fail')
      }
      if (mode === 'mapClick' || altEl.value === prev || altEl.value === '') {
        altEl.value = String(roundAltMeters(elev))
        altEl.setCustomValidity('')
        commitNumericLastGood(altEl)
      }
      refreshClearable()
      refreshNearest()
    }

    const fetchAddress = async (lat: number, lng: number) => {
      const req = ++adrsReq
      adrsEl.placeholder = '住所取得中…'
      if (mapHint) {
        mapHint.textContent = '住所を取得中…'
        mapHint.classList.remove('net-fail')
      }
      const slowHint = window.setTimeout(() => {
        if (req !== adrsReq) return
        if (mapHint) {
          mapHint.textContent =
            '住所取得が遅いです…（後で手修正可）'
        }
      }, 3000)
      try {
        const geo = await reverseGeocode(lat, lng)
        if (req !== adrsReq) return
        adrsEl.placeholder = ''
        const mapped = String(geo.address ?? '').trim()
        if (flightSite) {
          lastMapAdrs = mapped
          void syncFlightFields()
        } else {
          adrsEl.value = mapped
          if (!nameTouched && adrsEl.value && autoPlaceNameKind !== 'derived') {
            nameEl.value = placeNamePrefill(adrsEl.value)
            autoPlaceNameKind = 'address'
          }
          refreshClearable()
        }
        if (!(flightSite ? lastMapAdrs : adrsEl.value)) {
          if (mapHint) {
            mapHint.textContent = addressFailMessage(geo.status)
            mapHint.classList.add('net-fail')
          }
          return
        }
        if (mapHint) {
          mapHint.textContent = defaultMapHint
          mapHint.classList.remove('net-fail')
        }
      } finally {
        window.clearTimeout(slowHint)
      }
    }

    const onPointMoved = (lat: number, lng: number, elevMode: 'mapClick' | 'soft') => {
      void fetchElevation(lat, lng, elevMode)
      void fetchAddress(lat, lng)
    }

    const copyGpsToPoint = () => {
      rememberUndoFrom(readPtSnap())
      applyPtLatLng(gps.lat, gps.lng)
      altEl.value = String(gps.alt)
      altEl.setCustomValidity('')
      commitNumericLastGood(altEl)
      setPtMarker(gps.lat, gps.lng, true)
      refreshClearable()
      refreshNearest()
      void fetchAddress(gps.lat, gps.lng)
    }

    const undoPoint = () => {
      if (!undoSnap) return
      const snap = undoSnap
      undoSnap = null
      setUndoEnabled()
      if (flightSite) {
        applyPtLatLng(snap.lat, snap.lng)
        altEl.value = String(snap.alt)
        altEl.setCustomValidity('')
        commitNumericLastGood(altEl)
        setPtMarker(snap.lat, snap.lng, true)
        refreshClearable()
        refreshNearest()
        onPointMoved(snap.lat, snap.lng, 'mapClick')
        return
      }
      elevReq++
      adrsReq++
      applyPtSnap(snap, true)
      refreshNearest()
      if (mapHint) {
        mapHint.textContent = defaultMapHint
        mapHint.classList.remove('net-fail')
      }
    }

    const mapEl = root.querySelector<HTMLDivElement>('#sc-map-pick')!
    map = L.map(mapEl, {
      zoomControl: true,
      maxZoom: jpMapMaxZoom(mapTiles),
      bounceAtZoomLimits: false,
    }).setView([gps.lat, gps.lng], JP_MAP_VIEW_ZOOM)
    mountGsiLayers(map, mapTiles)
    let gpsMarker: L.Marker | undefined
    const remeasureGps = async () => {
      if (!flightSite) return
      try {
        const pos = await getCurrentPosition()
        const c = pos.coords
        if (!isFiniteNum(c.latitude) || !isFiniteNum(c.longitude)) return
        const round8 = (n: number) => Math.round(n * 1e8) / 1e8
        gps.lat = round8(c.latitude)
        gps.lng = round8(c.longitude)
        const elev = await fetchGroundElevation(gps.lat, gps.lng)
        if (elev != null) gps.alt = roundAltMeters(elev)
        gpsMarker?.setLatLng([gps.lat, gps.lng])
        copyGpsToPoint()
      } catch {
        if (mapHint) {
          mapHint.textContent = 'GPSを取得できません'
          mapHint.classList.add('net-fail')
        }
      }
    }
    if (isPlaceReview) {
      syncPlaceReviewOverlay()
    } else {
      gpsMarker = L.marker([gps.lat, gps.lng], {
        icon: leafletDivIcon('gps'),
        interactive: false,
        zIndexOffset: 400,
      }).addTo(map)
    }
    setPtMarker(gps.lat, gps.lng, false)
    map.on('moveend', redrawNearCircle)
    map.on('zoomend', redrawNearCircle)
    if (!isPlaceReview) {
      void listPlaces().then((rows) => {
        placesCache = rows
        refreshNearest()
      })
    }

    map.on('click', (e: L.LeafletMouseEvent) => {
      rememberUndoFrom(readPtSnap())
      const latR = Math.round(e.latlng.lat * 1e8) / 1e8
      const lngR = Math.round(e.latlng.lng * 1e8) / 1e8
      applyPtLatLng(latR, lngR)
      setPtMarker(latR, lngR, true)
      refreshNearest()
      onPointMoved(latR, lngR, 'mapClick')
    })

    const fitMap = () => {
      if (!map) return
      fitGeopickMapHeight(map, mapEl, root)
      // 向き変更でコンテナ寸法が変わってもタップ地点が画面中央になるよう再寄せ
      const lat = parseField(latEl)
      const lng = parseField(lngEl)
      if (lat != null && lng != null && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        map.setView([lat, lng], map.getZoom(), { animate: false })
      }
      redrawNearCircle()
    }
    /** キーボード開閉では高さ固定。向き変更などは window.resize で再計測 */
    const onWindowResize = () => fitMap()
    const onVisualViewport = () => {
      if (!map) return
      const locked = Number(mapEl.dataset.geopickMapH || 0)
      const layoutKey = `${window.innerWidth}x${Math.round(window.innerHeight)}`
      const layoutChanged =
        !!mapEl.dataset.geopickLayoutKey &&
        mapEl.dataset.geopickLayoutKey !== layoutKey
      const vv = window.visualViewport?.height
      const keyboardOpen =
        vv != null && Number.isFinite(vv) && vv < window.innerHeight - 72
      if (keyboardOpen && locked > 0 && !layoutChanged) {
        applyGeopickMapPixelHeight(map, mapEl, locked)
        return
      }
      fitMap()
    }
    const onOrientation = () => {
      // iOS は orientationchange 直後は寸法が古いことがある
      window.setTimeout(fitMap, 50)
      window.setTimeout(fitMap, 200)
      window.setTimeout(fitMap, 400)
    }
    requestAnimationFrame(() => fitMap())
    setTimeout(() => fitMap(), 80)
    setTimeout(() => fitMap(), 250)
    window.addEventListener('resize', onWindowResize)
    window.addEventListener('orientationchange', onOrientation)
    window.visualViewport?.addEventListener('resize', onVisualViewport)

    const gpsToPt = root.querySelector('#sc-gps-to-pt')
    gpsToPt?.addEventListener('click', () => {
      copyGpsToPoint()
    })
    root.querySelector('#sc-regps')?.addEventListener('click', () => {
      void remeasureGps()
    })
    root.querySelector('#sc-copy-blue')?.addEventListener('click', () => {
      copyGpsToPoint()
    })
    root.querySelector('#sc-copy-near')?.addEventListener('click', () => {
      if (!nearDraft) return
      rememberUndoFrom(readPtSnap())
      applyPtLatLng(nearDraft.lat, nearDraft.lng)
      altEl.value = String(nearDraft.alt)
      altEl.setCustomValidity('')
      commitNumericLastGood(altEl)
      setPtMarker(nearDraft.lat, nearDraft.lng, true)
      refreshClearable()
      refreshNearest()
      void fetchAddress(nearDraft.lat, nearDraft.lng)
    })
    undoBtn.addEventListener('click', () => {
      undoPoint()
    })
    if (flightSite && nearPosacEl) {
      wireNumericLastGoodRevert(nearPosacEl, () => {
        refreshClearable()
        refreshNearest()
      })
      nearPosacEl.addEventListener('change', () => {
        if (!nearDraft) return
        const v = parseField(nearPosacEl)
        if (v == null || v <= 0) return
        nearDraft.posac = v
        refreshNearest()
      })
    }
    nearMoveBtn?.addEventListener('click', () => {
      if (!nearDraft || copyLocked()) return
      const lat = parseField(latEl)
      const lng = parseField(lngEl)
      const alt = parseField(altEl)
      if (lat == null || lng == null || alt == null) return
      nearDraft.lat = lat
      nearDraft.lng = lng
      nearDraft.alt = roundAltMeters(alt)
      greenEdit = 'copy'
      refreshNearest()
    })
    nearExpandBtn?.addEventListener('click', () => {
      if (!nearDraft || expandLocked()) return
      const lat = parseField(latEl)
      const lng = parseField(lngEl)
      if (lat == null || lng == null) return
      const dist = haversineM(lat, lng, nearDraft.lat, nearDraft.lng)
      nearDraft.posac = Math.max(nearDraft.posac, dist)
      greenEdit = 'expand'
      refreshNearest()
    })
    nearResetBtn?.addEventListener('click', () => {
      if (!nearDraft || greenEdit === 'none' || twoPointFar()) return
      nearDraft.lat = nearDraft.baseLat
      nearDraft.lng = nearDraft.baseLng
      nearDraft.alt = nearDraft.baseAlt
      nearDraft.posac = nearDraft.basePosac
      greenEdit = 'none'
      refreshNearest()
    })

    const syncPtMarkerFromFields = () => {
      const lat = parseField(latEl)
      const lng = parseField(lngEl)
      if (lat != null && lng != null && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        setPtMarker(lat, lng, true)
      }
    }

    for (const el of [latEl, lngEl, altEl, posacEl, altacEl]) {
      wireNumericLastGoodRevert(el, () => {
        refreshClearable()
        if (el === latEl || el === lngEl) syncPtMarkerFromFields()
      })
      commitNumericLastGood(el)
      el.addEventListener('focus', () => {
        if (el === latEl || el === lngEl || el === altEl) {
          preEditSnap = readPtSnap()
        }
      })
      el.addEventListener('input', () => {
        const cleaned = sanitizeNumberDraft(el.value)
        if (cleaned !== el.value) el.value = cleaned
        el.setCustomValidity('')
        if (!syncing && (el === latEl || el === lngEl)) {
          const lat = parseField(latEl)
          const lng = parseField(lngEl)
          if (lat != null && lng != null && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
            setPtMarker(lat, lng, true)
          }
        }
      })
      el.addEventListener('change', () => {
        if (el === posacEl) {
          if (isPlaceReview) syncPlaceReviewOverlay()
          const lat = parseField(latEl)
          const lng = parseField(lngEl)
          if (lat != null && lng != null && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
            setPtAccuracyCircle(lat, lng)
          }
          if (flightSite) refreshNearest()
          return
        }
        if (el !== latEl && el !== lngEl && el !== altEl) return
        const lat = parseField(latEl)
        const lng = parseField(lngEl)
        const alt = parseField(altEl)
        if (lat == null || lng == null) return
        const changed =
          !preEditSnap ||
          preEditSnap.lat !== lat ||
          preEditSnap.lng !== lng ||
          (alt != null && preEditSnap.alt !== alt)
        if (changed && preEditSnap) rememberUndoFrom(preEditSnap)
        preEditSnap = null
        if (el === latEl || el === lngEl) onPointMoved(lat, lng, 'soft')
        refreshNearest()
      })
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') confirm()
        if (e.key === 'Escape') finish(null)
      })
    }
    adrsEl.addEventListener('input', () => adrsEl.setCustomValidity(''))
    adrsEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') void confirm()
      if (e.key === 'Escape') finish(null)
    })
    nameEl.addEventListener('input', () => {
      if (nameEl.readOnly) return
      nameTouched = true
      nameEl.setCustomValidity('')
      const clipped = [...String(nameEl.value ?? '')].slice(0, 20).join('')
      if (clipped !== nameEl.value) nameEl.value = clipped
      refreshClearable()
    })
    nameEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') void confirm()
      if (e.key === 'Escape') finish(null)
    })

    let done = false
    const finish = (value: DualPlaceGeoResult) => {
      if (done) return
      done = true
      window.removeEventListener('resize', onWindowResize)
      window.removeEventListener('orientationchange', onOrientation)
      window.visualViewport?.removeEventListener('resize', onVisualViewport)
      map?.remove()
      closeDialogSafely(root, () => resolve(value))
    }

    const readRequired = (el: HTMLInputElement): number | null => {
      const v = normalizeNumberInput(el.value)
      el.value = v
      if (!isRequiredNumber(v)) {
        el.setCustomValidity('数値を入力してください')
        el.reportValidity()
        return null
      }
      el.setCustomValidity('')
      return Number(v)
    }

    const bindFlightRestore = (el: HTMLInputElement, kind: 'adrs' | 'name') => {
      const btn = el.closest('.sc-input-wrap')?.querySelector<HTMLButtonElement>('.sc-input-undo')
      btn?.addEventListener(
        'click',
        (ev) => {
          if (!flightSite) return
          ev.stopPropagation()
          ev.preventDefault()
          if (kind === 'adrs') adrsManual = false
          else {
            nameManual = false
            nameTouched = false
          }
          void syncFlightFields()
        },
        true,
      )
    }
    adrsEl.addEventListener('input', () => {
      if (flightSite && !syncingText) adrsManual = true
    })
    nameEl.addEventListener('input', () => {
      if (flightSite && !syncingText) {
        nameManual = true
        nameTouched = true
      }
    })
    if (flightSite) {
      bindFlightRestore(adrsEl, 'adrs')
      bindFlightRestore(nameEl, 'name')
    }

    const confirm = async () => {
      if (flightSite) {
        const lat = readRequired(latEl)
        if (lat === null) return
        const lng = readRequired(lngEl)
        if (lng === null) return
        const alt = readRequired(altEl)
        if (alt === null) return
        const posac = readRequired(posacEl)
        if (posac === null) return
        const altac = readRequired(altacEl)
        if (altac === null) return
        const rel = flightRelation()
        const formName = String(nameEl.value ?? '').trim()
        const formAdrs = String(adrsEl.value ?? '').trim()
        if (!formName) {
          nameEl.setCustomValidity('場所を入力してください')
          nameEl.reportValidity()
          return
        }
        nameEl.setCustomValidity('')
        const askOverwrite = async (placeName: string): Promise<boolean> => {
          const choice = await chooseFromList(
            placeOverwritePrompt(placeName),
            [PLACE_OVERWRITE_OK, PLACE_OVERWRITE_BACK],
            { withBackButton: false },
          )
          return choice === PLACE_OVERWRITE_OK
        }
        if (rel === 'inside' && nearDraft) {
          const greenName = formName
          const greenAdrs = formAdrs
          if (!greenAdrs && nearDraft.adrs) {
            adrsEl.setCustomValidity('住所を入力してください')
            adrsEl.reportValidity()
            return
          }
          adrsEl.setCustomValidity('')
          if (greenName !== nearDraft.name) {
            const other = await getPlace(greenName)
            if (other) {
              const ok = await askOverwrite(greenName)
              if (!ok) return
            }
          }
          finish({
            lat,
            lng,
            alt: roundAltMeters(alt),
            adrs: greenAdrs,
            posac: String(posac),
            altac: String(altac),
            name: greenName,
            flightCommit: {
              relation: 'inside',
              useNearest: true,
              green: {
                baseName: nearDraft.name,
                name: greenName,
                lat: nearDraft.lat,
                lng: nearDraft.lng,
                alt: nearDraft.alt,
                adrs: greenAdrs,
                posac: String(nearDraft.posac),
                altac: nearDraft.altac || String(altac),
                write:
                  nearDirty() ||
                  greenName !== nearDraft.name ||
                  greenAdrs !== nearDraft.adrs,
              },
            },
          })
          return
        }
        if (!formAdrs) {
          adrsEl.setCustomValidity('住所を入力してください')
          adrsEl.reportValidity()
          return
        }
        adrsEl.setCustomValidity('')
        const existing = await getPlace(formName)
        if (existing) {
          const ok = await askOverwrite(formName)
          if (!ok) return
        }
        const sameAsNear = !!nearDraft && formName === nearDraft.name
        const green =
          nearDraft && nearDirty() && !sameAsNear
            ? {
                baseName: nearDraft.name,
                name: nearDraft.name,
                lat: nearDraft.lat,
                lng: nearDraft.lng,
                alt: nearDraft.alt,
                adrs: nearDraft.baseAdrs || nearDraft.adrs,
                posac: String(nearDraft.posac),
                altac: nearDraft.altac || String(altac),
                write: true,
              }
            : undefined
        finish({
          lat,
          lng,
          alt: roundAltMeters(alt),
          adrs: formAdrs,
          posac: String(posac),
          altac: String(altac),
          name: formName,
          flightCommit: {
            relation: rel === 'touch-out' ? 'touch-out' : 'apart',
            useNearest: false,
            green,
          },
        })
        return
      }
      const lat = readRequired(latEl)
      if (lat === null) return
      const lng = readRequired(lngEl)
      if (lng === null) return
      const alt = readRequired(altEl)
      if (alt === null) return
      const posac = readRequired(posacEl)
      if (posac === null) return
      const altac = readRequired(altacEl)
      if (altac === null) return
      const adrs = String(adrsEl.value ?? '').trim()
      if (!adrs) {
        adrsEl.setCustomValidity('住所を入力してください')
        adrsEl.reportValidity()
        return
      }
      adrsEl.setCustomValidity('')
      const checked = await validatePlaceNameCandidate(nameEl.value, {
        allowExistingName: isPlaceReview ? placeRefName : undefined,
      })
      if (!checked.ok) {
        nameEl.setCustomValidity(checked.err)
        nameEl.reportValidity()
        return
      }
      finish({
        lat,
        lng,
        alt: roundAltMeters(alt),
        adrs,
        posac: String(posac),
        altac: String(altac),
        name: checked.value,
      })
    }

    const confirmDelete = async () => {
      if (!isPlaceReview || !placeRefName) return
      const sel = await chooseFromList(
        PLACE_REVIEW_DEL_PROMPT,
        [PLACE_DEL_OK, PLACE_DEL_BACK],
        { withBackButton: false },
      )
      if (!sel || sel === PLACE_DEL_BACK || !sel.includes('削除')) {
        // 削除確認をキャンセル → 一覧へ戻りメッセージ表示
        finish('delete-cancelled')
        return
      }
      await deletePlace(placeRefName)
      finish('deleted')
    }

    root.querySelector('#sc-ok')!.addEventListener('click', () => {
      void confirm()
    })
    root.querySelector('#sc-del')?.addEventListener('click', () => {
      void confirmDelete()
    })
    root.querySelector('#sc-back')!.addEventListener('click', () => finish(null))
  })
}

/**
 * 地理院 標準／写真レイヤを載せる。
 * detail: 詳細＋classic を常駐し opacity で切替（zoom 中も）。clearLayers によるフラッシュを防ぐ。
 */
function mountGsiLayers(map: L.Map, mode: GsiTileMode): void {
  const classicOpts = jpGsiTileOpts('classic')
  if (mode === 'classic') {
    const base = L.tileLayer(JP_BASE_TILE_URL, { ...classicOpts })
    const photo = L.tileLayer(JP_PHOTO_TILE_URL, { ...classicOpts })
    base.addTo(map)
    L.control
      .layers(
        { 標準地図: base, 写真: photo },
        {},
        { position: 'topright', collapsed: true },
      )
      .addTo(map)
    return
  }

  const detailOpts = jpGsiTileOpts('detail')
  // 両方常駐。下=classic / 上=detail。切替は opacity のみ（ズームアウト時の粗いフラッシュ防止）
  const stdClassic = L.tileLayer(JP_BASE_TILE_URL, { ...classicOpts, opacity: 0 })
  const stdDetail = L.tileLayer(JP_BASE_TILE_URL, { ...detailOpts, opacity: 1 })
  const photoClassic = L.tileLayer(JP_PHOTO_TILE_URL, { ...classicOpts, opacity: 0 })
  const photoDetail = L.tileLayer(JP_PHOTO_TILE_URL, { ...detailOpts, opacity: 1 })
  const stdGroup = L.layerGroup([stdClassic, stdDetail])
  const photoGroup = L.layerGroup([photoClassic, photoDetail])

  let showingPhoto = false
  let lastUseDetail: boolean | null = null
  const applyOpacity = (force = false) => {
    // 上限超過の一瞬（バウンス）でも classic 側を維持し、不要な opacity 切替をしない
    const useDetail = map.getZoom() < JP_DETAIL_HANDOFF_ZOOM
    if (!force && lastUseDetail === useDetail) return
    lastUseDetail = useDetail
    const d = useDetail ? 1 : 0
    const c = useDetail ? 0 : 1
    if (showingPhoto) {
      photoDetail.setOpacity(d)
      photoClassic.setOpacity(c)
      stdDetail.setOpacity(0)
      stdClassic.setOpacity(0)
    } else {
      stdDetail.setOpacity(d)
      stdClassic.setOpacity(c)
      photoDetail.setOpacity(0)
      photoClassic.setOpacity(0)
    }
  }

  applyOpacity(true)
  stdGroup.addTo(map)
  // zoom: アニメーション途中でも切替（zoomend だけだとズームアウトで classic 縮小＝粗く見える）
  map.on('zoom', () => applyOpacity())
  map.on('zoomend', () => applyOpacity())
  map.on('baselayerchange', (e: L.LayersControlEvent) => {
    showingPhoto = e.name === '写真'
    applyOpacity(true)
  })
  L.control
    .layers(
      { 標準地図: stdGroup, 写真: photoGroup },
      {},
      { position: 'topright', collapsed: true },
    )
    .addTo(map)
}

function addressFailMessage(status: ReverseGeocodeStatus): string {
  if (status === 'timeout') return NET_FAIL_ADDRESS_TIMEOUT
  if (status === 'empty') return NET_FAIL_ADDRESS_EMPTY
  return NET_FAIL_ADDRESS
}

/** 簡易マップ表示。完了で閉じる（ショートカット「マップ」→完了） */
function showMapDialog(lat: number, lng: number, alt?: number): Promise<void> {
  return new Promise((resolve) => {
    const root = openDialogRoot()
    const altText = isFiniteNum(alt) ? String(alt) : '?'
    const promptHtml = escapeHtml(
      [
        MAP_PROMPT,
        `${GPS_LABEL_LAT}(${lat})`,
        `${GPS_LABEL_LNG}(${lng})`,
        `${GPS_LABEL_ALT} ${altText}`,
      ].join('\n'),
    ).replace(/\n/g, '<br/>')
    const open = osmOpenUrl(lat, lng)
    const body = `
      <div class="sc-map-wrap sc-map-wrap--fill">
        <div id="sc-map-view" class="sc-map sc-map--fill" role="application" aria-label="現在地マップ"></div>
        <p class="sc-map-link"><a href="${open}" target="_blank" rel="noopener noreferrer">地図を別タブで開く</a></p>
      </div>`
    const actions = `<div class="sc-actions"><button type="button" class="sc-btn sc-btn-ok" id="sc-ok">${escapeHtml(MAP_DONE)}</button></div>`
    root.innerHTML = `
      <div class="sc-dialog-panel sc-dialog-panel--map">
        <header class="sc-dialog-head sc-dialog-head--compact">
          <h1 class="prompt">${promptHtml}</h1>
        </header>
        <section class="card sc-dialog-body sc-dialog-body--map">
          ${body}
          ${actions}
        </section>
      </div>`

    // #マップ表示: 詳細タイル（寄ると classic と同じ）
    const mapEl = root.querySelector<HTMLDivElement>('#sc-map-view')!
    const map = L.map(mapEl, {
      zoomControl: true,
      maxZoom: jpMapMaxZoom('detail'),
      bounceAtZoomLimits: false,
    }).setView([lat, lng], JP_MAP_VIEW_ZOOM)
    mountGsiLayers(map, 'detail')
    L.circleMarker([lat, lng], {
      radius: 9,
      color: '#1e5a78',
      fillColor: '#3d8fb5',
      fillOpacity: 0.9,
      weight: 2,
    }).addTo(map)

    const fit = () => map.invalidateSize({ animate: false })
    requestAnimationFrame(fit)
    setTimeout(fit, 100)
    setTimeout(fit, 300)

    root.querySelector('#sc-ok')!.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      map.remove()
      closeDialogSafely(root, () => resolve())
    })
  })
}

/** PC（デスクトップ）判定。スマホ／タブレットは GPS を使う。 */
function isPcClient(): boolean {
  const ua = navigator.userAgent
  if (/Android|iPhone|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua)) return false
  // iPadOS が Macintosh を名乗る場合
  if (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1) return false
  return true
}

/**
 * GPS を試し、未定の項目だけ手入力。
 * PC では精度が望めないため GPS を使わず、緯度・経度・高度をすべて手動入力。
 * 初期値優先順: 呼び出し側 initial → pos「自宅」。
 */
async function resolveLatLngAlt(initial?: {
  lat?: string
  lng?: string
  alt?: string
}): Promise<LatLngAlt | null> {
  const prefill: { lat?: string; lng?: string; alt?: string } = { ...initial }

  const fillHomeIfEmpty = async () => {
    const home = await getPlace('自宅')
    if (!home) return
    if (!prefill.lat?.trim()) prefill.lat = home.DATA1
    if (!prefill.lng?.trim()) prefill.lng = home.DATA2
    if (!prefill.alt?.trim()) prefill.alt = home.DATA3
  }

  if (isPcClient()) {
    await fillHomeIfEmpty()
    return askMissingGeo(
      {},
      { lat: true, lng: true, alt: true },
      prefill,
      { pcManual: true },
    )
  }

  const known: GeoParts = {}
  try {
    const pos = await getCurrentPosition()
    const { latitude: lat, longitude: lng, altitude } = pos.coords
    if (isFiniteNum(lat)) known.lat = lat
    if (isFiniteNum(lng)) known.lng = lng
    if (altitude != null && isFiniteNum(altitude)) known.alt = roundAltMeters(altitude)
  } catch {
    // GPS 自体が使えない → 未定のまま手入力
  }

  if (known.lat === undefined || known.lng === undefined || known.alt === undefined) {
    await fillHomeIfEmpty()
  }

  const need = {
    lat: known.lat === undefined,
    lng: known.lng === undefined,
    alt: known.alt === undefined,
  }
  if (!need.lat && !need.lng && !need.alt) {
    return { lat: known.lat!, lng: known.lng!, alt: known.alt! }
  }
  return askMissingGeo(known, need, prefill)
}

function fieldPrompt(f: FieldDef, current: string): string {
  const trimmed = String(current ?? '').trim()
  const shown = f.skipEmptyCheck ? (trimmed ? `(${trimmed})` : '(-)') : undefined
  return fieldPromptText(f.no, current, f.label, shown)
}

/**
 * 1項目の設定ダイアログ。戻る／中断時は null。
 * choice2 / select はリスト、text / number は記述入力。
 * datetime / flightDuration は離着陸・飛行時間の3値同期。
 * 項目1（A_DRONE）は機種3択 → 識別番号選択（任意入力可）。
 */
async function editOneField(f: FieldDef, rec: FlightRecord): Promise<string | null> {
  if (f.input === 'readonly') return ''

  if (f.input === 'flightDuration') {
    if (!String(rec.A_DATE ?? '').trim() && !String(rec.B_DATE ?? '').trim()) {
      flashMsg = '離陸日時または着陸日時を先に設定してください'
      return null
    }
    hydrateFlightDurationCache(rec.A_DATE, rec.B_DATE)
    const cur = displayFlightHm(rec.A_DATE, rec.B_DATE) || '00:00'
    const prompt = fieldPrompt(f, cur)
    const raw = await askTime(prompt, cur)
    if (raw === null) return null
    const synced = syncAfterFlightDuration(rec.A_DATE, rec.B_DATE, raw)
    if ('error' in synced) {
      flashMsg = synced.error
      return null
    }
    return `__FLIGHT__:${synced.A_DATE}|${synced.B_DATE}|${synced.flightHm}`
  }

  if (!f.key) return ''
  const cur = rec[f.key] ?? ''

  if (f.input === 'datetime' && (f.key === 'A_DATE' || f.key === 'B_DATE')) {
    return askDateTimeField(f, cur)
  }

  if (f.input === 'time') {
    const prompt = fieldPrompt(f, cur)
    const initial = toTimeInputValue(String(cur).trim()) || '00:00'
    return askTime(prompt, initial)
  }

  if (f.key === 'A_DRONE') {
    return editDroneField(cur)
  }

  const drone = droneTypeFrom(rec.A_DRONE)
  const prompt = fieldPrompt(f, cur)

  if (f.input === 'choice2' || f.input === 'select') {
    let opts = resolveOptions(f, drone)
    if (f.key === 'A_POS' || f.key === 'B_POS') {
      const places = await listPlaceNames()
      opts = [...places]
    }
    if (cur) {
      for (const part of cur.split('+')) {
        const p = part.trim()
        if (p && !opts.includes(p)) opts.push(p)
      }
      if (!f.multi && !opts.includes(cur)) opts.push(cur)
    }

    if (f.multi) {
      const pre = cur.split('+').map((s) => s.trim()).filter(Boolean)
      const picked = await chooseFromListMulti(prompt, opts, pre)
      if (picked === null) return null
      return picked.join('+')
    }

    const customLabel = resolveCustomLabel(f)
    const choices = [...opts]
    if (f.allowCustom) choices.push(customLabel)
    const selected = await chooseFromList(prompt, choices)
    if (selected === null) return null
    if (f.allowCustom && selected === customLabel) {
      return askText(prompt, cur === '?' ? '' : cur, 'text')
    }
    return selected
  }

  return askText(prompt, cur, f.input === 'number' ? 'number' : 'text')
}

/** ショートカット同様: 月日（カレンダー）→ 時間（時分ピッカー） */
async function askDateTimeField(f: FieldDef, current: string): Promise<string | null> {
  const parsed = parseFlightDate(current)
  const isTakeoff = f.key === 'A_DATE'
  const ymdPrompt = isTakeoff
    ? '時間管理:\n・離陸月日を確認'
    : '時間管理:\n・着陸月日を確認'
  const hmPrompt = isTakeoff
    ? 'その他:\n・離陸時間を確認'
    : '時間管理:\n・着陸時間を確認'
  const ymdDraft = parsed ? formatYmd(parsed) : ''
  const hmDraft = parsed ? formatHmFromDate(parsed) : ''

  const ymd = await askDate(ymdPrompt, ymdDraft)
  if (ymd === null) return null
  const hm = await askTime(hmPrompt, hmDraft || '00:00')
  if (hm === null) return null
  const combined = combineYmdAndHm(ymd, hm)
  if (!combined) {
    flashMsg = '日時の組み合わせが不正です'
    return null
  }
  return combined
}

/** 項目1: 機種選択 → 識別番号リスト＋任意入力（カタログ） */
async function editDroneField(current: string): Promise<string | null> {
  const types = getDroneTypes()
  const typeSel = await chooseFromList(droneTypePrompt(current), types)
  if (typeSel === null || !isKnownDroneType(typeSel)) return null

  const customId = getLabel('droneIdCustom')
  const ids = [...getDroneIds(typeSel), customId]
  const idSel = await chooseFromList(droneIdPrompt(current, typeSel), ids)
  if (idSel === null) return null

  let id = idSel
  if (idSel === customId) {
    const typed = await askText(droneIdInputPrompt(current, typeSel), '', 'text')
    if (typed === null) return null
    id = typed.trim()
    if (!id) return null
  }

  return `${typeSel}_${id}`
}

/** #全項目 / #?項目 / 個別: 1項目ずつ設定して保存 */
async function runSequentialFields(fields: FieldDef[]): Promise<'done' | 'abort'> {
  let { rec } = await getWorking()
  hydrateFlightDurationCache(rec.A_DATE, rec.B_DATE)
  for (const f of fields) {
    if (f.input === 'readonly') continue
    if (!f.key && f.input !== 'flightDuration') continue
    const next = await editOneField(f, rec)
    if (next === null) return 'abort'

    if (f.input === 'flightDuration' && next.startsWith('__FLIGHT__:')) {
      const payload = next.slice('__FLIGHT__:'.length)
      const [a, b] = payload.split('|')
      rec = { ...rec, A_DATE: a ?? rec.A_DATE, B_DATE: b ?? rec.B_DATE }
      await saveWorking(rec)
      ;({ rec } = await getWorking())
      continue
    }

    if (!f.key) continue

    if (f.key === 'A_DATE') {
      const synced = syncAfterTakeoffDate(next, rec.B_DATE)
      rec = { ...rec, A_DATE: synced.A_DATE, B_DATE: synced.B_DATE }
    } else if (f.key === 'B_DATE') {
      const synced = syncAfterLandingDate(rec.A_DATE, next)
      rec = { ...rec, A_DATE: synced.A_DATE, B_DATE: synced.B_DATE }
    } else {
      rec = { ...rec, [f.key]: next }
    }
    await saveWorking(rec)
    ;({ rec } = await getWorking())
  }
  return 'done'
}

function isFieldEmpty(rec: FlightRecord, f: FieldDef): boolean {
  if (f.skipEmptyCheck) return false
  if (f.input === 'flightDuration') {
    return !displayFlightHm(rec.A_DATE, rec.B_DATE)
  }
  if (!f.key) return false
  return !filled(rec[f.key])
}

function displayValue(rec: FlightRecord, f: FieldDef): string {
  if (f.input === 'flightDuration' || !f.key) {
    const hm = displayFlightHm(rec.A_DATE, rec.B_DATE)
    return parenData(hm)
  }
  // REMARK 等: 空は (-)（空欄判定対象外）。#?項目にも載せない
  if (f.skipEmptyCheck) {
    const v = String(rec[f.key] ?? '').trim()
    return v ? `(${v})` : '(-)'
  }
  return parenData(rec[f.key])
}

/** 新規場所名の入力。初期値は派生名／住所。戻るで null。 */
async function askNewPlaceName(initial: string): Promise<string | null> {
  let draft = placeNamePrefill(initial)
  let err = ''
  for (;;) {
    const prompt = err ? `${PLACE_NAME_PROMPT}\n（${err}）` : PLACE_NAME_PROMPT
    const raw = await askText(prompt, draft)
    if (raw === null) return null
    const checked = await validatePlaceNameCandidate(raw)
    if (!checked.ok) {
      err = checked.err
      draft = placeNamePrefill(String(raw ?? ''))
      if (!draft && checked.err.includes('空')) draft = ''
      continue
    }
    return checked.value
  }
}

async function runTakeoffLanding(action: 'takeoff' | 'landing'): Promise<void> {
  const msg = () => app.querySelector('#msg')
  const cancelMsg = action === 'takeoff' ? TAKEOFF_CANCEL_MSG : LANDING_CANCEL_MSG
  const titleLine =
    action === 'takeoff' ? TAKEOFF_PLACE_CONFIRM_LINE : LANDING_PLACE_CONFIRM_LINE
  try {
    const coords = await pickPlaceRegistrationGeo({
      titleLine,
      flightSite: true,
      status: (text) => {
        const el = msg()
        if (el) el.textContent = text
      },
    })
    if (!coords) {
      flashMsg = cancelMsg
      await render()
      return
    }

    const commit = coords.flightCommit
    const green = commit?.green

    let lat = coords.lat
    let lng = coords.lng
    let alt = coords.alt
    let adrs = String(coords.adrs ?? '').trim()
    let posName = String(coords.name ?? '').trim()
    let usedNearest = false
    let adjustedPlace = false

    if (green?.write) {
      const fields = {
        lat: green.lat,
        lng: green.lng,
        alt: green.alt,
        adrs: green.adrs,
        posac: green.posac,
        altac: green.altac,
      }
      if (green.name !== green.baseName) {
        const other = await getPlace(green.name)
        if (other) {
          await upsertPlace(green.name, fields)
        } else {
          await renamePlace(green.baseName, green.name)
          await upsertPlace(green.name, fields)
        }
      } else {
        await upsertPlace(green.baseName, fields)
      }
      adjustedPlace = true
    }

    if (commit?.useNearest && green) {
      lat = green.lat
      lng = green.lng
      alt = green.alt
      adrs = green.adrs
      posName = green.name
      usedNearest = true
    } else {
      if (!posName) {
        const entered = await askNewPlaceName(placeNamePrefill(adrs))
        if (!entered) {
          flashMsg = cancelMsg
          await render()
          return
        }
        posName = entered
      }
      await upsertPlace(posName, {
        lat,
        lng,
        alt,
        adrs,
        posac: String(coords.posac ?? PLACE_DEFAULT_POSAC).trim() || PLACE_DEFAULT_POSAC,
        altac: String(coords.altac ?? PLACE_DEFAULT_ALTAC).trim() || PLACE_DEFAULT_ALTAC,
      })
    }

    const meta = await getMeta()
    const { rec } = await getWorking()
    const flag = action === 'takeoff' ? meta.tmp.DATA2 : meta.tmp.DATA3
    const storedDate = action === 'takeoff' ? rec.A_DATE : rec.B_DATE
    const updateTime = flag === '2' || !filled(storedDate)
    const when = formatNow()
    if (action === 'takeoff') {
      if (updateTime) {
        const synced = syncAfterTakeoffDate(when, rec.B_DATE)
        rec.A_DATE = synced.A_DATE
        rec.B_DATE = synced.B_DATE
      }
      rec.A_DATA1 = String(lat)
      rec.A_DATA2 = String(lng)
      rec.A_DATA3 = String(roundAltMeters(alt))
      rec.A_ADRS = adrs
      rec.A_POS = posName
    } else {
      if (updateTime) {
        const synced = syncAfterLandingDate(rec.A_DATE, when)
        rec.A_DATE = synced.A_DATE
        rec.B_DATE = synced.B_DATE
      }
      rec.B_DATA1 = String(lat)
      rec.B_DATA2 = String(lng)
      rec.B_DATA3 = String(roundAltMeters(alt))
      rec.B_ADRS = adrs
      rec.B_POS = posName
    }
    hydrateFlightDurationCache(rec.A_DATE, rec.B_DATE)
    await saveWorking(rec)
    const verb = action === 'takeoff' ? '離陸' : '着陸'
    const placeNote = adjustedPlace
      ? `${posName}・登録場所を修正`
      : usedNearest
        ? `${posName}・最寄地点`
        : posName
    flashMsg = updateTime
      ? `${verb}を登録しました（${placeNote}）`
      : `${verb}場所を更新しました（${placeNote}・時間は維持）`
    await render()
  } catch (e) {
    flashMsg = `失敗: ${(e as Error).message}`
    try {
      const el = app.querySelector('#msg')
      if (el) el.textContent = flashMsg
      else await render()
    } catch {
      await render()
    }
  }
}

async function onMenu(action: string): Promise<void> {
  if (action === 'pre') {
    view = 'newa'
    await render()
    return
  }
  if (action === 'post') {
    view = 'newb'
    await render()
    return
  }
  if (action === 'records') {
    view = 'records'
    await render()
    return
  }
  if (action === 'places') {
    view = 'places'
    await render()
    return
  }
  if (action === 'io') {
    view = 'io'
    await render()
    return
  }
  if (action === 'exit') {
    return
  }
  if (action === 'reset') {
    const selected = await chooseFromList(RESET_PROMPT, [RESET_OK, RESET_BACK], {
      withBackButton: false,
    })
    if (!selected || !selected.includes(RESET_OK)) {
      await render()
      return
    }
    // NEWR → 続けて #データセット 確認
    await resetWorking()
    await runDataSetFlow()
    await render()
    return
  }
  if (action === 'takeoff' || action === 'landing') {
    await runTakeoffLanding(action)
    return
  }
  if (action === 'commit') {
    const selected = await chooseFromList(COMMIT_PROMPT, [COMMIT_OK, COMMIT_BACK], {
      withBackButton: false,
    })
    if (selected?.includes('データ登録')) {
      const k = await commitWorking()
      flashMsg = k ? `登録しました: ${k}` : 'A_DATE が空のため登録できません'
    }
    await render()
  }
}

async function runDataSetFlow(opts: { skipConfirm?: boolean } = {}): Promise<boolean> {
  if (!opts.skipConfirm) {
    const setSel = await chooseFromList(SET_PROMPT, [SET_OK, SET_BACK], { withBackButton: false })
    if (!setSel?.includes('セット')) return false
  }
  try {
    const { rec } = await getWorking()
    const coords = await resolveLatLngAlt({
      lat: rec.A_DATA1,
      lng: rec.A_DATA2,
      alt: rec.A_DATA3,
    })
    if (!coords) {
      flashMsg = '位置入力をキャンセルしたため気象セットを中止しました'
      return false
    }
    const weather = await fetchWeatherSet(coords.lat, coords.lng)
    await applyWeatherSet(weather)
    timerPromptDismissed = null
    flashMsg = '気象データをセットしました'
    return true
  } catch {
    flashMsg = NET_FAIL_WEATHER
    return false
  }
}

/** メニュー表示時: 2h 超で再セット、24h 超でリセット要求（TIME 無しでは催促しない） */
async function enforceSessionTimers(timeRaw: string): Promise<void> {
  if (timerCheckRunning || view !== 'menu') return
  const need = evaluateTimers(timeRaw)
  if (need === 'ok' || need === 'no_time') {
    if (need === 'ok') timerPromptDismissed = null
    return
  }
  const key = String(timeRaw ?? '')
  if (
    timerPromptDismissed &&
    timerPromptDismissed.time === key &&
    timerPromptDismissed.need === need
  ) {
    return
  }

  timerCheckRunning = true
  try {
    if (need === 'need_reset') {
      const sel = await chooseFromList(
        TIMER_RESET_PROMPT,
        [TIMER_RESET_OK, TIMER_RESET_LATER],
        { withBackButton: false },
      )
      if (sel?.includes('リセット')) {
        await resetWorking()
        const ok = await runDataSetFlow({ skipConfirm: true })
        await render()
        if (!ok) {
          timerPromptDismissed = { time: key, need }
        }
        return
      }
      timerPromptDismissed = { time: key, need }
      return
    }

    if (need === 'need_set') {
      const sel = await chooseFromList(
        TIMER_SET_PROMPT,
        [TIMER_SET_OK, TIMER_SET_LATER],
        { withBackButton: false },
      )
      if (sel?.includes('セット')) {
        const ok = await runDataSetFlow({ skipConfirm: true })
        await render()
        if (!ok) {
          timerPromptDismissed = { time: key, need }
        }
        return
      }
      timerPromptDismissed = { time: key, need }
    }
  } finally {
    timerCheckRunning = false
  }
}

function withoutHidden(fields: FieldDef[], droneType: string): FieldDef[] {
  const hidden = new Set(getHiddenKeys(droneType))
  if (!hidden.size) return fields
  return fields.filter((f) => !f.key || !hidden.has(f.key))
}

function newaFields(droneType: string): FieldDef[] {
  // NEWA: #?項目の次は 1〜37、最後に 63
  return withoutHidden(
    FIELDS.filter((f) => (f.no >= 1 && f.no <= 37) || f.no === 63).sort(
      (a, b) => a.no - b.no,
    ),
    droneType,
  )
}

function newbFields(droneType: string): FieldDef[] {
  // NEWB: 38〜63
  return withoutHidden(
    FIELDS.filter((f) => f.no >= 38 && f.no <= 63).sort((a, b) => a.no - b.no),
    droneType,
  )
}

function freeFields(droneType: string): FieldDef[] {
  return withoutHidden(
    FIELDS.filter((f) => f.no >= 1 && f.no <= 63).sort((a, b) => a.no - b.no),
    droneType,
  )
}

function editFieldsFor(kind: 'A' | 'B' | 'F', droneType: string): FieldDef[] {
  if (kind === 'A') return newaFields(droneType)
  if (kind === 'B') return newbFields(droneType)
  return freeFields(droneType)
}

async function renderRecords(): Promise<void> {
  const keys = await listFlightKeys()
  const meta = await getMeta()
  const drone = meta.tmp.DRONE || 'Mavic2Pro'
  const rows = [
    { id: 'back', text: REC_MENU_BACK },
    ...keys.map((k) => ({ id: `k:${k}`, text: k })),
  ]
  const list = rows
    .map(
      (it) =>
        `<button type="button" class="menu-btn" data-id="${escapeHtml(it.id)}">${escapeHtml(it.text)}</button>`,
    )
    .join('')

  app.innerHTML = shell(
    escapeHtml(`登録データ管理（${drone}）`),
    `
    <p id="msg" class="msg menu-flash"></p>
    <section class="card menu-card">
      <div class="menu">${list}</div>
    </section>`,
  )

  const msgEl = app.querySelector('#msg')!
  if (flashMsg) {
    msgEl.textContent = flashMsg
    flashMsg = ''
  }

  app.querySelectorAll<HTMLButtonElement>('[data-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      void onRecords(btn.dataset.id!).catch((e) => {
        msgEl.textContent = `失敗: ${(e as Error).message}`
      })
    })
  })
}

async function onRecords(id: string): Promise<void> {
  if (id === 'back') {
    view = 'menu'
    await render()
    return
  }
  if (id.startsWith('k:')) {
    const key = id.slice(2)
    await setWorkingKey(key)
    view = 'record-edit'
    await render()
  }
}

async function renderEditList(kind: 'A' | 'B' | 'F'): Promise<void> {
  const meta = await getMeta()
  const { key, rec } = await getWorking()
  const drone = meta.tmp.DRONE || rec.A_DRONE.split('_')[0] || 'Mavic2Pro'
  const fields = editFieldsFor(kind, drone)
  const prompt =
    kind === 'A' ? newaPrompt(drone) : kind === 'B' ? newbPrompt(drone) : freePrompt(drone)
  const sel = /^NEW\d{4}\//.test(key) ? key : key.startsWith('NEW') ? 'NEW' : key
  const isNew = isNewRecordKey(key)

  const cmdRows: { id: string; text: string }[] =
    kind === 'F'
      ? isNew
        ? [
            { id: 'back', text: CMD_BACK },
            { id: 'delete', text: CMD_DELETE },
            { id: 'commit', text: CMD_COMMIT },
            { id: 'reset', text: CMD_RESET },
            { id: 'dataset', text: CMD_DATASET },
            { id: 'takeoff', text: CMD_TAKEOFF },
            { id: 'landing', text: CMD_LANDING },
            { id: 'all', text: CMD_ALL },
            { id: 'empty', text: CMD_EMPTY },
          ]
        : [
            { id: 'back', text: CMD_BACK },
            { id: 'delete', text: CMD_DELETE },
            { id: 'all', text: CMD_ALL },
            { id: 'empty', text: CMD_EMPTY },
          ]
      : [
          { id: 'back', text: CMD_BACK },
          { id: 'dataset', text: CMD_DATASET },
          { id: 'all', text: CMD_ALL },
          { id: 'empty', text: CMD_EMPTY },
        ]

  const fieldRows = fields.map((f) => ({
    id: `f-${f.no}`,
    text: `${f.no}.${f.label}\n${displayValue(rec, f)}`,
  }))

  const list = [...cmdRows, ...fieldRows]
    .map(
      (it) =>
        `<button type="button" class="menu-btn menu-btn-multiline" data-id="${it.id}">${escapeHtml(it.text).replace(/\n/g, '<br/>')}</button>`,
    )
    .join('')

  app.innerHTML = shell(
    escapeHtml(prompt),
    `
    <p id="msg" class="msg menu-flash"></p>
    <section class="card menu-card">
      <div class="menu">${list}</div>
    </section>`,
    escapeHtml(targetDataLine(sel)),
  )

  const msgEl = app.querySelector('#msg')!
  if (flashMsg) {
    msgEl.textContent = flashMsg
    flashMsg = ''
  }

  app.querySelectorAll<HTMLButtonElement>('[data-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      void onEditList(kind, btn.dataset.id!).catch((e) => {
        msgEl.textContent = `失敗: ${(e as Error).message}`
      })
    })
  })
}

async function onEditList(kind: 'A' | 'B' | 'F', id: string): Promise<void> {
  if (id === 'back') {
    view = kind === 'F' ? 'records' : 'menu'
    await render()
    return
  }
  if (id === 'delete') {
    const sel = await chooseFromList(REC_DEL_PROMPT, [REC_DEL_OK, REC_DEL_BACK], {
      withBackButton: false,
    })
    if (sel && sel.includes('削除') && !sel.includes('戻る')) {
      const { key } = await getWorking()
      await deleteOrResetRecord(key)
      flashMsg = `削除しました（${key}）`
      view = 'records'
    }
    await render()
    return
  }
  if (id === 'commit') {
    const selected = await chooseFromList(COMMIT_PROMPT, [COMMIT_OK, COMMIT_BACK], {
      withBackButton: false,
    })
    if (selected?.includes('データ登録')) {
      const k = await commitWorking()
      flashMsg = k ? `登録しました: ${k}` : 'A_DATE が空のため登録できません'
    }
    await render()
    return
  }
  if (id === 'reset') {
    const selected = await chooseFromList(RESET_PROMPT, [RESET_OK, RESET_BACK], {
      withBackButton: false,
    })
    if (selected && selected.includes(RESET_OK)) {
      await resetWorking()
      await runDataSetFlow()
    }
    await render()
    return
  }
  if (id === 'dataset') {
    await runDataSetFlow()
    await render()
    return
  }
  if (id === 'takeoff') {
    await runTakeoffLanding('takeoff')
    return
  }
  if (id === 'landing') {
    await runTakeoffLanding('landing')
    return
  }
  if (id === 'all') {
    const meta = await getMeta()
    const { rec } = await getWorking()
    const drone = droneTypeFrom(rec.A_DRONE, meta.tmp.DRONE)
    await runSequentialFields(editFieldsFor(kind, drone))
    await render()
    return
  }
  if (id === 'empty') {
    const meta = await getMeta()
    const { rec } = await getWorking()
    const drone = droneTypeFrom(rec.A_DRONE, meta.tmp.DRONE)
    const fields = editFieldsFor(kind, drone).filter((f) => isFieldEmpty(rec, f))
    await runSequentialFields(fields)
    await render()
    return
  }
  if (id.startsWith('f-')) {
    const no = Number(id.slice(2))
    const f = FIELDS.find((x) => x.no === no)
    if (!f) {
      await render()
      return
    }
    await runSequentialFields([f])
    await render()
  }
}

async function renderChecklist(): Promise<void> {
  const { rec } = await getWorking()
  const meta = await getMeta()
  const drone = droneTypeFrom(rec.A_DRONE, meta.tmp.DRONE)
  const places = await listPlaceNames()
  const fields = withoutHidden(
    FIELDS.filter((f) => {
      if (checklistFilter === 'pre') return f.group === 'pre' || f.group === 'ops' || f.no === 63
      if (checklistFilter === 'post') return f.group === 'post' || f.group === 'takeoff' || f.no === 63
      return true
    }),
    drone,
  )

  const title =
    checklistFilter === 'pre' ? '離陸前チェック' : checklistFilter === 'post' ? '着陸後・離着陸' : '全項目'

  const rows = fields
    .map((f) => fieldRow(f, rec, places, drone))
    .join('')

  app.innerHTML = shell(
    title,
    `
    <section class="card">
      <form id="cf" class="form">
        <p class="hint">点検項目は <strong>正常／異常</strong> の2択。氏名・数値・場所などは記述入力です。</p>
        ${rows}
        <div class="row sticky">
          <button type="button" class="ghost" id="back">${escapeHtml(CMD_BACK)}</button>
          <button type="submit" class="primary">保存</button>
        </div>
      </form>
      <p id="msg" class="msg"></p>
    </section>`,
  )

  app.querySelector('#back')!.addEventListener('click', () => {
    view = checklistFilter === 'post' ? 'newb' : 'newa'
    void render()
  })
  const formEl = app.querySelector<HTMLFormElement>('#cf')!
  wireClearableInputs(formEl)
  formEl.querySelectorAll<HTMLInputElement>('input.num-input').forEach((input) => {
    input.addEventListener('input', () => {
      const cleaned = sanitizeNumberDraft(input.value)
      if (cleaned !== input.value) input.value = cleaned
      input.setCustomValidity('')
    })
  })

  formEl.addEventListener('submit', async (e) => {
    e.preventDefault()
    const formEl = e.target as HTMLFormElement
    let next = { ...rec }
    hydrateFlightDurationCache(next.A_DATE, next.B_DATE)

    for (const f of fields) {
      if (f.input === 'flightDuration') {
        const el = formEl.elements.namedItem('FLIGHT_HM') as HTMLInputElement | null
        if (!el) continue
        const raw = el.value.trim()
        if (!raw) continue
        const synced = syncAfterFlightDuration(next.A_DATE, next.B_DATE, raw)
        if ('error' in synced) {
          el.setCustomValidity(synced.error)
          el.reportValidity()
          return
        }
        el.setCustomValidity('')
        next = { ...next, A_DATE: synced.A_DATE, B_DATE: synced.B_DATE }
        continue
      }
      if (!f.key) continue
      const el = formEl.elements.namedItem(f.key) as HTMLInputElement | HTMLSelectElement | null
      if (!el) continue
      if (f.input === 'number' && el instanceof HTMLInputElement) {
        const v = normalizeNumberInput(el.value)
        el.value = v
        if (!isValidNumberInput(v)) {
          el.setCustomValidity('数値を入力してください')
          el.reportValidity()
          return
        }
        el.setCustomValidity('')
        next[f.key] = v
      } else if (f.input === 'datetime') {
        const dateEl = formEl.elements.namedItem(`${f.key}__date`) as HTMLInputElement | null
        const timeEl = formEl.elements.namedItem(`${f.key}__time`) as HTMLInputElement | null
        const ymd = dateEl?.value ? fromDateInputValue(dateEl.value) : ''
        const hm = timeEl?.value ? toTimeInputValue(timeEl.value.slice(0, 5)) : ''
        if (!ymd && !hm) {
          if (f.key === 'A_DATE' || f.key === 'B_DATE') next[f.key] = ''
          continue
        }
        if (!ymd || !hm) {
          ;(dateEl || timeEl)?.setCustomValidity('月日と時間の両方を選択してください')
          ;(dateEl || timeEl)?.reportValidity()
          return
        }
        dateEl?.setCustomValidity('')
        timeEl?.setCustomValidity('')
        const combined = combineYmdAndHm(ymd, hm)
        if (!combined) {
          dateEl?.setCustomValidity('日時が不正です')
          dateEl?.reportValidity()
          return
        }
        if (f.key === 'A_DATE') {
          const synced = syncAfterTakeoffDate(combined, next.B_DATE)
          next = { ...next, A_DATE: synced.A_DATE, B_DATE: synced.B_DATE }
        } else if (f.key === 'B_DATE') {
          const synced = syncAfterLandingDate(next.A_DATE, combined)
          next = { ...next, A_DATE: synced.A_DATE, B_DATE: synced.B_DATE }
        }
      } else if (f.input === 'time' && el instanceof HTMLInputElement) {
        const hm = el.value ? toTimeInputValue(el.value.slice(0, 5)) : ''
        next[f.key] = hm
      } else {
        next[f.key] = el.value
      }
    }
    await saveWorking(next)
    view = checklistFilter === 'post' ? 'newb' : 'newa'
    await render()
  })
}

function fieldRow(f: FieldDef, rec: FlightRecord, places: string[], droneType: string): string {
  if (f.input === 'flightDuration' || !f.key) {
    const hm = displayFlightHm(rec.A_DATE, rec.B_DATE)
    return `<label class="field"><span>${f.no}. ${f.label} <em>時分</em></span>
      ${clearableInputHtml('cf-FLIGHT_HM', 'name="FLIGHT_HM" class="sc-input-time" type="time" step="60"', toTimeInputValue(hm) || '')}</label>`
  }
  const val = escapeHtml(rec[f.key] ?? '')
  const kind =
    f.input === 'choice2'
      ? '2択'
      : f.input === 'text'
        ? '記述'
        : f.input === 'number'
          ? '数値'
          : f.input === 'select'
            ? '選択'
            : f.input === 'datetime'
              ? '日時'
              : f.input === 'time'
                ? '時分'
                : ''

  const catalogOpts = resolveOptions(f, droneType)

  if (f.input === 'choice2' && catalogOpts.length) {
    const opts = catalogOpts
    const radios = opts
      .map((o) => {
        const id = `${f.key}-${o}`
        const checked = rec[f.key!] === o ? 'checked' : ''
        return `<label class="choice"><input type="radio" name="${f.key}" id="${id}" value="${escapeHtml(o)}" ${checked} /><span>${escapeHtml(o)}</span></label>`
      })
      .join('')
    const extra =
      rec[f.key] && !opts.includes(rec[f.key])
        ? `<label class="choice"><input type="radio" name="${f.key}" value="${val}" checked /><span>${val}</span></label>`
        : ''
    return `<fieldset class="field choice-set"><legend>${f.no}. ${f.label} <em>${kind}</em></legend><div class="choices">${radios}${extra}</div></fieldset>`
  }

  if (f.key === 'A_POS' || f.key === 'B_POS') {
    const opts = places.map((p) => `<option value="${escapeHtml(p)}" ${p === rec[f.key!] ? 'selected' : ''}>${escapeHtml(p)}</option>`).join('')
    return `<label class="field"><span>${f.no}. ${f.label} <em>記述／候補</em></span>
      ${clearableInputHtml(`cf-${f.key}`, `list="places" name="${f.key}" type="text" inputmode="text"`, rec[f.key] ?? '')}
      <datalist id="places">${opts}</datalist>
    </label>`
  }
  if (f.input === 'select' && (catalogOpts.length || f.optionsKey)) {
    const opts = catalogOpts
      .map((o) => `<option value="${escapeHtml(o)}" ${o === rec[f.key!] ? 'selected' : ''}>${escapeHtml(o)}</option>`)
      .join('')
    return `<label class="field"><span>${f.no}. ${f.label} <em>${kind}</em></span>
      <select name="${f.key}"><option value="">（未入力）</option>${opts}
      ${rec[f.key] && !catalogOpts.includes(rec[f.key]) ? `<option value="${val}" selected>${val}</option>` : ''}
      </select></label>`
  }
  if (f.input === 'datetime') {
    const d = parseFlightDate(rec[f.key] ?? '')
    const dateVal = d ? toDateInputValue(formatYmd(d)) : ''
    const timeVal = d ? formatHmFromDate(d) : ''
    return `<fieldset class="field datetime-set"><legend>${f.no}. ${f.label} <em>${kind}</em></legend>
      <div class="datetime-row">
        <label class="datetime-part"><span>月日</span>
          ${clearableInputHtml(`cf-${f.key}-date`, `name="${f.key}__date" class="sc-input-date" type="date"`, dateVal)}</label>
        <label class="datetime-part"><span>時間</span>
          ${clearableInputHtml(`cf-${f.key}-time`, `name="${f.key}__time" class="sc-input-time" type="time" step="60"`, timeVal)}</label>
      </div>
      <input type="hidden" name="${f.key}" value="${val}" />
    </fieldset>`
  }
  if (f.input === 'time') {
    const hm = toTimeInputValue(String(rec[f.key] ?? '').trim())
    return `<label class="field"><span>${f.no}. ${f.label} <em>${kind}</em></span>
      ${clearableInputHtml(`cf-${f.key}`, `name="${f.key}" class="sc-input-time" type="time" step="60"`, hm)}</label>`
  }
  const ph = f.input === 'number' ? '数値を入力' : '記述入力'
  if (f.input === 'number') {
    return `<label class="field"><span>${f.no}. ${f.label} <em>${kind}</em></span>
      ${clearableInputHtml(`cf-${f.key}`, `name="${f.key}" class="num-input" type="text" inputmode="decimal" autocomplete="off" placeholder="${ph}"`, rec[f.key] ?? '')}</label>`
  }
  if (f.input === 'text') {
    return `<label class="field"><span>${f.no}. ${f.label} <em>${kind}</em></span>
      ${clearableInputHtml(`cf-${f.key}`, `name="${f.key}" type="text" inputmode="text" placeholder="${ph}"`, rec[f.key] ?? '')}</label>`
  }
  return `<label class="field"><span>${f.no}. ${f.label} <em>${kind}</em></span>
    ${clearableInputHtml(`cf-${f.key}`, `name="${f.key}" type="text" inputmode="text" placeholder="${ph}"`, rec[f.key] ?? '')}</label>`
}

async function renderPlaces(): Promise<void> {
  const names = await listPlaceNames()
  const rows = [
    { id: 'back', text: PLACE_MENU_BACK },
    { id: 'newplace', text: PLACE_MENU_NEW },
    ...names.map((n) => ({ id: `p:${n}`, text: n })),
  ]
  const list = rows
    .map(
      (it) =>
        `<button type="button" class="menu-btn" data-id="${escapeHtml(it.id)}">${escapeHtml(it.text)}</button>`,
    )
    .join('')

  app.innerHTML = shell(
    '場所データ管理',
    `
    <p id="msg" class="msg menu-flash"></p>
    <section class="card menu-card">
      <div class="menu">${list}</div>
    </section>`,
  )
  const msgEl = app.querySelector('#msg')!
  if (flashMsg) {
    msgEl.textContent = flashMsg
    flashMsg = ''
  }
  app.querySelectorAll<HTMLButtonElement>('[data-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      void onPlaceMenu(btn.dataset.id!).catch((e) => {
        msgEl.textContent = `失敗: ${(e as Error).message}`
      })
    })
  })
}

async function onPlaceMenu(id: string): Promise<void> {
  if (id === 'back') {
    view = 'menu'
    placeEditName = null
    await render()
    return
  }
  if (id === 'newplace') {
    await runPlaceNewRegister()
    await render()
    return
  }
  if (id.startsWith('p:')) {
    const name = id.slice(2)
    const row = await getPlace(name)
    if (!row) {
      flashMsg = `場所が見つかりません: ${name}`
      await render()
      return
    }
    const lat = Number(row.DATA1)
    const lng = Number(row.DATA2)
    const alt = Number(row.DATA3)
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(alt)) {
      flashMsg = '場所の座標データが不正です'
      await render()
      return
    }
    const coords = await askDualPlaceGeo({
      gps: { lat, lng, alt },
      adrs: row.ADRS ?? '',
      posac: row.POSAC || PLACE_DEFAULT_POSAC,
      altac: row.ALTAC || PLACE_DEFAULT_ALTAC,
      name,
      placeRef: { name },
    })
    if (!coords || coords === 'deleted' || coords === 'delete-cancelled') {
      if (coords === 'deleted') {
        flashMsg = `${PLACE_REVIEW_DEL_DONE_PREFIX}(${name})`
      } else if (coords === 'delete-cancelled') {
        flashMsg = PLACE_REVIEW_DEL_CANCEL_MSG
      } else {
        flashMsg = PLACE_REVIEW_CANCEL_MSG
      }
      await render()
      return
    }
    const newName = String(coords.name ?? name).trim() || name
    const newAdrs = String(coords.adrs ?? '').trim()
    const newPosac =
      String(coords.posac ?? PLACE_DEFAULT_POSAC).trim() || PLACE_DEFAULT_POSAC
    const newAltac =
      String(coords.altac ?? PLACE_DEFAULT_ALTAC).trim() || PLACE_DEFAULT_ALTAC
    const sameNum = (a: number, b: number, eps: number) =>
      Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= eps
    const unchanged =
      newName === name &&
      sameNum(Number(row.DATA1), coords.lat, 1e-10) &&
      sameNum(Number(row.DATA2), coords.lng, 1e-10) &&
      sameNum(Number(row.DATA3), coords.alt, 1e-6) &&
      String(row.ADRS ?? '').trim() === newAdrs &&
      (String(row.POSAC || PLACE_DEFAULT_POSAC).trim() || PLACE_DEFAULT_POSAC) ===
        newPosac &&
      (String(row.ALTAC || PLACE_DEFAULT_ALTAC).trim() || PLACE_DEFAULT_ALTAC) ===
        newAltac
    if (unchanged) {
      flashMsg = PLACE_REVIEW_NOCHANGE_MSG
      await render()
      return
    }

    if (newName !== name) {
      await renamePlace(name, newName)
    }
    await upsertPlace(newName, {
      lat: coords.lat,
      lng: coords.lng,
      alt: coords.alt,
      adrs: newAdrs,
      posac: newPosac,
      altac: newAltac,
    })
    placeEditName = null
    view = 'places'
    flashMsg = `${PLACE_REVIEW_UPDATE_MSG_PREFIX}(${newName})`
    await render()
  }
}

/**
 * %新規場所登録と同じ位置取得。
 * 1) GPS 取得 → 二重ポイント UI（GPS固定＋タップ移動）
 * 2) GPS 不可 → マップタップのみ（detail タイル）
 * キャンセル・高度入力の中止は null。titleLine は離陸／着陸の見出し差し替え用。
 */
async function pickPlaceRegistrationGeo(opts?: {
  titleLine?: string
  /** 離陸・着陸。最寄の座標と精度円を同じ画面で直せる */
  flightSite?: boolean
  status?: (text: string) => void
}): Promise<LatLngAlt | null> {
  const status = opts?.status ?? (() => {})
  status('GPS現在地を取得中…')
  let gpsLat: number | undefined
  let gpsLng: number | undefined
  let gpsAlt: number | undefined
  let gpsAltAcc: number | undefined

  try {
    const pos = await getCurrentPosition()
    const c = pos.coords
    if (isFiniteNum(c.latitude)) gpsLat = c.latitude
    if (isFiniteNum(c.longitude)) gpsLng = c.longitude
    if (c.altitude != null && isFiniteNum(c.altitude)) gpsAlt = roundAltMeters(c.altitude)
    if (c.altitudeAccuracy != null && isFiniteNum(c.altitudeAccuracy)) {
      gpsAltAcc = c.altitudeAccuracy
    }
  } catch {
    // GPS 失敗 → マップのみ
  }

  let coords: DualPlaceGeoResult = null

  if (gpsLat != null && gpsLng != null) {
    const round8 = (n: number) => Math.round(n * 1e8) / 1e8
    gpsLat = round8(gpsLat)
    gpsLng = round8(gpsLng)
    status('標高を取得中…')
    if (opts?.flightSite) {
      const elev = await fetchGroundElevation(gpsLat, gpsLng)
      if (elev != null) gpsAlt = roundAltMeters(elev)
    }
    if (gpsAlt == null || !Number.isFinite(gpsAlt)) {
      status('標高を確認中…')
      const resolved = await resolveGpsOrDemAltitude(gpsLat, gpsLng, gpsAlt, gpsAltAcc)
      if (resolved) gpsAlt = resolved.alt
    }
    if (gpsAlt == null || !Number.isFinite(gpsAlt)) {
      status('高度の不足分を入力…')
      const filledAlt = await resolveLatLngAlt({
        lat: String(gpsLat),
        lng: String(gpsLng),
      })
      if (!filledAlt) return null
      gpsLat = filledAlt.lat
      gpsLng = filledAlt.lng
      gpsAlt = filledAlt.alt
    }

    status('住所を取得中…')
    const geo = await reverseGeocode(gpsLat, gpsLng)
    const adrs = String(geo.address ?? '').trim()

    status('位置を確認…')
    coords = await askDualPlaceGeo({
      gps: { lat: gpsLat, lng: gpsLng, alt: gpsAlt },
      adrs,
      posac: PLACE_DEFAULT_POSAC,
      altac: PLACE_DEFAULT_ALTAC,
      titleLine: opts?.titleLine,
      flightSite: opts?.flightSite,
    })
  } else {
    let mapCenter: { lat: number; lng: number } | undefined
    const home = await getPlace('自宅')
    if (home) {
      const lat = Number(home.DATA1)
      const lng = Number(home.DATA2)
      if (Number.isFinite(lat) && Number.isFinite(lng)) mapCenter = { lat, lng }
    }
    status('マップで登録点を選択…（GPSなし）')
    coords = await askMissingGeo(
      {},
      { lat: true, lng: true, alt: true },
      undefined,
      {
        mapRegister: true,
        mapCenter,
        mapTiles: 'detail',
        titleLine: opts?.titleLine,
      },
    )
  }

  if (!coords || coords === 'deleted' || coords === 'delete-cancelled') return null
  return coords
}

/**
 * %新規場所登録
 * 位置画面は pickPlaceRegistrationGeo。確定後は名称があればそのまま、無ければ入力して pos 登録。
 */
async function runPlaceNewRegister(): Promise<void> {
  const msg = () => app.querySelector('#msg')
  try {
    const coords = await pickPlaceRegistrationGeo({
      status: (text) => {
        const el = msg()
        if (el) el.textContent = text
      },
    })
    if (!coords) {
      flashMsg = PLACE_NEW_CANCEL_MSG
      return
    }
    const { lat, lng, alt } = coords
    const curAdrs = String(coords.adrs ?? '').trim()
    const posac =
      String(coords.posac ?? PLACE_DEFAULT_POSAC).trim() || PLACE_DEFAULT_POSAC
    const altac =
      String(coords.altac ?? PLACE_DEFAULT_ALTAC).trim() || PLACE_DEFAULT_ALTAC
    const addrFetchFailed = !curAdrs
    const nameDefault = placeNamePrefill(curAdrs)
    const entered =
      String(coords.name ?? '').trim() || (await askNewPlaceName(nameDefault))
    if (!entered) {
      flashMsg = PLACE_NEW_CANCEL_MSG
      return
    }
    await upsertPlace(entered, {
      lat,
      lng,
      alt,
      adrs: curAdrs,
      posac,
      altac,
    })
    placeEditName = null
    view = 'places'
    flashMsg = addrFetchFailed
      ? `${PLACE_NEW_DONE_MSG_PREFIX}(${entered})。住所は後から編集できます`
      : `${PLACE_NEW_DONE_MSG_PREFIX}(${entered})`
  } catch (e) {
    flashMsg = `失敗: ${(e as Error).message}`
  }
}

type PlaceFieldKey = 'name' | keyof PlaceRecord

const PLACE_EDIT_FIELDS: { no: number; key: PlaceFieldKey; label: string; number?: boolean }[] = [
  { no: 1, key: 'name', label: '場所' },
  { no: 2, key: 'ADRS', label: '住所' },
  { no: 3, key: 'DATA1', label: '緯度', number: true },
  { no: 4, key: 'DATA2', label: '経度', number: true },
  { no: 5, key: 'DATA3', label: '高度m', number: true },
  { no: 6, key: 'POSAC', label: '位置精度m', number: true },
  { no: 7, key: 'ALTAC', label: '高度精度m', number: true },
]

function placeFieldValue(
  name: string,
  place: PlaceRecord,
  key: PlaceFieldKey,
): string {
  if (key === 'name') return name
  return place[key] ?? ''
}

async function renderPlaceEdit(): Promise<void> {
  const name = placeEditName
  if (!name) {
    view = 'places'
    await render()
    return
  }
  const row = await getPlace(name)
  if (!row) {
    flashMsg = `場所が見つかりません: ${name}`
    placeEditName = null
    view = 'places'
    await render()
    return
  }
  const { name: _n, ...place } = row
  const copyCmd = placeEditCopyCmd(name)
  const rows = [
    { id: 'back', text: PLACE_EDIT_BACK },
    { id: 'del', text: PLACE_EDIT_DEL },
    { id: 'map', text: PLACE_EDIT_MAP },
    { id: 'copy', text: copyCmd },
    ...PLACE_EDIT_FIELDS.map((f) => {
      const v = placeFieldValue(name, place, f.key)
      return {
        id: `f:${f.no}`,
        text: `${f.no}.${f.label}\n${parenData(v)}`,
      }
    }),
  ]
  const list = rows
    .map(
      (it) =>
        `<button type="button" class="menu-btn menu-btn-multiline" data-id="${escapeHtml(it.id)}">${escapeHtml(it.text).replace(/\n/g, '<br/>')}</button>`,
    )
    .join('')

  app.innerHTML = shell(
    escapeHtml(PLACE_EDIT_PROMPT),
    `
    <p id="msg" class="msg menu-flash"></p>
    <section class="card menu-card">
      <div class="menu">${list}</div>
    </section>`,
    escapeHtml(`対象場所:${name}`),
  )
  const msgEl = app.querySelector('#msg')!
  if (flashMsg) {
    msgEl.textContent = flashMsg
    flashMsg = ''
  }
  app.querySelectorAll<HTMLButtonElement>('[data-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      void onPlaceEdit(btn.dataset.id!, name, place).catch((e) => {
        msgEl.textContent = `失敗: ${(e as Error).message}`
      })
    })
  })
}

async function onPlaceEdit(id: string, name: string, place: PlaceRecord): Promise<void> {
  if (id === 'back') {
    placeEditName = null
    view = 'places'
    await render()
    return
  }
  if (id === 'del') {
    const sel = await chooseFromList(PLACE_DEL_PROMPT, [PLACE_DEL_OK, PLACE_DEL_BACK], {
      withBackButton: false,
    })
    if (sel === PLACE_DEL_OK) {
      await deletePlace(name)
      flashMsg = `削除しました（${name}）`
      placeEditName = null
      view = 'places'
    }
    await render()
    return
  }
  if (id === 'map') {
    const lat = Number(place.DATA1)
    const lng = Number(place.DATA2)
    const alt = Number(place.DATA3)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      flashMsg = '緯度・経度が不正なためマップを表示できません'
      await render()
      return
    }
    await showMapDialog(lat, lng, Number.isFinite(alt) ? alt : undefined)
    await render()
    return
  }
  if (id === 'copy') {
    const text = [
      `場所:${name}`,
      `住所:${place.ADRS || ''}`,
      `緯度:${place.DATA1 || ''}`,
      `経度:${place.DATA2 || ''}`,
      `高度m:${place.DATA3 || ''}`,
      `位置精度m:${place.POSAC || ''}`,
      `高度精度m:${place.ALTAC || ''}`,
    ].join('\n')
    try {
      await navigator.clipboard.writeText(text)
      flashMsg = 'クリップボードにコピーしました'
    } catch {
      flashMsg = 'クリップボードへコピーできませんでした'
    }
    await render()
    return
  }
  if (id.startsWith('f:')) {
    const no = Number(id.slice(2))
    const def = PLACE_EDIT_FIELDS.find((f) => f.no === no)
    if (!def) return
    const cur = placeFieldValue(name, place, def.key)
    const prompt = `${def.no}.${def.label}\n${parenData(cur)}`
    const next = await askText(prompt, cur === '?' ? '' : cur, def.number ? 'number' : 'text')
    if (next === null) {
      await render()
      return
    }
    const value = next.trim()
    if (def.key === 'name') {
      if (!value) {
        flashMsg = '場所名は空にできません'
        await render()
        return
      }
      if (value !== name) {
        const exists = await getPlace(value)
        if (exists) {
          flashMsg = `同じ場所名が既にあります: ${value}`
          await render()
          return
        }
        await renamePlace(name, value)
        placeEditName = value
        flashMsg = `場所名を更新しました（${value}）`
      }
    } else {
      const updated: PlaceRecord = { ...place, [def.key]: value }
      await savePlaceRecord(name, updated)
      flashMsg = `${def.label}を更新しました`
    }
    await render()
  }
}

async function renderIO(): Promise<void> {
  const syncOn = isServerSyncConfigured()
  const status = syncStatusLabel()
  const detailHtml = settingsDetailLines()
    .map((line) => `<li>${escapeHtml(line)}</li>`)
    .join('')
  const clientOk = isGoogleClientConfigured()
  const signedIn = isGoogleSignedIn()
  const syncNote = syncOn
    ? `<p class="hint settings-stub">${escapeHtml(syncNotImplementedMessage())}</p>`
    : `<p class="hint">${escapeHtml(SETTINGS_HINT_MANUAL)}</p>`
  const googleBlock =
    syncOn && getSettings().active === 'google'
      ? `
      <p class="hint">Client ID: ${clientOk ? '設定あり（.env）' : '未設定 — .env に VITE_GOOGLE_CLIENT_ID を入れて dev 再起動'}</p>
      <p class="hint">Google セッション: ${signedIn ? 'ログイン中' : '未ログイン'}</p>
      <div class="row settings-actions">
        <button type="button" class="ghost" id="googleLogin"${clientOk ? '' : ' disabled'}>${escapeHtml(GOOGLE_LOGIN)}</button>
        <button type="button" class="ghost" id="googleProbe"${clientOk ? '' : ' disabled'}>${escapeHtml(GOOGLE_PROBE)}</button>
        <button type="button" class="ghost" id="googleLogout"${signedIn ? '' : ' disabled'}>${escapeHtml(GOOGLE_LOGOUT)}</button>
      </div>
      <div class="row settings-actions">
        <button type="button" class="ghost" id="googlePull"${clientOk ? '' : ' disabled'}>${escapeHtml(GOOGLE_PULL)}</button>
        <button type="button" class="ghost" id="googlePush"${clientOk ? '' : ' disabled'}>${escapeHtml(GOOGLE_PUSH)}</button>
        <button type="button" class="ghost" id="googleSync"${clientOk ? '' : ' disabled'}>${escapeHtml(GOOGLE_SYNC)}</button>
      </div>`
      : ''

  app.innerHTML = shell(
    SYS_DATA_TITLE,
    `
    <section class="card io-panel" id="ioPanel">
      <p id="msg" class="msg io-status" role="status" aria-live="polite"></p>

      <h2>同期（settings）</h2>
      <p class="hint"><strong>いま:</strong> ${escapeHtml(status)}</p>
      ${syncNote}
      <ul class="settings-detail">${detailHtml}</ul>
      <div class="row settings-actions">
        <button type="button" class="ghost" id="settingsOff"${syncOn ? '' : ' disabled'}>${escapeHtml(SETTINGS_OFF)}</button>
      </div>
      ${googleBlock}
      <p class="hint">オフは接続設定だけを none に戻します（飛行データは消しません）。有効化は下の settings 取込。</p>

      <h2>取込</h2>
      <p class="hint">JSON を選ぶと端末の最新として反映します。サーバー障害時の復旧にも使えます。</p>
      <div class="row">
        <button type="button" class="ghost" id="impLog">log</button>
        <button type="button" class="ghost" id="impPos">pos</button>
        <button type="button" class="ghost" id="impTmp">tmp</button>
        <button type="button" class="ghost" id="impMasters">masters</button>
        <button type="button" class="ghost" id="impSettings">settings</button>
      </div>
      <div class="io-file-inputs" aria-hidden="true">
        <input type="file" id="logFile" accept="application/json,.json" />
        <input type="file" id="posFile" accept="application/json,.json" />
        <input type="file" id="tmpFile" accept="application/json,.json" />
        <input type="file" id="mastersFile" accept="application/json,.json" />
        <input type="file" id="settingsFile" accept="application/json,.json" />
      </div>

      <h2>書出</h2>
      <p class="hint">準備後に出力。保存完了は OS 側のため、終了後に確認ダイアログを出します。</p>
      <div class="row">
        <button type="button" class="ghost" id="exLog">log</button>
        <button type="button" class="ghost" id="exPos">pos</button>
        <button type="button" class="ghost" id="exTmp">tmp</button>
        <button type="button" class="ghost" id="exMasters">masters</button>
        <button type="button" class="ghost" id="exSettings">settings</button>
      </div>

      <h2>初期化（端末）</h2>
      <p class="hint">確認後に実行。端末のみ。settings の解除は上の「サーバー同期をオフ」を使う。</p>
      <label class="choice" style="margin:0.5rem 0">
        <input type="checkbox" id="wipeServer" disabled />
        <span>サーバー上も空で上書き（準備中・現在は無効）</span>
      </label>
      <div class="row">
        <button type="button" class="ghost" id="rstLog">log</button>
        <button type="button" class="ghost" id="rstPos">pos</button>
        <button type="button" class="ghost" id="rstTmp">tmp</button>
        <button type="button" class="ghost" id="rstMasters">masters</button>
      </div>
    </section>`,
    '',
    { backId: 'back' },
  )

  const msg = app.querySelector('#msg')!
  const panel = app.querySelector<HTMLElement>('#ioPanel')!
  let ioBusy = false

  const setMsg = (t: string, kind: 'ok' | 'bad' | 'busy' | '' = 'ok') => {
    msg.textContent = t
    msg.classList.toggle('ok', kind === 'ok')
    msg.classList.toggle('bad', kind === 'bad')
    msg.classList.toggle('busy', kind === 'busy')
    if (t) msg.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }

  const setIoBusy = (busy: boolean, activeBtn?: HTMLElement | null, busyLabel?: string) => {
    ioBusy = busy
    panel.dataset.busy = busy ? '1' : '0'
    if (busy && activeBtn) {
      activeBtn.classList.add('is-busy')
      if (busyLabel) {
        activeBtn.dataset.labelBefore = activeBtn.textContent || ''
        activeBtn.textContent = busyLabel
      }
    } else if (!busy && activeBtn) {
      if (activeBtn.dataset.labelBefore) {
        activeBtn.textContent = activeBtn.dataset.labelBefore
        delete activeBtn.dataset.labelBefore
      }
      activeBtn.classList.remove('is-busy')
    }
  }

  /** クリック直後に反応を出し、完了まで他ボタンを止める */
  const withIoBusy = async <T>(
    activeBtn: HTMLElement | null,
    busyLabel: string,
    statusText: string,
    work: () => Promise<T>,
  ): Promise<T | undefined> => {
    if (ioBusy) return undefined
    setIoBusy(true, activeBtn, busyLabel)
    setMsg(statusText, 'busy')
    try {
      return await work()
    } finally {
      setIoBusy(false, activeBtn)
    }
  }

  if (flashMsg) {
    setMsg(flashMsg, flashMsg.startsWith('失敗') ? 'bad' : 'ok')
    flashMsg = ''
  }

  app.querySelector('#back')!.addEventListener('click', () => {
    if (ioBusy) return
    view = 'menu'
    void render()
  })

  app.querySelector('#settingsOff')!.addEventListener('click', async (ev) => {
    if (!isServerSyncConfigured() || ioBusy) return
    const btn = ev.currentTarget as HTMLElement
    const sel = await chooseFromList(
      SETTINGS_OFF_CONFIRM,
      ['1.解除する', '2.戻る'],
      { withBackButton: false },
    )
    if (!sel?.includes('解除')) return
    await withIoBusy(btn, '解除中…', 'サーバー同期をオフにしています…', async () => {
      clearGoogleSession()
      await resetSettings()
      flashMsg = SETTINGS_HINT_OFF_DONE
      await render()
    })
  })

  const googleLoginBtn = app.querySelector('#googleLogin')
  if (googleLoginBtn) {
    googleLoginBtn.addEventListener('click', async (ev) => {
      const btn = ev.currentTarget as HTMLElement
      await withIoBusy(btn, 'ログイン中…', 'Google ログイン画面を開いています…', async () => {
        try {
          await requestGoogleAccessToken()
          flashMsg = 'Google ログイン成功'
          await render()
        } catch (e) {
          setMsg(`失敗: ${(e as Error).message}`, 'bad')
        }
      })
    })
  }
  const googleProbeBtn = app.querySelector('#googleProbe')
  if (googleProbeBtn) {
    googleProbeBtn.addEventListener('click', async (ev) => {
      const btn = ev.currentTarget as HTMLElement
      await withIoBusy(btn, 'テスト中…', 'Drive 疎通テスト中…', async () => {
        try {
          if (!isGoogleSignedIn()) await requestGoogleAccessToken()
          const r = await probeConfiguredDriveFolder()
          await persistFolderId(r.folderId)
          const names = r.files.map((f) => f.name).join(', ') || '（空）'
          const text = `疎通OK: フォルダ「${r.folderName}」(${r.folderId})\nファイル: ${names}`
          setMsg(text, 'ok')
          await showNoticeDialog(text)
        } catch (e) {
          setMsg(`失敗: ${(e as Error).message}`, 'bad')
        }
      })
    })
  }
  const googleLogoutBtn = app.querySelector('#googleLogout')
  if (googleLogoutBtn) {
    googleLogoutBtn.addEventListener('click', () => {
      if (ioBusy) return
      clearGoogleSession()
      flashMsg = 'Google ログアウトしました'
      void render()
    })
  }

  const runSyncBtn = (
    btnId: string,
    direction: 'pull' | 'push' | 'both',
    busyLabel: string,
    statusText: string,
  ) => {
    const btn = app.querySelector(`#${btnId}`)
    if (!btn) return
    btn.addEventListener('click', async (ev) => {
      const el = ev.currentTarget as HTMLElement
      await withIoBusy(el, busyLabel, statusText, async () => {
        try {
          const report = await runGoogleDriveSync(direction)
          const text = report.lines.join('\n')
          setMsg(text, 'ok')
          await showNoticeDialog(text)
          flashMsg = text.split('\n')[0] || text
          await render()
        } catch (e) {
          setMsg(`失敗: ${(e as Error).message}`, 'bad')
        }
      })
    })
  }
  runSyncBtn('googlePull', 'pull', '取得中…', 'Drive から取得してマージしています…（数十秒かかることがあります）')
  runSyncBtn('googlePush', 'push', '送信中…', 'Drive へ送信しています…（数十秒かかることがあります）')
  runSyncBtn('googleSync', 'both', '同期中…', '双方向同期しています…（取得→送信）')

  const showResult = async (text: string, kind: 'ok' | 'bad') => {
    setMsg(text, kind)
    await showNoticeDialog(text)
  }

  const bindImport = (
    btnId: string,
    fileId: string,
    handler: (data: unknown, fileName: string) => Promise<string>,
  ) => {
    const input = app.querySelector<HTMLInputElement>(`#${fileId}`)!
    const btn = app.querySelector(`#${btnId}`)!
    btn.addEventListener('click', () => {
      if (ioBusy) return
      setMsg(`${btnId.replace('imp', '')} のファイルを選んでください…`, 'busy')
      input.click()
    })
    input.addEventListener('change', async (ev) => {
      const file = (ev.target as HTMLInputElement).files?.[0]
      if (!file) {
        setMsg('ファイル選択をキャンセルしました', 'ok')
        return
      }
      await withIoBusy(btn as HTMLElement, '取込中…', `取込中: ${file.name}…`, async () => {
        try {
          const data = JSON.parse(await file.text()) as unknown
          const text = await handler(data, file.name)
          await showResult(text, 'ok')
          if (fileId === 'settingsFile') {
            flashMsg = text
            await render()
          }
        } catch (e) {
          await showResult(`失敗: ${(e as Error).message}`, 'bad')
        }
      })
      ;(ev.target as HTMLInputElement).value = ''
    })
  }

  bindImport('impLog', 'logFile', async (data, name) => {
    const n = await importLog(data as LogFile)
    return `取込完了: log（${name}）→ ${n} 件を最新として反映しました`
  })
  bindImport('impPos', 'posFile', async (data, name) => {
    const n = await importPos(data as PosFile)
    return `取込完了: pos（${name}）→ ${n} 件を最新として反映しました`
  })
  bindImport('impTmp', 'tmpFile', async (data, name) => {
    await importTmp(data as TmpFlag)
    return `取込完了: tmp（${name}）を最新として反映しました`
  })
  bindImport('impMasters', 'mastersFile', async (data, name) => {
    await importMasters(data as MastersFile)
    return `取込完了: masters（${name}）を最新として反映しました`
  })
  bindImport('impSettings', 'settingsFile', async (data, name) => {
    const s = await importSettings(data)
    const extra =
      s.sync.enabled && s.active === 'google' ? ` ${syncNotImplementedMessage()}` : ''
    return `取込完了: settings（${name}）→ ${syncStatusLabel()}。${extra}`
  })

  type ExportKey = 'log' | 'pos' | 'tmp' | 'masters' | 'settings'
  const exportCache: Partial<Record<ExportKey, unknown>> = {}
  const exportSpecs: {
    key: ExportKey
    btn: string
    file: string
    load: () => Promise<unknown>
  }[] = [
    { key: 'log', btn: 'exLog', file: 'log.json', load: () => exportLog() },
    { key: 'pos', btn: 'exPos', file: 'pos.json', load: () => exportPos() },
    { key: 'tmp', btn: 'exTmp', file: 'tmp.json', load: () => exportTmp() },
    { key: 'masters', btn: 'exMasters', file: 'masters.json', load: () => exportMasters() },
    { key: 'settings', btn: 'exSettings', file: 'settings.json', load: () => exportSettings() },
  ]

  void withIoBusy(null, '', 'エクスポート準備中…', async () => {
    try {
      await Promise.all(
        exportSpecs.map(async (s) => {
          exportCache[s.key] = await s.load()
        }),
      )
      setMsg('エクスポートの準備ができました。ボタンを押して出力してください。', 'ok')
    } catch (e) {
      setMsg(`準備失敗: ${(e as Error).message}`, 'bad')
    }
  })

  for (const spec of exportSpecs) {
    app.querySelector(`#${spec.btn}`)!.addEventListener('click', (ev) => {
      const el = ev.currentTarget as HTMLElement
      if (ioBusy) return
      const cached = exportCache[spec.key]
      if (cached !== undefined) {
        void withIoBusy(el, '出力中…', `${spec.file} を出力しています…`, async () => {
          const { done } = startDeviceExport(spec.file, cached, {
            preferShare: isIosDevice(),
          })
          const outcome = await done
          if (outcome === 'cancelled') {
            setMsg('出力を中止しました', 'ok')
            return
          }
          if (outcome === 'error') {
            setMsg('出力に失敗しました', 'bad')
            return
          }
          await showNoticeDialog(
            `${spec.file}\nファイル出力が成功したか確認してください。`,
          )
          setMsg(`確認してください（${spec.file}）`, 'ok')
          void spec.load().then((d) => {
            exportCache[spec.key] = d
          })
        })
        return
      }
      void withIoBusy(el, '準備中…', `${spec.file} を準備しています…`, async () => {
        try {
          const data = await spec.load()
          exportCache[spec.key] = data
          await showExportConfirmDialog(spec.file, data)
          setMsg(`確認してください（${spec.file}）`, 'ok')
        } catch (e) {
          await showResult(`失敗: ${(e as Error).message}`, 'bad')
        }
      })
    })
  }

  const confirmReset = async (label: string): Promise<boolean> => {
    const sel = await chooseFromList(
      `本当に端末の ${label} を初期化しますか？\n（サーバーは変更しません）`,
      ['1.初期化する', '2.戻る'],
      { withBackButton: false },
    )
    return Boolean(sel?.includes('初期化'))
  }

  const bindReset = (btnId: string, label: string, work: () => Promise<void>, doneMsg: string) => {
    app.querySelector(`#${btnId}`)!.addEventListener('click', async (ev) => {
      if (ioBusy) return
      const btn = ev.currentTarget as HTMLElement
      if (!(await confirmReset(label))) return
      await withIoBusy(btn, '初期化中…', `${label} を初期化しています…`, async () => {
        await work()
        await showResult(doneMsg, 'ok')
      })
    })
  }
  bindReset('rstLog', 'log', () => resetLog(), '初期化完了: log（空の NEW）')
  bindReset('rstPos', 'pos', () => resetPos(), '初期化完了: pos（空）')
  bindReset('rstTmp', 'tmp', () => resetTmp(), '初期化完了: tmp')
  bindReset(
    'rstMasters',
    'masters',
    () => resetMasters(),
    '初期化完了: masters を default に戻しました',
  )
}


function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

void render().then(() => {
  wireAutoSync()
})
