/** 逆ジオコード（住所）。失敗時は空文字。 */

export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  // 日本域: 住居表示を優先（地番は使わない）。失敗時は従来合成へ。
  if (isLikelyJapan(lat, lng)) {
    const [jage, hr, nom, gsiChome] = await Promise.all([
      reverseJageocoder(lat, lng),
      reverseHeartRailsParts(lat, lng),
      reverseNominatimParts(lat, lng),
      reverseGsiChome(lat, lng),
    ])
    if (jage) return jage
    const merged = mergeJapanAddress(hr, nom, gsiChome)
    if (merged) return merged
  }
  const nom = await reverseNominatimParts(lat, lng)
  if (nom.address) return nom.address
  return reverseBigDataCloud(lat, lng)
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
 * 逆ジオが地番しか返さない地点では、同一丁目内の「○番」を前方ジオコードで探して最寄りを採用。
 * 出典: https://jageocoder.info-proto.com/webapi （デモ用途・無保証）
 */
async function reverseJageocoder(lat: number, lng: number): Promise<string> {
  try {
    const hits = await fetchJageReverseHits(lat, lng)
    // 1) 逆ジオ結果に住居表示の「○番」があればそれを使う
    const jyukyoHits = hits.filter((h) => isJyukyoBanNode(h.candidate))
    if (jyukyoHits.length) {
      const best = pickClosestJageHit(jyukyoHits, lat, lng)
      if (best?.candidate?.fullname) {
        return formatJageocoderResidential(best.candidate.fullname)
      }
    }

    // 2) 地番しか無い → 丁目まで取り、住居表示の番を探索
    const prefix = chomePrefixFromHits(hits)
    if (prefix) {
      const banFull = await findClosestJyukyoBanByGeocode(prefix, lat, lng)
      if (banFull) return formatJageocoderResidential(banFull)
      // 番も取れなければ丁目まで（地番番号は出さない）
      return normalizeJpAddress(prefix)
    }
  } catch {
    // fall through
  }
  return ''
}

async function fetchJageReverseHits(lat: number, lng: number): Promise<JageReverseHit[]> {
  const out: JageReverseHit[] = []
  for (const level of [8, 7] as const) {
    const url =
      `https://jageocoder.info-proto.com/rgeocode` +
      `?lat=${encodeURIComponent(String(lat))}` +
      `&lon=${encodeURIComponent(String(lng))}` +
      `&level=${level}&opts=all`
    const res = await fetch(url)
    if (!res.ok) continue
    const data = (await res.json()) as JageReverseHit[]
    if (Array.isArray(data)) out.push(...data)
  }
  return out
}

/** 住居表示の街区「12番」（地番の「12番地」は除外） */
function isJyukyoBanNode(c?: JageNode | null): boolean {
  if (!c) return false
  const name = String(c.name ?? '')
  if (!/^\d+番$/.test(name)) return false
  if (/番地/.test(name)) return false
  const full = (c.fullname ?? []).join('')
  if (/番地/.test(full)) return false
  // priority 3 付近が住居表示街区。緩く 7 未満も許容
  return (c.priority ?? 9) < 8
}

function pickClosestJageHit(
  hits: JageReverseHit[],
  lat: number,
  lng: number,
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
  return bestD <= 150 ? best : null
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
 * （逆ジオが地番ノードばかり返す地域向け）
 */
async function findClosestJyukyoBanByGeocode(
  chomePrefix: string,
  lat: number,
  lng: number,
): Promise<string[] | null> {
  let best: { fullname: string[]; dist: number } | null = null
  const maxBan = 60
  const batch = 10
  let consecutiveMiss = 0

  for (let start = 1; start <= maxBan; start += batch) {
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
      // 序盤を過ぎて連続でヒット無しなら打ち切り
      if (start > 15 && consecutiveMiss >= 2) break
    }
  }

  if (best && best.dist <= 120) return best.fullname
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
    const res = await fetch(url)
    if (!res.ok) return null
    const data = (await res.json()) as Array<{ node?: JageNode; matched?: string }>
    const node = data?.[0]?.node
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
    const res = await fetch(url)
    if (!res.ok) return empty
    const data = (await res.json()) as {
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
    }
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
    const res = await fetch(url)
    if (!res.ok) return ''
    const data = (await res.json()) as {
      results?: { muniCd?: string; lv01Nm?: string } | null
    }
    const name = String(data.results?.lv01Nm ?? '').trim()
    // 「（該当なし）」等を除外
    if (!name || /該当なし|不明/.test(name)) return ''
    return normalizeChome(name)
  } catch {
    return ''
  }
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
    return Math.round(elev * 10) / 10
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
    return Math.round(elev * 10) / 10
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
    const res = await fetch(url)
    if (!res.ok) return ''
    const data = (await res.json()) as {
      localityInfo?: { administrative?: { name: string; adminLevel?: number }[] }
      city?: string
      locality?: string
      principalSubdivision?: string
      countryCode?: string
    }
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
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        // Nominatim 利用ポリシー: アプリ識別
        'User-Agent': 'flight-pwa/1.0 (drone flight log)',
      },
    })
    if (!res.ok) return empty
    const data = (await res.json()) as {
      display_name?: string
      address?: Record<string, string>
    }
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
  // 確認用 iframe は地理院地図（日本の建物・道路が新しい）
  // ※ Leaflet 本画面と同じ標準地図タイルを使うため、簡易に maps.gsi へ誘導するリンクも併用
  const bbox = `${lng - delta},${lat - delta},${lng + delta},${lat + delta}`
  return (
    `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}` +
    `&layer=mapnik&marker=${encodeURIComponent(`${lat},${lng}`)}`
  )
}

export function osmOpenUrl(lat: number, lng: number): string {
  // 別タブは国土地理院地図（標準）
  return `https://maps.gsi.go.jp/#17/${lat}/${lng}/&base=std&ls=std&disp=1&vs=c1j0h0k0l0u0t0z0r0s0m0f1`
}

/** 日本向け背景タイル（地理院 標準地図）。OSM より住宅・道路が新しいことが多い */
export const JP_BASE_TILE_URL =
  'https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png'

export const JP_BASE_TILE_OPTS = {
  maxZoom: 18,
  attribution:
    '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">地理院タイル</a>',
} as const

/** 空中写真（建物の有無確認用・任意） */
export const JP_PHOTO_TILE_URL =
  'https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg'

export const JP_PHOTO_TILE_OPTS = {
  maxZoom: 18,
  attribution:
    '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">地理院タイル</a>',
} as const
