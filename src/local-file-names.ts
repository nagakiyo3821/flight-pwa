/** 電話の Local フォルダに書く名前。画面の種類と、フォルダ内のファイル名を対応させる。 */

const SPECS = {
  'log.json': { prefix: 'log', label: 'log', legacy: 'log.json' },
  'pos.json': { prefix: 'pos', label: 'pos', legacy: 'pos.json' },
  'tmp.json': { prefix: 'tmp', label: 'tmp', legacy: 'tmp.json' },
  'masters.json': { prefix: 'mst', label: 'mst', legacy: 'masters.json', also: ['mst.json'] },
  'settings.json': { prefix: 'set', label: 'set', legacy: 'settings.json' },
} as const

export type CanonicalLocalName = keyof typeof SPECS

export function localKindLabel(canonical: string): string {
  return SPECS[canonical as CanonicalLocalName]?.label || canonical
}

export function localStamp(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`
}

export function stampedFileName(canonical: string, stamp: string): string {
  const spec = SPECS[canonical as CanonicalLocalName]
  if (!spec) return canonical
  return `${spec.prefix}_${stamp}.json`
}

export function applyLocalStamp(files: Record<string, unknown>, stamp: string): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [name, data] of Object.entries(files)) out[stampedFileName(name, stamp)] = data
  return out
}

export type NamedEntry<T> = { item: T; fileName: string; depth: number }

/** 種類ごとに、14桁がいちばん大きいファイル。日時の無い旧名はそれより古い。 */
export function pickLatestEntry<T>(entries: readonly NamedEntry<T>[], canonical: string): NamedEntry<T> | null {
  const spec = SPECS[canonical as CanonicalLocalName]
  if (!spec) {
    const exact = entries.filter((entry) => entry.fileName.toLowerCase() === canonical.toLowerCase())
    return [...exact].sort((a, b) => a.depth - b.depth)[0] || null
  }
  const stamped = new RegExp(`^${spec.prefix}_(\\d{14})(?: \\((\\d+)\\)| (\\d+))?\\.json$`, 'i')
  const plain = [spec.legacy, ...('also' in spec ? spec.also : [])].map(
    (name) => new RegExp(`^${name.replace(/\./g, '\\.')}$`, 'i'),
  )
  const ranked = entries.flatMap((entry) => {
    const base = entry.fileName.split('/').pop() || entry.fileName
    const hit = base.match(stamped)
    if (hit) return [{ entry, stamp: hit[1], copy: Number(hit[2] || hit[3] || 0) }]
    if (plain.some((pattern) => pattern.test(base))) return [{ entry, stamp: '', copy: 0 }]
    return []
  })
  ranked.sort((a, b) => {
    if (a.stamp !== b.stamp) return a.stamp < b.stamp ? 1 : -1
    if (a.copy !== b.copy) return b.copy - a.copy
    return a.entry.depth - b.entry.depth
  })
  return ranked[0]?.entry || null
}
