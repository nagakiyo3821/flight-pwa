/** Open-Meteo（APIキー不要）でショートカット「現在の天気を取得」相当を埋める */

export interface WeatherSet {
  A_WTH: string
  'A_RAIN%': string
  A_WINDD: string
  A_WINDS: string
  A_TEMP: string
  A_SR: string
  A_SS: string
}

const WMO_JP: Record<number, string> = {
  0: '晴れ',
  1: 'ほぼ晴れ',
  2: '晴れ時々曇り',
  3: '曇り',
  45: '霧',
  48: '霧',
  51: '霧雨',
  53: '霧雨',
  55: '霧雨',
  61: '雨',
  63: '雨',
  65: '強い雨',
  71: '雪',
  73: '雪',
  75: '強い雪',
  80: 'にわか雨',
  81: 'にわか雨',
  82: '激しいにわか雨',
  95: '雷雨',
  96: '雷雨',
  99: '雷雨',
}

/** ショートカット辞書（境界度）に近い風向判定 */
function windDirLabel(deg: number): string {
  if (!Number.isFinite(deg) || deg >= 360) return ''
  const table: [string, number][] = [
    ['北', 0],
    ['北東', 22],
    ['東', 67],
    ['南東', 112],
    ['南', 157],
    ['南西', 202],
    ['西', 247],
    ['北西', 292],
    ['北', 337],
  ]
  let label = '北'
  for (const [name, min] of table) {
    if (deg > min) label = name
  }
  return label
}

function hhmmFromIso(iso: string): string {
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}`
}

export async function fetchWeatherSet(lat: number, lng: number): Promise<WeatherSet> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
    `&current=temperature_2m,weather_code,wind_speed_10m,wind_direction_10m,precipitation` +
    `&hourly=precipitation_probability` +
    `&daily=sunrise,sunset&timezone=Asia%2FTokyo&forecast_days=1`

  const res = await fetch(url)
  if (!res.ok) throw new Error(`気象取得に失敗しました（HTTP ${res.status}）`)
  const data = (await res.json()) as {
    current?: {
      temperature_2m?: number
      weather_code?: number
      wind_speed_10m?: number
      wind_direction_10m?: number
    }
    hourly?: { time?: string[]; precipitation_probability?: number[] }
    daily?: { sunrise?: string[]; sunset?: string[] }
  }

  const cur = data.current ?? {}
  const code = cur.weather_code ?? -1
  const wth = WMO_JP[code] ?? (code >= 0 ? `天気コード${code}` : '')

  let rain = ''
  const times = data.hourly?.time ?? []
  const probs = data.hourly?.precipitation_probability ?? []
  if (times.length && probs.length) {
    const now = Date.now()
    let best = 0
    let bestDiff = Infinity
    for (let i = 0; i < times.length; i++) {
      const t = Date.parse(times[i]!)
      const diff = Math.abs(t - now)
      if (diff < bestDiff) {
        bestDiff = diff
        best = probs[i] ?? 0
      }
    }
    rain = String(Math.round(best))
  }

  // Open-Meteo の風速は km/h → ショートカット同様 m/s（÷3.6）、小数1桁
  const windMs = (cur.wind_speed_10m ?? 0) / 3.6
  const winds = windMs.toFixed(1)
  const temp = (cur.temperature_2m ?? 0).toFixed(1)
  const windd = windDirLabel(cur.wind_direction_10m ?? 999)

  const sr = hhmmFromIso(data.daily?.sunrise?.[0] ?? '')
  const ss = hhmmFromIso(data.daily?.sunset?.[0] ?? '')

  return {
    A_WTH: wth,
    'A_RAIN%': rain,
    A_WINDD: windd,
    A_WINDS: winds,
    A_TEMP: temp,
    A_SR: sr,
    A_SS: ss,
  }
}
