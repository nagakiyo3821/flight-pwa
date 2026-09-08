/** 逆ジオコード（住所）。失敗時は空文字。 */

export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  // 日本域は郵便町名ベースの HeartRails を優先（既存 pos の表記に近い）
  if (isLikelyJapan(lat, lng)) {
    const hr = await reverseHeartRails(lat, lng)
    if (hr) return hr
    const nom = await reverseNominatim(lat, lng)
    if (nom) return nom
  }
  const nom = await reverseNominatim(lat, lng)
  if (nom) return nom
  return reverseBigDataCloud(lat, lng)
}

function isLikelyJapan(lat: number, lng: number): boolean {
  return lat >= 20 && lat <= 46 && lng >= 122 && lng <= 154
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
 * HeartRails Geo API（日本の都道府県+市区町村+町名）
 * https://geoapi.heartrails.com/
 */
async function reverseHeartRails(lat: number, lng: number): Promise<string> {
  try {
    const url =
      `https://geoapi.heartrails.com/api/json` +
      `?method=searchByGeoLocation` +
      `&x=${encodeURIComponent(String(lng))}` +
      `&y=${encodeURIComponent(String(lat))}`
    const res = await fetch(url)
    if (!res.ok) return ''
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
    if (!list.length) return ''
    // 最短距離（先頭）を採用
    const best = [...list].sort(
      (a, b) => (a.distance ?? 0) - (b.distance ?? 0),
    )[0]!
    const parts = [best.prefecture, best.city, best.town].filter(
      (p): p is string => !!p && p.trim() !== '',
    )
    return normalizeJpAddress(parts.join(''))
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

async function reverseNominatim(lat: number, lng: number): Promise<string> {
  try {
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
    if (!res.ok) return ''
    const data = (await res.json()) as {
      display_name?: string
      address?: Record<string, string>
    }
    const a = data.address
    if (a) {
      const built = buildNominatimJpAddress(a)
      if (built) return built
    }
    return normalizeJpAddress(String(data.display_name ?? ''))
  } catch {
    return ''
  }
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
  const detailCandidates = [
    a.city_district,
    a.suburb,
    a.neighbourhood,
    a.quarter,
    a.hamlet,
  ].filter(Boolean) as string[]
  // すでに市区町村に含まれる詳細は捨てる
  const details: string[] = []
  for (const d of detailCandidates) {
    const n = normalizeChome(d)
    if (!n) continue
    if (city.includes(n) || details.some((x) => x.includes(n) || n.includes(x))) continue
    details.push(n)
  }
  // 町名は最も具体的な1つ（丁目付き優先）
  details.sort((x, y) => {
    const cx = /丁目/.test(x) ? 0 : 1
    const cy = /丁目/.test(y) ? 0 : 1
    if (cx !== cy) return cx - cy
    return y.length - x.length
  })
  const town = details[0] || ''
  const road = a.road && !town.includes(a.road) && !city.includes(a.road) ? a.road : ''
  const num = a.house_number ? normalizeChome(a.house_number) : ''
  const parts = [pref, city, town, road, num].filter(Boolean)
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
  const bbox = `${lng - delta},${lat - delta},${lng + delta},${lat + delta}`
  return (
    `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}` +
    `&layer=mapnik&marker=${encodeURIComponent(`${lat},${lng}`)}`
  )
}

export function osmOpenUrl(lat: number, lng: number): string {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`
}
