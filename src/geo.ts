/** 逆ジオコード（住所）。失敗・タイムアウト時は address 空＋ status で区別。 */

const REVERSE_GEO_OVERALL_MS = 9000
const REVERSE_GEO_ONE_MS = 4000

export type ReverseGeocodeStatus = 'ok' | 'empty' | 'timeout'

export type ReverseGeocodeResult = {
  address: string
  status: ReverseGeocodeStatus
}

export async function reverseGeocode(
  lat: number,
  lng: number,
): Promise<ReverseGeocodeResult> {
  const raced = await Promise.race([
    reverseGeocodeInner(lat, lng).then((address) => ({
      kind: 'done' as const,
      address,
    })),
    new Promise<{ kind: 'timeout' }>((resolve) => {
      window.setTimeout(() => resolve({ kind: 'timeout' }), REVERSE_GEO_OVERALL_MS)
    }),
  ])
  if (raced.kind === 'timeout') return { address: '', status: 'timeout' }
  const address = String(raced.address ?? '').trim()
  return { address, status: address ? 'ok' : 'empty' }
}

async function reverseGeocodeInner(lat: number, lng: number): Promise<string> {
  // 日本域: 住居表示を優先（地番は使わない）。失敗時は従来合成へ。
  if (isLikelyJapan(lat, lng)) {
    // 重い「番」総当りは後段。先に並列で取れるものだけ待つ
    const emptyHr: HeartRailsParts = {
      prefecture: '',
      city: '',
      town: '',
      address: '',
    }
    const emptyNom: NominatimParts = { address: '', chome: '', houseNumber: '' }
    const [jageHits, hr, nom, gsiChome] = await Promise.all([
      withTimeout(fetchJageReverseHits(lat, lng), REVERSE_GEO_ONE_MS, [] as JageReverseHit[]),
      withTimeout(reverseHeartRailsParts(lat, lng), REVERSE_GEO_ONE_MS, emptyHr),
      withTimeout(reverseNominatimParts(lat, lng), REVERSE_GEO_ONE_MS, emptyNom),
      withTimeout(reverseGsiChome(lat, lng), REVERSE_GEO_ONE_MS, ''),
    ])

    // 1) 逆ジオで号／番が取れたら最優先（○丁目△-◇）
    const fromHits = addressFromJageHits(jageHits, lat, lng)
    if (fromHits) return fromHits

    // 2) 丁目までは取れていることが多い → 番地補完を「丁目のみ合成」より先に試す
    //    （以前は merge が丁目で成功して番探しに届かないことがあった）
    const prefix =
      chomePrefixFromHits(jageHits) || chomePrefixFromParts(hr, gsiChome, nom)
    if (prefix) {
      const banFull = await withTimeout(
        findClosestJyukyoBanByGeocode(prefix, lat, lng, 2200),
        2800,
        null,
      )
      if (banFull) return formatJageocoderResidential(banFull)

      const withNom = appendHouseNumber(normalizeJpAddress(prefix), nom.houseNumber)
      if (nom.houseNumber && withNom !== normalizeJpAddress(prefix)) {
        return normalizeJpAddress(withNom)
      }
    }

    // 3) 従来の HeartRails + GSI + Nominatim 合成
    const merged = mergeJapanAddress(hr, nom, gsiChome)
    if (merged) return merged
    if (prefix) return normalizeJpAddress(prefix)
  }
  const nom = await withTimeout(
    reverseNominatimParts(lat, lng),
    REVERSE_GEO_ONE_MS,
    { address: '', chome: '', houseNumber: '' } as NominatimParts,
  )
  if (nom.address) return nom.address
  return withTimeout(reverseBigDataCloud(lat, lng), REVERSE_GEO_ONE_MS, '')
}

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    let done = false
    const t = window.setTimeout(() => {
      if (done) return
      done = true
      resolve(fallback)
    }, ms)
    p.then(
      (v) => {
        if (done) return
        done = true
        window.clearTimeout(t)
        resolve(v)
      },
      () => {
        if (done) return
        done = true
        window.clearTimeout(t)
        resolve(fallback)
      },
    )
  })
}

async function fetchJson(
  url: string,
  ms = REVERSE_GEO_ONE_MS,
  init?: RequestInit,
): Promise<unknown | null> {
  const ctrl = new AbortController()
  const t = window.setTimeout(() => ctrl.abort(), ms)
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  } finally {
    window.clearTimeout(t)
  }
}

function isLikelyJapan(lat: number, lng: number): boolean {
  return lat >= 20 && lat <= 46 && lng >= 122 && lng <= 154
}

type HeartRailsParts = {
  prefecture: string
  city: string
  town: string
  address: string
}

type NominatimParts = {
  address: string
  /** 丁目付き町名（例: 山王4丁目） */
  chome: string
  houseNumber: string
}

type JageNode = {
  fullname?: string[]
  name?: string
  level?: number
  priority?: number
  x?: number
  y?: number
}

type JageReverseHit = {
  candidate?: JageNode
  dist?: number
}

/**
 * Jageocoder 公開デモ API。
 * 住居表示（○丁目○番／○-○）を優先。地番（○番地）は使わない。
 * 出典: https://jageocoder.info-proto.com/webapi （デモ用途・無保証）
 */
function addressFromJageHits(
  hits: JageReverseHit[],
  lat: number,
  lng: number,
): string {
  if (!hits.length) return ''

  // 号（level 8）を優先 → ○丁目△-◇
  const goHits = hits.filter((h) => isJyukyoGoNode(h.candidate))
  const bestGo = pickClosestJageHit(goHits, lat, lng, JAGE_GO_MAX_M)
  if (bestGo?.candidate?.fullname) {
    return formatJageocoderResidential(bestGo.candidate.fullname)
  }

  // 街区（level 7）→ ○丁目△
  const banHits = hits.filter((h) => isJyukyoBanNode(h.candidate))
  const bestBan = pickClosestJageHit(banHits, lat, lng, JAGE_BAN_MAX_M)
  if (bestBan?.candidate?.fullname) {
    return formatJageocoderResidential(bestBan.candidate.fullname)
  }
  return ''
}

/** 街区代表点はクリック位置から離れやすいので緩め。号は建物寄りなので狭め。 */
const JAGE_BAN_MAX_M = 280
const JAGE_GO_MAX_M = 120

async function fetchJageReverseHits(lat: number, lng: number): Promise<JageReverseHit[]> {
  // level 8（号）と 7（番）を並列取得（直列だと後段がタイムアウトしやすい）
  const levels = [8, 7] as const
  const batches = await Promise.all(
    levels.map(async (level) => {
      const url =
        `https://jageocoder.info-proto.com/rgeocode` +
        `?lat=${encodeURIComponent(String(lat))}` +
        `&lon=${encodeURIComponent(String(lng))}` +
        `&level=${level}&opts=all`
      const data = await fetchJson(url, REVERSE_GEO_ONE_MS)
      return Array.isArray(data) ? (data as JageReverseHit[]) : []
    }),
  )
  return batches.flat()
}

function fullnameHasBanchi(c?: JageNode | null): boolean {
  if (!c) return true
  if (/番地/.test(String(c.name ?? ''))) return true
  return /番地/.test((c.fullname ?? []).join(''))
}

/** 住居表示の街区「12番」（地番の「12番地」は除外） */
function isJyukyoBanNode(c?: JageNode | null): boolean {
  if (!c) return false
  const name = String(c.name ?? '')
  if (!/^\d+番$/.test(name)) return false
  if (fullnameHasBanchi(c)) return false
  // priority 3 付近が住居表示街区。緩く 9 未満も許容
  return (c.priority ?? 9) < 9
}

/** 住居表示の号「12号」（fullname に親の「n番」を含むもの） */
function isJyukyoGoNode(c?: JageNode | null): boolean {
  if (!c) return false
  const name = String(c.name ?? '')
  if (!/^\d+号$/.test(name)) return false
  if (fullnameHasBanchi(c)) return false
  const full = c.fullname ?? []
  if (!full.some((p) => /^\d+番$/.test(String(p)))) return false
  return (c.priority ?? 9) < 9 || c.level === 8
}

function pickClosestJageHit(
  hits: JageReverseHit[],
  lat: number,
  lng: number,
  maxMeters: number,
): JageReverseHit | null {
  let best: JageReverseHit | null = null
  let bestD = Infinity
  for (const h of hits) {
    const c = h.candidate
    if (!c?.fullname?.length) continue
    const d =
      c.y != null && c.x != null
        ? haversineMeters(lat, lng, c.y, c.x)
        : (h.dist ?? Infinity)
    if (d < bestD) {
      bestD = d
      best = h
    }
  }
  return bestD <= maxMeters ? best : null
}

/** HeartRails / GSI / Nominatim から丁目付きプレフィックスを組み立て */
function chomePrefixFromParts(
  hr: HeartRailsParts,
  gsiChome: string,
  nom: NominatimParts,
): string {
  const pref = hr.prefecture.trim()
  const city = hr.city.trim()
  const chome = normalizeChome((gsiChome || nom.chome || '').trim())
  if (pref || city || chome) {
    const town = chome || hr.town.trim()
    const built = [pref, city, town].filter(Boolean).join('')
    if (built && /丁目/.test(built)) return normalizeJpAddress(built)
  }
  if (hr.address && /丁目/.test(hr.address)) {
    return normalizeJpAddress(applyChomeToBase(hr.address, chome))
  }
  return ''
}

/** 逆ジオ候補から「県+市+町+丁目」を組み立て（地番番号は含めない） */
function chomePrefixFromHits(hits: JageReverseHit[]): string {
  for (const h of hits) {
    const parts = h.candidate?.fullname
    if (!parts?.length) continue
    const head: string[] = []
    let chome = ''
    for (const raw of parts) {
      const p = normalizeChome(String(raw).trim())
      if (!p) continue
      if (/番地/.test(p) || /^\d+番$/.test(p) || /^\d+号$/.test(p) || /^\d+$/.test(p)) {
        break
      }
      const townChome = p.match(
        /^(.*?)((?:[0-9０-９]+|[一二三四五六七八九十百]+)丁目)$/u,
      )
      if (townChome?.[2]) {
        if (townChome[1]?.trim()) head.push(townChome[1].trim())
        chome = normalizeChome(townChome[2])
        break
      }
      if (/丁目$/.test(p)) {
        chome = p
        break
      }
      head.push(p)
    }
    if (chome) return normalizeJpAddress(head.join('') + chome)
  }
  return ''
}

/**
 * 同一丁目内の住居表示「n番」を前方ジオコードで探し、クリック地点に最も近いものを返す。
 * deadlineMs 以内に終わらなければ打ち切り（住所取得中のまま固まらないようにする）。
 */
async function findClosestJyukyoBanByGeocode(
  chomePrefix: string,
  lat: number,
  lng: number,
  deadlineMs = 2000,
): Promise<string[] | null> {
  let best: { fullname: string[]; dist: number } | null = null
  const maxBan = 30
  const batch = 5
  let consecutiveMiss = 0
  const started = Date.now()

  for (let start = 1; start <= maxBan; start += batch) {
    if (Date.now() - started > deadlineMs) break
    const bans = Array.from(
      { length: Math.min(batch, maxBan - start + 1) },
      (_, i) => start + i,
    )
    const nodes = await Promise.all(bans.map((n) => geocodeJyukyoBan(chomePrefix, n)))
    let batchHit = false
    for (let i = 0; i < bans.length; i++) {
      const node = nodes[i]
      if (!node?.fullname || node.y == null || node.x == null) continue
      batchHit = true
      const d = haversineMeters(lat, lng, node.y, node.x)
      if (!best || d < best.dist) best = { fullname: node.fullname, dist: d }
    }
    if (batchHit) consecutiveMiss = 0
    else {
      consecutiveMiss++
      if (start > 10 && consecutiveMiss >= 2) break
    }
  }

  if (best && best.dist <= JAGE_BAN_MAX_M) return best.fullname
  return null
}

async function geocodeJyukyoBan(
  chomePrefix: string,
  ban: number,
): Promise<JageNode | null> {
  try {
    const addr = `${chomePrefix}${ban}番`
    const url =
      `https://jageocoder.info-proto.com/geocode` +
      `?addr=${encodeURIComponent(addr)}&opts=all`
    const data = await fetchJson(url, 2000)
    if (!Array.isArray(data)) return null
    const node = (data as Array<{ node?: JageNode }>)?.[0]?.node
    if (!node) return null
    if (!isJyukyoBanNode(node)) return null
    if (String(node.name) !== `${ban}番`) return null
    return node
  } catch {
    return null
  }
}

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const toR = (d: number) => (d * Math.PI) / 180
  const dLat = toR(lat2 - lat1)
  const dLng = toR(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

/**
 * Jageocoder fullname → 既存 pos 風の住居表示。
 * 例: […, 四丁目, 16番, 12号] → …4丁目16-12
 *     […, 二丁目, 4番] → …2丁目4
 * 地番（○番地）トークンは住居表示としては採用しない。
 */
function formatJageocoderResidential(parts: string[]): string {
  const tokens = parts.map((p) => String(p).trim()).filter(Boolean)
  const head: string[] = []
  let chome = ''
  let ban = ''
  let go = ''

  for (const raw of tokens) {
    const p = normalizeChome(raw)

    // 地番系はスキップ（住居表示専用フォーマッタ）
    if (/番地/.test(p) || /番地/.test(raw)) continue

    // 「御野場新町4丁目」のように町名＋丁目が一体のとき分割
    const townChome = p.match(
      /^(.*?)((?:[0-9０-９]+|[一二三四五六七八九十百]+)丁目)$/u,
    )
    if (townChome && townChome[2]) {
      const townPart = (townChome[1] ?? '').trim()
      if (townPart) head.push(townPart)
      chome = normalizeChome(townChome[2])
      continue
    }
    if (/丁目$/.test(p)) {
      chome = p
      continue
    }

    // 住居表示街区: 「16番」
    const banM = p.match(/^(\d+)番$/)
    if (banM) {
      ban = banM[1]!
      continue
    }
    const banK = raw.match(/^([一二三四五六七八九十百]+)番$/)
    if (banK) {
      const n = kanjiNumeralToArabic(banK[1]!)
      if (n != null) {
        ban = String(n)
        continue
      }
    }

    // 住居番号: 「12号」
    const goM = p.match(/^(\d+)号$/)
    if (goM) {
      go = goM[1]!
      continue
    }

    // 素の数字は号候補（番地枝番は上で除外済みの想定）
    if (/^\d+$/.test(p)) {
      if (ban) go = p
      else if (chome) ban = p
      continue
    }

    head.push(p)
  }

  let tail = chome
  if (ban && go) tail += `${ban}-${go}`
  else if (ban) tail += ban
  else if (go) tail += go

  return normalizeJpAddress(head.join('') + tail)
}

/** 簡単な漢数字 → アラビア数字（丁目・番地用。1〜99 程度） */
function kanjiNumeralToArabic(k: string): number | null {
  const dig: Record<string, number> = {
    一: 1,
    二: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
  }
  if (k === '十') return 10
  if (dig[k] != null) return dig[k]!
  if (k.startsWith('十') && k.length === 2 && dig[k[1]!]) return 10 + dig[k[1]!]!
  if (k.endsWith('十') && k.length === 2 && dig[k[0]!]) return dig[k[0]!]! * 10
  if (k.length === 3 && k[1] === '十' && dig[k[0]!] && dig[k[2]!]) {
    return dig[k[0]!]! * 10 + dig[k[2]!]!
  }
  return null
}

/**
 * 県・市は HeartRails、町丁目は GSI → Nominatim、番地は Nominatim（OSM 依存）。
 * Nominatim の house_number も「16-12」形式ならそのまま末尾へ。
 */
function mergeJapanAddress(
  hr: HeartRailsParts,
  nom: NominatimParts,
  gsiChome: string,
): string {
  const pref = hr.prefecture.trim()
  const city = hr.city.trim()
  const hrTown = hr.town.trim()
  const chome = normalizeChome((gsiChome || nom.chome || '').trim())
  const num = nom.houseNumber.trim()

  // 町丁目: GSI/Nominatim の丁目付きを優先。無ければ HeartRails 町名
  let town = ''
  if (chome) {
    town = chome
  } else if (hrTown) {
    town = hrTown
  }

  // HeartRails だけ取れている場合（構造化フィールド欠落時）
  if (!pref && !city && hr.address) {
    const base = applyChomeToBase(hr.address, chome)
    const withNum = appendHouseNumber(base, num)
    if (withNum) return normalizeJpAddress(withNum)
  }

  const parts = [pref, city, town].filter(Boolean)
  let built = parts.join('')
  if (!built) {
    built = nom.address || hr.address
  } else if (!town && nom.address && nom.address.length > built.length) {
    built = nom.address
  }

  built = appendHouseNumber(built, num)
  return normalizeJpAddress(built)
}

/** 末尾の粗い町名を丁目付きに差し替え（山王 → 山王4丁目） */
function applyChomeToBase(base: string, chome: string): string {
  if (!chome) return base
  if (!base) return chome
  if (base.includes(chome)) return base
  const stem = chomeStem(chome)
  if (stem && base.endsWith(stem)) {
    return base.slice(0, -stem.length) + chome
  }
  if (stem && base.includes(stem) && !/丁目/.test(base)) {
    return base.replace(stem, chome)
  }
  if (!/丁目/.test(base)) return base + chome
  return base
}

function chomeStem(chome: string): string {
  return chome.replace(/[0-9０-９一二三四五六七八九十百]+丁目$/u, '').trim()
}

function appendHouseNumber(base: string, num: string): string {
  if (!num) return base
  if (!base) return num
  if (base.includes(num)) return base
  // 末尾が既に番地っぽい数字／ハイフンなら付けない
  if (/(?:\d+[-−ー]\d+(?:[-−ー]\d+)?|\d+番(?:地)?(?:\d+号)?|\d+)$/u.test(base)) {
    return base
  }
  return base + num
}

/** 住所文字列の正規化（国名・地方名・空白・重複を除去） */
export function normalizeJpAddress(raw: string): string {
  let s = raw.replace(/\s+/g, '').replace(/,/g, '')
  // 国・地方・大陸など住所に不要な語を落とす
  s = s.replace(
    /^(日本|日本国)?(北海道地方|東北地方|関東地方|中部地方|近畿地方|中国地方|四国地方|九州地方|沖縄地方)?/,
    '',
  )
  s = s.replace(/日本東北地方|日本国?/g, '')
  // 「秋田県秋田県」などの重複を圧縮
  s = collapseDuplicateChunks(s)
  return s.trim()
}

function collapseDuplicateChunks(s: string): string {
  // 先頭から都道府県〜市区町村の重複連結を軽減
  const prefs =
    /^(北海道|東[京都]|西[京]|大阪府|神奈川県|和歌山県|鹿児島県|.{2,3}[都道府県])/
  const m = s.match(prefs)
  if (!m) return s
  const pref = m[1]!
  let rest = s.slice(pref.length)
  if (rest.startsWith(pref)) rest = rest.slice(pref.length)
  return pref + rest
}

/**
 * HeartRails Geo API（都道府県+市区町村+町名。町名に丁目が無いことが多い）
 * https://geoapi.heartrails.com/
 */
async function reverseHeartRailsParts(lat: number, lng: number): Promise<HeartRailsParts> {
  const empty: HeartRailsParts = { prefecture: '', city: '', town: '', address: '' }
  try {
    const url =
      `https://geoapi.heartrails.com/api/json` +
      `?method=searchByGeoLocation` +
      `&x=${encodeURIComponent(String(lng))}` +
      `&y=${encodeURIComponent(String(lat))}`
    const data = (await fetchJson(url)) as {
      response?: {
        location?:
          | {
              prefecture?: string
              city?: string
              town?: string
              distance?: number
            }
          | {
              prefecture?: string
              city?: string
              town?: string
              distance?: number
            }[]
      }
    } | null
    if (!data) return empty
    const locRaw = data.response?.location
    const list = Array.isArray(locRaw) ? locRaw : locRaw ? [locRaw] : []
    if (!list.length) return empty
    // 最短距離を採用
    const best = [...list].sort(
      (a, b) => (a.distance ?? 0) - (b.distance ?? 0),
    )[0]!
    const prefecture = (best.prefecture ?? '').trim()
    const city = (best.city ?? '').trim()
    const town = (best.town ?? '').trim()
    const address = normalizeJpAddress([prefecture, city, town].filter(Boolean).join(''))
    return { prefecture, city, town, address }
  } catch {
    return empty
  }
}

/**
 * 国土地理院 逆ジオコーダ（町丁目 = lv01Nm）。
 * CORS で失敗する場合あり → そのときは空（Nominatim で補う）。
 */
async function reverseGsiChome(lat: number, lng: number): Promise<string> {
  try {
    const url =
      `https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress` +
      `?lat=${encodeURIComponent(String(lat))}` +
      `&lon=${encodeURIComponent(String(lng))}`
    const data = (await fetchJson(url)) as {
      results?: { muniCd?: string; lv01Nm?: string } | null
    } | null
    if (!data) return ''
    const name = String(data.results?.lv01Nm ?? '').trim()
    // 「（該当なし）」等を除外
    if (!name || /該当なし|不明/.test(name)) return ''
    return normalizeChome(name)
  } catch {
    return ''
  }
}

/**
 * 高度(m)を小数第1位に丸める（GPS／DEM／入力の統一）。
 */
export function roundAltMeters(n: number): number {
  return Math.round(n * 10) / 10
}

/**
 * 指定座標の地表標高 (m)。
 * 日本域は国土地理院（ショートカット同様）、失敗時は Open-Meteo。
 * 取得不可なら null。
 */
export async function fetchGroundElevation(
  lat: number,
  lng: number,
): Promise<number | null> {
  const gsi = await elevationGsi(lat, lng)
  if (gsi != null) return gsi
  return elevationOpenMeteo(lat, lng)
}

/**
 * GPS 高度と DEM 地表標高の差がこの値(m)以内なら「地表扱い」→ DEM を採用。
 * 手持ち端末の高さ・GPS 鉛直誤差・DEM メッシュ誤差を見込む。
 * これを超える差があればビル等の高所とみなし GPS 高度を残す。
 */
export const GPS_VS_DEM_GROUND_THRESHOLD_M = 10

export type ResolvedAltitude = {
  alt: number
  /** dem=地表統一 / gps=構造物等高所 / gps-only=DEM取得失敗でGPS / dem-only=GPSなし */
  source: 'dem' | 'gps' | 'gps-only' | 'dem-only'
}

/**
 * 登録用高度の決定: 基本は DEM（地表）。
 * GPS が DEM から閾値超で離れているときだけ GPS（ビル等）を採用。
 * どちらも無いときは null。戻り高度は常に小数第1位。
 */
export async function resolveGpsOrDemAltitude(
  lat: number,
  lng: number,
  gpsAlt: number | null | undefined,
  altitudeAccuracy?: number | null,
): Promise<ResolvedAltitude | null> {
  const dem = await fetchGroundElevation(lat, lng)
  const gps =
    gpsAlt != null && Number.isFinite(gpsAlt) ? roundAltMeters(gpsAlt) : null

  if (dem == null && gps == null) return null
  if (dem == null && gps != null) return { alt: gps, source: 'gps-only' }
  if (dem != null && gps == null) return { alt: dem, source: 'dem-only' }

  // 両方ある
  const demV = dem!
  const gpsV = gps!
  const diff = Math.abs(gpsV - demV)
  // 鉛直精度が極端に悪いときは地表（DEM）優先
  if (
    altitudeAccuracy != null &&
    Number.isFinite(altitudeAccuracy) &&
    altitudeAccuracy > GPS_VS_DEM_GROUND_THRESHOLD_M * 2.5
  ) {
    return { alt: demV, source: 'dem' }
  }
  if (diff <= GPS_VS_DEM_GROUND_THRESHOLD_M) {
    return { alt: demV, source: 'dem' }
  }
  return { alt: gpsV, source: 'gps' }
}

/** 国土地理院 標高API（DEM） */
async function elevationGsi(lat: number, lng: number): Promise<number | null> {
  try {
    const url =
      `https://cyberjapandata2.gsi.go.jp/general/dem/scripts/getelevation.php` +
      `?lon=${encodeURIComponent(String(lng))}` +
      `&lat=${encodeURIComponent(String(lat))}` +
      `&outtype=JSON`
    const res = await fetch(url)
    if (!res.ok) return null
    const data = (await res.json()) as { elevation?: number | string }
    const elev = typeof data.elevation === 'number' ? data.elevation : Number(data.elevation)
    if (!Number.isFinite(elev)) return null
    return roundAltMeters(elev)
  } catch {
    return null
  }
}

async function elevationOpenMeteo(lat: number, lng: number): Promise<number | null> {
  try {
    const url =
      `https://api.open-meteo.com/v1/elevation` +
      `?latitude=${encodeURIComponent(String(lat))}` +
      `&longitude=${encodeURIComponent(String(lng))}`
    const res = await fetch(url)
    if (!res.ok) return null
    const data = (await res.json()) as { elevation?: number[] }
    const elev = data.elevation?.[0]
    if (typeof elev !== 'number' || !Number.isFinite(elev)) return null
    return roundAltMeters(elev)
  } catch {
    return null
  }
}

async function reverseBigDataCloud(lat: number, lng: number): Promise<string> {
  try {
    const url =
      `https://api.bigdatacloud.net/data/reverse-geocode-client` +
      `?latitude=${encodeURIComponent(String(lat))}` +
      `&longitude=${encodeURIComponent(String(lng))}` +
      `&localityLanguage=ja`
    const data = (await fetchJson(url)) as {
      localityInfo?: { administrative?: { name: string; adminLevel?: number }[] }
      city?: string
      locality?: string
      principalSubdivision?: string
      countryCode?: string
    } | null
    if (!data) return ''
    // 国(2)・地方(3)は除外。都道府県(4)以上のみ
    const admin =
      data.localityInfo?.administrative
        ?.filter((a) => (a.adminLevel ?? 0) >= 4)
        .map((a) => a.name)
        .filter(Boolean) ?? []
    const parts = [
      data.principalSubdivision,
      data.city || data.locality,
      ...admin,
    ].filter(Boolean) as string[]
    // 短い順に並べず、重複除去して連結（都道府県→市区）
    const uniq: string[] = []
    for (const p of parts) {
      if (!uniq.some((u) => u === p || u.includes(p) || p.includes(u))) uniq.push(p)
      else if (!uniq.some((u) => u.includes(p)) && p.length > (uniq[uniq.length - 1]?.length ?? 0)) {
        // より詳細な名称で置換はしない（順序保持）
      }
    }
    // principalSubdivision + city を優先してシンプルに
    const simple = [data.principalSubdivision, data.city || data.locality]
      .filter(Boolean)
      .join('')
    return normalizeJpAddress(simple || uniq.join(''))
  } catch {
    return ''
  }
}

async function reverseNominatimParts(lat: number, lng: number): Promise<NominatimParts> {
  const empty: NominatimParts = { address: '', chome: '', houseNumber: '' }
  try {
    // zoom=18: 建物／番地レベルを狙う
    const url =
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2` +
      `&lat=${encodeURIComponent(String(lat))}` +
      `&lon=${encodeURIComponent(String(lng))}` +
      `&accept-language=ja&addressdetails=1&zoom=18`
    const data = (await fetchJson(url, REVERSE_GEO_ONE_MS, {
      headers: {
        Accept: 'application/json',
        // Nominatim 利用ポリシー: アプリ識別
        'User-Agent': 'flight-pwa/1.0 (drone flight log)',
      },
    })) as {
      display_name?: string
      address?: Record<string, string>
    } | null
    if (!data) return empty
    const a = data.address
    if (a) {
      const chome = extractChome(a)
      const houseNumber = extractHouseNumber(a)
      const built = buildNominatimJpAddress(a)
      if (built) return { address: built, chome, houseNumber }
    }
    const fallback = normalizeJpAddress(String(data.display_name ?? ''))
    return { address: fallback, chome: '', houseNumber: '' }
  } catch {
    return empty
  }
}

/** Nominatim から丁目付き町名を取り出す（例: 山王四丁目） */
function extractChome(a: Record<string, string>): string {
  const candidates = [
    a.neighbourhood,
    a.suburb,
    a.quarter,
    a.city_district,
    a.hamlet,
  ]
    .filter(Boolean)
    .map((s) => normalizeChome(String(s).trim()))
    .filter(Boolean) as string[]
  // 丁目を含むものを優先、より長い（具体的な）方
  const withChome = candidates.filter((c) => /丁目/.test(c))
  const pool = withChome.length ? withChome : candidates
  pool.sort((x, y) => y.length - x.length)
  return pool[0] || ''
}

/** Nominatim から番地（番・号）相当を取り出す */
function extractHouseNumber(a: Record<string, string>): string {
  const raw =
    a.house_number ||
    a.housenumber ||
    // 一部データは block_number / plot_number
    a.block_number ||
    a.plot_number ||
    ''
  const n = normalizeChome(String(raw).trim())
  if (!n) return ''
  // 数字・ハイフン中心ならそのまま（例: 3-15, 15）
  return n
}

/** Nominatim の address を日本住所順に組む */
function buildNominatimJpAddress(a: Record<string, string>): string {
  const pref = a.state || a.province || ''
  const city =
    a.city ||
    a.town ||
    a.village ||
    [a.county, a.municipality].filter(Boolean).join('') ||
    ''
  const town = extractChome(a)
  const num = extractHouseNumber(a)
  const parts = [pref, city, town, num].filter(Boolean)
  return normalizeJpAddress(parts.join(''))
}

/** 漢数字丁目 → 算用数字（例: 二丁目 → 2丁目） */
function normalizeChome(s: string): string {
  const kanji: Record<string, string> = {
    一: '1',
    二: '2',
    三: '3',
    四: '4',
    五: '5',
    六: '6',
    七: '7',
    八: '8',
    九: '9',
    十: '10',
  }
  return s.replace(/([一二三四五六七八九十]+)丁目/g, (_, k: string) => {
    if (kanji[k]) return `${kanji[k]}丁目`
    if (k === '十') return '10丁目'
    // 十一〜十九 程度
    if (k.startsWith('十') && k.length === 2 && kanji[k[1]!]) {
      return `${10 + Number(kanji[k[1]!])}丁目`
    }
    return `${k}丁目`
  })
}

export function osmEmbedUrl(lat: number, lng: number, delta = 0.008): string {
  // 旧簡易表示用（OSM iframe）。現行 UI は Leaflet＋地理院詳細タイル。
  const bbox = `${lng - delta},${lat - delta},${lng + delta},${lat + delta}`
  return (
    `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}` +
    `&layer=mapnik&marker=${encodeURIComponent(`${lat},${lng}`)}`
  )
}

export function osmOpenUrl(lat: number, lng: number): string {
  // 別タブは国土地理院地図（標準）。表示ズームはアプリの VIEW_ZOOM に合わせる
  return `https://maps.gsi.go.jp/#${JP_MAP_VIEW_ZOOM}/${lat}/${lng}/&base=std&ls=std&disp=1&vs=c1j0h0k0l0u0t0z0r0s0m0f1`
}

/**
 * 地図の「見える範囲」ズーム。
 * detail モードでは細かいタイルをこの範囲に縮小して載せる（JP_TILE_DETAIL_BIAS）。
 * 各整数ズームで約2倍拡大。既定 18 は地理院ネイティブ上限＝handoff 境界。
 */
export const JP_MAP_VIEW_ZOOM = 18

/**
 * 詳細バイアス（2 = 二段細かいタイルを VIEW_ZOOM で縮小表示）。
 * 地理院の実タイル上限は 18。
 */
export const JP_TILE_DETAIL_BIAS = 2

/**
 * detail モードで、このズーム以上は classic と同じネイティブタイルに切替。
 * 17 で切ると classic の z17（一段粗い）が見えて段差になるため、ネイティブ上限の 18 のみ。
 * 切替は opacity（両レイヤ常駐）。zoom イベントで途中からも切替え、ズームアウト時の粗フラッシュを防ぐ。
 */
export const JP_DETAIL_HANDOFF_ZOOM = 18

/** 地理院タイルの実データ上限（これ以上の z は存在しない） */
export const JP_NATIVE_MAX_ZOOM = 18

/**
 * 画面上のピンチ上限。NATIVE を超えた分は z18 タイルの拡大表示（デジタルズーム）。
 * ぼやけは増えるが、ピン位置の確認には使える。
 */
export const JP_VISUAL_MAX_ZOOM = 20

/** classic = 従来 / detail = 引いた表示は詳細縮小、寄ると classic と同じ */
export type GsiTileMode = 'classic' | 'detail'

const GSI_ATTR =
  '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">地理院タイル</a>'

/** Leaflet 地図の maxZoom（表示上の上限。タイル実体は JP_NATIVE_MAX_ZOOM） */
export function jpMapMaxZoom(_mode?: GsiTileMode): number {
  return JP_VISUAL_MAX_ZOOM
}

/**
 * 地理院タイル用 Leaflet オプション。
 * maxNativeZoom までが実タイル。それより先は同じタイルを拡大表示する。
 */
export function jpGsiTileOpts(mode: GsiTileMode = 'classic'): {
  maxZoom: number
  maxNativeZoom: number
  tileSize: number
  zoomOffset: number
  attribution: string
} {
  if (mode === 'classic') {
    return {
      maxZoom: JP_VISUAL_MAX_ZOOM,
      maxNativeZoom: JP_NATIVE_MAX_ZOOM,
      tileSize: 256,
      zoomOffset: 0,
      attribution: GSI_ATTR,
    }
  }
  const bias = JP_TILE_DETAIL_BIAS
  // handoff 未満でのみ使う想定。URL z が NATIVE を超えないよう maxNativeZoom を制限
  return {
    maxZoom: JP_VISUAL_MAX_ZOOM,
    maxNativeZoom: JP_NATIVE_MAX_ZOOM - bias,
    tileSize: 256 / 2 ** bias,
    zoomOffset: bias,
    attribution: GSI_ATTR,
  }
}

/** 日本向け背景タイル（地理院 標準地図） */
export const JP_BASE_TILE_URL =
  'https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png'

/** @deprecated jpGsiTileOpts('classic'|'detail') を使う */
export const JP_BASE_TILE_OPTS = jpGsiTileOpts('classic')

/** 空中写真（建物の有無確認用・任意） */
export const JP_PHOTO_TILE_URL =
  'https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg'

/** @deprecated jpGsiTileOpts('classic'|'detail') を使う */
export const JP_PHOTO_TILE_OPTS = jpGsiTileOpts('classic')
