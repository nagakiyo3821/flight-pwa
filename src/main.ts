import './style.css'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { FIELDS, filled } from './fields'
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
  downloadJson,
  ensureBootstrap,
  exportLog,
  exportPos,
  exportTmp,
  findNearestPlace,
  getCurrentPosition,
  getMeta,
  getPlace,
  getWorking,
  importLog,
  importPos,
  importTmp,
  isNewRecordKey,
  listFlightKeys,
  listPlaceNames,
  nextDerivedPlaceName,
  renamePlace,
  resetWorking,
  savePlaceRecord,
  saveWorking,
  setWorkingKey,
  upsertPlace,
} from './db'
import type { FieldDef, FlightRecord, LogFile, PlaceRecord, PosFile, TmpFlag } from './types'
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
  LANDING_UPDATE_OK,
  LANDING_UPDATE_PROMPT,
  MAP_DONE,
  MAP_PROMPT,
  ITEM_BACK,
  ITEM_OK,
  MENU_PROMPT,
  NUMBER_RE,
  NET_FAIL_ADDRESS,
  NET_FAIL_ELEVATION,
  NET_FAIL_WEATHER,
  PLACE_CHOICE_HIT,
  PLACE_CHOICE_LIST,
  PLACE_CHOICE_NEW,
  PLACE_CHOICE_SKIP,
  PLACE_NAME_PROMPT,
  PLACE_DEL_BACK,
  PLACE_DEL_OK,
  PLACE_DEL_PROMPT,
  PLACE_EDIT_BACK,
  PLACE_EDIT_DEL,
  PLACE_EDIT_MAP,
  PLACE_EDIT_PROMPT,
  PLACE_HERE_NEW,
  PLACE_HERE_SKIP,
  PLACE_MENU_BACK,
  PLACE_MENU_HERE,
  PLACE_UPDATE_BACK,
  REC_DEL_BACK,
  REC_DEL_OK,
  REC_DEL_PROMPT,
  REC_JSON_IO,
  REC_MENU_BACK,
  RESET_OK,
  RESET_BACK,
  RESET_PROMPT,
  SET_BACK,
  SET_OK,
  SET_PROMPT,
  TAKEOFF_UPDATE_OK,
  TAKEOFF_UPDATE_PROMPT,
  TIMER_RESET_LATER,
  TIMER_RESET_OK,
  TIMER_RESET_PROMPT,
  TIMER_SET_LATER,
  TIMER_SET_OK,
  TIMER_SET_PROMPT,
  VER,
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
  placeDecisionCopy,
  placeEditCopyCmd,
  placeHereCopy,
  targetDataLine,
} from './ui-strings'
import { fetchWeatherSet } from './weather'
import { fetchGroundElevation, osmEmbedUrl, osmOpenUrl, reverseGeocode } from './geo'
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
import { DRONE_ID_CUSTOM, DRONE_IDS, DRONE_TYPES, isDroneType } from './drone-master'

/** ショートカットの T＝セット（tmp.TIME）からの経過秒 */
let menuTick: number | undefined
/** 期限切れダイアログを「後で」したときの抑止 */
let timerPromptDismissed: { time: string; need: TimerNeed } | null = null
let timerCheckRunning = false

type View = 'menu' | 'newa' | 'newb' | 'record-edit' | 'records' | 'checklist' | 'io' | 'places' | 'place-edit'

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

function shell(title: string, body: string, subtitle = ''): string {
  return `
  <header class="top">
    <div>
      <h1 class="prompt">${title}</h1>
      ${subtitle ? `<p class="prompt-sub" id="promptSub">${subtitle}</p>` : ''}
    </div>
  </header>
  <main>${body}</main>
  <footer class="foot">飛行記録 PWA · ver${VER}（ショートカット互換）</footer>`
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
    {
      action: 'exit',
      text: '9.終了(手動でタブを閉じる)',
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
    <section class="card menu-card">
      <div class="menu">${list}</div>
      <p id="msg" class="msg"></p>
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
): string {
  const detail = detailHtml
    ? `<div class="sc-dialog-detail">${detailHtml}</div>`
    : ''
  return `
    <div class="sc-dialog-panel">
      <header class="sc-dialog-head">
        <h1 class="prompt">${promptHtml}</h1>
      </header>
      <section class="card sc-dialog-body">
        <div class="sc-dialog-scroll">${detail}${bodyHtml}</div>
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

function openDialogRoot(): HTMLDivElement {
  stopMenuTick()
  clearStickyFocus()
  document.getElementById('sc-dialog')?.remove()
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

/** id 付きリスト選択（離着陸の場所決定など文言依存を避ける） */
function chooseFromListIds(
  prompt: string,
  choices: { id: string; label: string }[],
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
            (c) =>
              `<button type="button" class="menu-btn" data-id="${escapeHtml(c.id)}">${escapeHtml(c.label)}</button>`,
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
    root.querySelectorAll<HTMLButtonElement>('[data-id]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        finish(btn.dataset.id ?? '')
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
        ? `<input id="sc-input" class="sc-input" type="text" inputmode="decimal" autocomplete="off" value="${escapeHtml(start)}" />`
        : `<input id="sc-input" class="sc-input" type="text" inputmode="text" value="${escapeHtml(start)}" />`
    root.innerHTML = dialogShell(promptHtml, body, dialogActions({ ok: true, back: true }))
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
    const body = `<input id="sc-input" class="sc-input sc-input-date" type="date" value="${escapeHtml(value)}" required />`
    root.innerHTML = dialogShell(promptHtml, body, dialogActions({ ok: true, back: true }))
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
    const body = `<input id="sc-input" class="sc-input sc-input-time" type="time" step="60" value="${escapeHtml(value)}" required />`
    root.innerHTML = dialogShell(promptHtml, body, dialogActions({ ok: true, back: true }))
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

type LatLngAlt = { lat: number; lng: number; alt: number }
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
): string {
  return `<label class="sc-geo-field"><span>${escapeHtml(label)}</span>
    <input id="${id}" class="sc-input" type="text" inputmode="decimal" autocomplete="off" value="${escapeHtml(sanitizeNumberDraft(initial))}" /></label>`
}

/**
 * 未定の座標項目を入力。緯度・経度が必要なときはマップクリックと数値入力が連動。
 * known は GPS などで既に確定した値。戻るで null。
 */
function askMissingGeo(
  known: GeoParts,
  need: { lat: boolean; lng: boolean; alt: boolean },
  prefill?: { lat?: string; lng?: string; alt?: string },
  opts?: { lowAccuracy?: boolean; pcManual?: boolean },
): Promise<LatLngAlt | null> {
  return new Promise((resolve) => {
    const root = openDialogRoot()
    const promptHtml = escapeHtml(gpsMissingPrompt(need, opts)).replace(/\n/g, '<br/>')
    const showMap = need.lat && need.lng
    const parts: string[] = []
    if (need.lat) parts.push(geoFieldHtml('sc-lat', GPS_LABEL_LAT, prefill?.lat ?? ''))
    if (need.lng) parts.push(geoFieldHtml('sc-lng', GPS_LABEL_LNG, prefill?.lng ?? ''))
    if (need.alt) parts.push(geoFieldHtml('sc-alt', GPS_LABEL_ALT, prefill?.alt ?? ''))
    const mapHtml = showMap
      ? `<div class="sc-map-pick-wrap">
          <div id="sc-map-pick" class="sc-map-pick" role="application" aria-label="位置選択マップ"></div>
          <p class="sc-map-hint" id="sc-map-hint">マップをクリック／タップすると緯度・経度と地表標高をセット</p>
        </div>`
      : ''
    const body = `${mapHtml}<div class="sc-geo-fields">${parts.join('')}</div>`
    root.innerHTML = dialogShell(promptHtml, body, dialogActions({ ok: true, back: true }))

    const latEl = root.querySelector<HTMLInputElement>('#sc-lat')
    const lngEl = root.querySelector<HTMLInputElement>('#sc-lng')
    const altEl = root.querySelector<HTMLInputElement>('#sc-alt')
    const inputs = [latEl, lngEl, altEl].filter((el): el is HTMLInputElement => !!el)

    let map: L.Map | undefined
    let marker: L.CircleMarker | undefined
    let syncing = false

    const parseField = (el: HTMLInputElement | null): number | undefined => {
      if (!el) return undefined
      const v = normalizeNumberInput(el.value)
      return isRequiredNumber(v) ? Number(v) : undefined
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
    }

    const syncMapFromFields = () => {
      if (!map || syncing) return
      const lat = parseField(latEl)
      const lng = parseField(lngEl)
      if (lat == null || lng == null) return
      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return
      setMarker(lat, lng, true)
    }

    let elevReq = 0
    const mapHint = root.querySelector<HTMLElement>('#sc-map-hint')
    const defaultMapHint =
      'マップをクリック／タップすると緯度・経度と地表標高をセット'
    const fetchElevation = async (lat: number, lng: number) => {
      if (!need.alt || !altEl) return
      const req = ++elevReq
      const prev = altEl.value
      altEl.placeholder = '標高取得中…'
      if (mapHint) mapHint.textContent = '標高を取得中…'
      const elev = await fetchGroundElevation(lat, lng)
      if (req !== elevReq) return
      altEl.placeholder = ''
      if (elev == null) {
        if (mapHint) {
          mapHint.textContent = NET_FAIL_ELEVATION
          mapHint.classList.add('net-fail')
        }
        return
      }
      if (mapHint) {
        mapHint.textContent = defaultMapHint
        mapHint.classList.remove('net-fail')
      }
      // 取得中に手入力されていなければ、指定点の地表標高で更新
      if (altEl.value === prev) {
        altEl.value = String(elev)
        altEl.setCustomValidity('')
      }
    }

    if (showMap) {
      const startLat =
        parseField(latEl) ??
        known.lat ??
        (isRequiredNumber(normalizeNumberInput(prefill?.lat ?? ''))
          ? Number(normalizeNumberInput(prefill!.lat!))
          : 39.672926)
      const startLng =
        parseField(lngEl) ??
        known.lng ??
        (isRequiredNumber(normalizeNumberInput(prefill?.lng ?? ''))
          ? Number(normalizeNumberInput(prefill!.lng!))
          : 140.122693)

      const mapEl = root.querySelector<HTMLDivElement>('#sc-map-pick')!
      map = L.map(mapEl, { zoomControl: true }).setView([startLat, startLng], 15)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap',
      }).addTo(map)

      if (parseField(latEl) != null && parseField(lngEl) != null) {
        setMarker(startLat, startLng, false)
      }

      map.on('click', (e: L.LeafletMouseEvent) => {
        const { lat, lng } = e.latlng
        const latR = Math.round(lat * 1e8) / 1e8
        const lngR = Math.round(lng * 1e8) / 1e8
        applyLatLngToFields(latR, lngR)
        setMarker(latR, lngR, false)
        void fetchElevation(latR, lngR)
      })

      // ダイアログ表示後にサイズ再計算
      requestAnimationFrame(() => {
        map?.invalidateSize()
      })
      setTimeout(() => map?.invalidateSize(), 100)
    }

    let done = false
    const finish = (value: LatLngAlt | null) => {
      if (done) return
      done = true
      map?.remove()
      closeDialogSafely(root, () => resolve(value))
    }

    for (const el of inputs) {
      el.addEventListener('input', () => {
        const cleaned = sanitizeNumberDraft(el.value)
        if (cleaned !== el.value) el.value = cleaned
        el.setCustomValidity('')
        if (el === latEl || el === lngEl) syncMapFromFields()
      })
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') confirm()
        if (e.key === 'Escape') finish(null)
      })
    }
    inputs[0]?.focus()

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
      finish({ lat, lng, alt })
    }

    root.querySelector('#sc-ok')!.addEventListener('click', confirm)
    root.querySelector('#sc-back')!.addEventListener('click', () => finish(null))
  })
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
        `${GPS_LABEL_ALT}(${altText})m`,
      ].join('\n'),
    ).replace(/\n/g, '<br/>')
    const embed = osmEmbedUrl(lat, lng)
    const open = osmOpenUrl(lat, lng)
    const body = `
      <div class="sc-map-wrap sc-map-wrap--fill">
        <iframe class="sc-map sc-map--fill" src="${embed}" title="現在地マップ" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>
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
    root.querySelector('#sc-ok')!.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
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
    if (altitude != null && isFiniteNum(altitude)) known.alt = altitude
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

  const prompt = fieldPrompt(f, cur)

  if (f.input === 'choice2' || f.input === 'select') {
    let opts = [...(f.options ?? [])]
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

    const choices = [...opts]
    if (f.allowCustom) choices.push(f.customLabel || '任意の入力')
    const selected = await chooseFromList(prompt, choices)
    if (selected === null) return null
    if (f.allowCustom && selected === (f.customLabel || '任意の入力')) {
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

/** 項目1: 機種3択（Mavic2Pro/Tello/Other）→ 識別番号リスト＋任意入力 */
async function editDroneField(current: string): Promise<string | null> {
  const typeSel = await chooseFromList(droneTypePrompt(current), [...DRONE_TYPES])
  if (typeSel === null || !isDroneType(typeSel)) return null

  const ids = [...DRONE_IDS[typeSel], DRONE_ID_CUSTOM]
  const idSel = await chooseFromList(droneIdPrompt(current, typeSel), ids)
  if (idSel === null) return null

  let id = idSel
  if (idSel === DRONE_ID_CUSTOM) {
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
  // 住所流用時は長いので、入力欄には先頭20文字を入れる
  let draft = initial.trim().slice(0, 20)
  let err = ''
  for (;;) {
    const prompt = err ? `${PLACE_NAME_PROMPT}\n（${err}）` : PLACE_NAME_PROMPT
    const raw = await askText(prompt, draft)
    if (raw === null) return null
    const value = raw.trim()
    if (!value) {
      err = '場所名は空にできません'
      draft = ''
      continue
    }
    if (/\s/.test(value)) {
      err = '空白は使えません'
      draft = value.replace(/\s+/g, '')
      continue
    }
    if ([...value].length > 20) {
      err = '20文字以内にしてください'
      draft = [...value].slice(0, 20).join('')
      continue
    }
    const exists = await getPlace(value)
    if (exists) {
      err = `同じ場所名があります: ${value}`
      draft = value
      continue
    }
    return value
  }
}

async function runTakeoffLanding(action: 'takeoff' | 'landing'): Promise<void> {
  const msg = () => app.querySelector('#msg')
  try {
    const meta = await getMeta()
    const flag = action === 'takeoff' ? meta.tmp.DATA2 : meta.tmp.DATA3
    // FLAG=1（場所のみ更新）は確認ダイアログ
    if (flag === '1') {
      const prompt = action === 'takeoff' ? TAKEOFF_UPDATE_PROMPT : LANDING_UPDATE_PROMPT
      const okLabel = action === 'takeoff' ? TAKEOFF_UPDATE_OK : LANDING_UPDATE_OK
      const sel = await chooseFromList(prompt, [okLabel, PLACE_UPDATE_BACK], {
        withBackButton: false,
      })
      if (!sel || sel === PLACE_UPDATE_BACK || !sel.includes('更新')) {
        await render()
        return
      }
    }

    msg()!.textContent = '位置情報を取得中…'
    const { rec } = await getWorking()
    const initial =
      action === 'takeoff'
        ? { lat: rec.A_DATA1, lng: rec.A_DATA2, alt: rec.A_DATA3 }
        : { lat: rec.B_DATA1, lng: rec.B_DATA2, alt: rec.B_DATA3 }
    const coords = await resolveLatLngAlt(initial)
    if (!coords) {
      msg()!.textContent = '位置入力をキャンセルしました'
      await render()
      return
    }
    const { lat, lng, alt } = coords

    msg()!.textContent = '住所・場所を照合中…'
    const [adrsGeo, hit] = await Promise.all([
      reverseGeocode(lat, lng),
      findNearestPlace(lat, lng, alt),
    ])
    const addrFetchFailed = !String(adrsGeo ?? '').trim()
    const curAdrs = adrsGeo || hit?.place.ADRS || ''
    const newName = hit
      ? await nextDerivedPlaceName(hit.name)
      : curAdrs.trim() || '新規'

    await showMapDialog(lat, lng, alt)

    const copy = placeDecisionCopy({
      curPos: '',
      curAdrs,
      lat,
      lng,
      alt,
      hitName: hit?.name ?? '',
      hitAdrs: hit?.place.ADRS ?? '',
      posDif: hit ? hit.dist.toFixed(1) : '',
      altDif: hit ? hit.altDiff.toFixed(1) : '',
      newName,
    })
    const detail = addrFetchFailed
      ? `${copy.detail}\n\n${NET_FAIL_ADDRESS}`
      : copy.detail
    const title = copy.title
    const choiceItems = hit
      ? [
          { id: 'skip', label: PLACE_CHOICE_SKIP },
          { id: 'hit', label: PLACE_CHOICE_HIT },
          { id: 'new', label: PLACE_CHOICE_NEW },
          { id: 'list', label: PLACE_CHOICE_LIST },
        ]
      : [
          { id: 'skip', label: PLACE_CHOICE_SKIP },
          { id: 'new', label: '2.新規生成の場所名で登録' },
          { id: 'list', label: '3.場所リストから選択登録' },
        ]

    const selected = await chooseFromListIds(title, choiceItems, {
      withBackButton: false,
      detail,
    })
    if (!selected || selected === 'skip') {
      flashMsg = '場所登録をキャンセルしました'
      await render()
      return
    }

    let posName = ''
    let adrs = curAdrs
    let saveToMaster = false

    if (selected === 'hit' && hit) {
      posName = hit.name
      adrs = hit.place.ADRS || curAdrs
    } else if (selected === 'new') {
      const entered = await askNewPlaceName(newName)
      if (!entered) {
        flashMsg = '場所登録をキャンセルしました'
        await render()
        return
      }
      posName = entered
      saveToMaster = true
    } else if (selected === 'list') {
      const names = await listPlaceNames()
      if (!names.length) {
        flashMsg = '場所リストが空です'
        await render()
        return
      }
      const picked = await chooseFromList('場所を選択してください。', names)
      if (!picked) {
        flashMsg = '場所登録をキャンセルしました'
        await render()
        return
      }
      posName = picked
      const listed = await getPlace(picked)
      adrs = listed?.ADRS || curAdrs
    } else {
      flashMsg = '場所登録をキャンセルしました'
      await render()
      return
    }

    if (!posName.trim()) {
      flashMsg = '場所名を決定できませんでした'
      await render()
      return
    }

    if (saveToMaster) {
      // ショートカット新規登録は POSAC/ALTAC=1
      await upsertPlace(posName, { lat, lng, alt, adrs, posac: '1', altac: '1' })
    }

    const updateTime = flag === '2'
    const when = formatNow()
    if (action === 'takeoff') {
      if (updateTime || !rec.A_DATE) {
        const synced = syncAfterTakeoffDate(when, rec.B_DATE)
        rec.A_DATE = synced.A_DATE
        rec.B_DATE = synced.B_DATE
      }
      rec.A_DATA1 = String(lat)
      rec.A_DATA2 = String(lng)
      rec.A_DATA3 = String(alt)
      rec.A_ADRS = adrs
      rec.A_POS = posName
    } else {
      if (updateTime || !rec.B_DATE) {
        const synced = syncAfterLandingDate(rec.A_DATE, when)
        rec.A_DATE = synced.A_DATE
        rec.B_DATE = synced.B_DATE
      }
      rec.B_DATA1 = String(lat)
      rec.B_DATA2 = String(lng)
      rec.B_DATA3 = String(alt)
      rec.B_ADRS = adrs
      rec.B_POS = posName
    }
    hydrateFlightDurationCache(rec.A_DATE, rec.B_DATE)
    await saveWorking(rec)
    flashMsg = `${action === 'takeoff' ? '離陸' : '着陸'}を登録しました（${posName}）`
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
  const msg = () => app.querySelector('#msg')
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

/** メニュー表示時: 2h 超で再セット、24h 超でリセット要求 */
async function enforceSessionTimers(timeRaw: string): Promise<void> {
  if (timerCheckRunning || view !== 'menu') return
  const need = evaluateTimers(timeRaw)
  if (need === 'ok') {
    timerPromptDismissed = null
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

    if (need === 'need_set' || need === 'no_time') {
      const prompt =
        need === 'no_time'
          ? 'セット日時が無いため、気象データをセットしてください。'
          : TIMER_SET_PROMPT
      const sel = await chooseFromList(
        prompt,
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

function newaFields(): FieldDef[] {
  // NEWA: #?項目の次は 1〜37、最後に 63
  return FIELDS.filter((f) => (f.no >= 1 && f.no <= 37) || f.no === 63).sort(
    (a, b) => a.no - b.no,
  )
}

function newbFields(): FieldDef[] {
  // NEWB: 38〜63
  return FIELDS.filter((f) => f.no >= 38 && f.no <= 63).sort((a, b) => a.no - b.no)
}

function freeFields(): FieldDef[] {
  return FIELDS.filter((f) => f.no >= 1 && f.no <= 63).sort((a, b) => a.no - b.no)
}

function editFieldsFor(kind: 'A' | 'B' | 'F'): FieldDef[] {
  if (kind === 'A') return newaFields()
  if (kind === 'B') return newbFields()
  return freeFields()
}

async function renderRecords(): Promise<void> {
  const keys = await listFlightKeys()
  const meta = await getMeta()
  const drone = meta.tmp.DRONE || 'Mavic2Pro'
  const rows = [
    { id: 'back', text: REC_MENU_BACK },
    ...keys.map((k) => ({ id: `k:${k}`, text: k })),
    { id: 'io', text: REC_JSON_IO },
  ]
  const list = rows
    .map(
      (it) =>
        `<button type="button" class="menu-btn" data-id="${escapeHtml(it.id)}">${escapeHtml(it.text)}</button>`,
    )
    .join('')

  app.innerHTML = shell(
    escapeHtml(`登録データ管理（ver${VER}${drone}）`),
    `
    <section class="card menu-card">
      <div class="menu">${list}</div>
      <p id="msg" class="msg"></p>
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
  if (id === 'io') {
    view = 'io'
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
  const fields = editFieldsFor(kind)
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
    <section class="card menu-card">
      <div class="menu">${list}</div>
      <p id="msg" class="msg"></p>
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
    await runSequentialFields(editFieldsFor(kind))
    await render()
    return
  }
  if (id === 'empty') {
    const { rec } = await getWorking()
    const fields = editFieldsFor(kind).filter((f) => isFieldEmpty(rec, f))
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
  const places = await listPlaceNames()
  const fields = FIELDS.filter((f) => {
    if (checklistFilter === 'pre') return f.group === 'pre' || f.group === 'ops' || f.no === 63
    if (checklistFilter === 'post') return f.group === 'post' || f.group === 'takeoff' || f.no === 63
    return true
  })

  const title =
    checklistFilter === 'pre' ? '離陸前チェック' : checklistFilter === 'post' ? '着陸後・離着陸' : '全項目'

  const rows = fields
    .map((f) => fieldRow(f, rec, places))
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

function fieldRow(f: FieldDef, rec: FlightRecord, places: string[]): string {
  if (f.input === 'flightDuration' || !f.key) {
    const hm = displayFlightHm(rec.A_DATE, rec.B_DATE)
    return `<label class="field"><span>${f.no}. ${f.label} <em>時分</em></span>
      <input name="FLIGHT_HM" class="sc-input-time" type="time" step="60" value="${escapeHtml(toTimeInputValue(hm) || '')}" /></label>`
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

  if (f.input === 'choice2' && f.options) {
    const opts = f.options
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
      <input list="places" name="${f.key}" value="${val}" />
      <datalist id="places">${opts}</datalist>
    </label>`
  }
  if (f.input === 'select' && f.options) {
    const opts = f.options
      .map((o) => `<option value="${escapeHtml(o)}" ${o === rec[f.key!] ? 'selected' : ''}>${escapeHtml(o)}</option>`)
      .join('')
    return `<label class="field"><span>${f.no}. ${f.label} <em>${kind}</em></span>
      <select name="${f.key}"><option value="">（未入力）</option>${opts}
      ${rec[f.key] && !f.options.includes(rec[f.key]) ? `<option value="${val}" selected>${val}</option>` : ''}
      </select></label>`
  }
  if (f.input === 'datetime') {
    const d = parseFlightDate(rec[f.key] ?? '')
    const dateVal = d ? toDateInputValue(formatYmd(d)) : ''
    const timeVal = d ? formatHmFromDate(d) : ''
    return `<fieldset class="field datetime-set"><legend>${f.no}. ${f.label} <em>${kind}</em></legend>
      <div class="datetime-row">
        <label class="datetime-part"><span>月日</span>
          <input name="${f.key}__date" class="sc-input-date" type="date" value="${escapeHtml(dateVal)}" /></label>
        <label class="datetime-part"><span>時間</span>
          <input name="${f.key}__time" class="sc-input-time" type="time" step="60" value="${escapeHtml(timeVal)}" /></label>
      </div>
      <input type="hidden" name="${f.key}" value="${val}" />
    </fieldset>`
  }
  if (f.input === 'time') {
    const hm = toTimeInputValue(String(rec[f.key] ?? '').trim())
    return `<label class="field"><span>${f.no}. ${f.label} <em>${kind}</em></span>
      <input name="${f.key}" class="sc-input-time" type="time" step="60" value="${escapeHtml(hm)}" /></label>`
  }
  const ph = f.input === 'number' ? '数値を入力' : '記述入力'
  if (f.input === 'number') {
    return `<label class="field"><span>${f.no}. ${f.label} <em>${kind}</em></span>
      <input name="${f.key}" class="num-input" type="text" inputmode="decimal" autocomplete="off" placeholder="${ph}" value="${val}" /></label>`
  }
  return `<label class="field"><span>${f.no}. ${f.label} <em>${kind}</em></span>
    <input name="${f.key}" type="text" inputmode="text" placeholder="${ph}" value="${val}" /></label>`
}

async function renderPlaces(): Promise<void> {
  const names = await listPlaceNames()
  const rows = [
    { id: 'back', text: PLACE_MENU_BACK },
    { id: 'here', text: PLACE_MENU_HERE },
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
    <section class="card menu-card">
      <div class="menu">${list}</div>
      <p id="msg" class="msg"></p>
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
  if (id === 'here') {
    await runPlaceHereSearch()
    await render()
    return
  }
  if (id.startsWith('p:')) {
    placeEditName = id.slice(2)
    view = 'place-edit'
    await render()
  }
}

/** 場所管理の %現在地検索（登録しない／新規のみ。検索結果名での上書きはしない） */
async function runPlaceHereSearch(): Promise<void> {
  const msg = () => app.querySelector('#msg')
  try {
    msg()!.textContent = '位置情報を取得中…'
    const coords = await resolveLatLngAlt()
    if (!coords) {
      flashMsg = '位置入力をキャンセルしました'
      return
    }
    const { lat, lng, alt } = coords
    msg()!.textContent = '住所・場所を照合中…'
    const [adrsGeo, hit] = await Promise.all([
      reverseGeocode(lat, lng),
      findNearestPlace(lat, lng, alt),
    ])
    const addrFetchFailed = !String(adrsGeo ?? '').trim()
    const curAdrs = adrsGeo || hit?.place.ADRS || ''
    const newName = hit
      ? await nextDerivedPlaceName(hit.name)
      : curAdrs.trim() || '新規'

    await showMapDialog(lat, lng, alt)

    const copy = placeHereCopy({
      curAdrs,
      lat,
      lng,
      alt,
      hitName: hit?.name ?? '',
      hitAdrs: hit?.place.ADRS ?? '',
      posDif: hit ? hit.dist.toFixed(1) : '',
      altDif: hit ? hit.altDiff.toFixed(1) : '',
      newName,
    })
    const detail = addrFetchFailed
      ? `${copy.detail}\n\n${NET_FAIL_ADDRESS}`
      : copy.detail
    const selected = await chooseFromList(copy.title, [PLACE_HERE_SKIP, PLACE_HERE_NEW], {
      withBackButton: false,
      detail,
    })
    if (!selected || selected === PLACE_HERE_SKIP) {
      flashMsg = '場所登録をキャンセルしました'
      return
    }
    const entered = await askNewPlaceName(newName)
    if (!entered) {
      flashMsg = '場所登録をキャンセルしました'
      return
    }
    await upsertPlace(entered, { lat, lng, alt, adrs: curAdrs, posac: '1', altac: '1' })
    placeEditName = entered
    view = 'place-edit'
    flashMsg = `場所を登録しました（${entered}）`
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
  { no: 5, key: 'DATA3', label: '高度', number: true },
  { no: 6, key: 'POSAC', label: '位置精度', number: true },
  { no: 7, key: 'ALTAC', label: '高度精度', number: true },
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
    <section class="card menu-card">
      <div class="menu">${list}</div>
      <p id="msg" class="msg"></p>
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
      `高度:${place.DATA3 || ''}`,
      `位置精度:${place.POSAC || ''}`,
      `高度精度:${place.ALTAC || ''}`,
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
  app.innerHTML = shell(
    'JSON入出力',
    `
    <section class="card">
      <h2>インポート（現行 JSON）</h2>
      <p class="hint">ショートカットと同じ log / pos / tmp を読み込みます。</p>
      <label class="field">log JSON<input type="file" id="logFile" accept="application/json,.json" /></label>
      <label class="field">pos JSON<input type="file" id="posFile" accept="application/json,.json" /></label>
      <label class="field">tmp JSON<input type="file" id="tmpFile" accept="application/json,.json" /></label>
      <h2>エクスポート</h2>
      <div class="row">
        <button type="button" class="primary" id="exLog">log を保存</button>
        <button type="button" class="primary" id="exPos">pos を保存</button>
        <button type="button" class="ghost" id="exTmp">tmp を保存</button>
      </div>
      <div class="row" style="margin-top:1rem">
        <button type="button" class="ghost" id="back">登録データ一覧へ</button>
      </div>
      <p id="msg" class="msg"></p>
    </section>`,
  )

  const msg = app.querySelector('#msg')!
  app.querySelector('#back')!.addEventListener('click', () => {
    view = 'records'
    void render()
  })
  app.querySelector('#logFile')!.addEventListener('change', async (ev) => {
    const file = (ev.target as HTMLInputElement).files?.[0]
    if (!file) return
    const data = JSON.parse(await file.text()) as LogFile
    const n = await importLog(data)
    msg.textContent = `log を ${n} 件取り込みました`
  })
  app.querySelector('#posFile')!.addEventListener('change', async (ev) => {
    const file = (ev.target as HTMLInputElement).files?.[0]
    if (!file) return
    const data = JSON.parse(await file.text()) as PosFile
    const n = await importPos(data)
    msg.textContent = `pos を ${n} 件取り込みました`
  })
  app.querySelector('#tmpFile')!.addEventListener('change', async (ev) => {
    const file = (ev.target as HTMLInputElement).files?.[0]
    if (!file) return
    const data = JSON.parse(await file.text()) as TmpFlag
    await importTmp(data)
    msg.textContent = `tmp を取り込みました（SR ${data.A_SR || '?'} / SS ${data.A_SS || '?'}）`
  })
  app.querySelector('#exLog')!.addEventListener('click', async () => {
    downloadJson('log03.json', await exportLog())
    msg.textContent = 'log をダウンロードしました（ファイルアプリ／保存先へ）'
  })
  app.querySelector('#exPos')!.addEventListener('click', async () => {
    downloadJson('pos03.json', await exportPos())
    msg.textContent = 'pos をダウンロードしました'
  })
  app.querySelector('#exTmp')!.addEventListener('click', async () => {
    downloadJson('tmp03.json', await exportTmp())
    msg.textContent = 'tmp をダウンロードしました'
  })
}


function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

void render()
