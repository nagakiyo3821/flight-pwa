/** `drone/data/` を段の名前に分ける。`..` と空段は捨てる。 */

export function splitFolderPath(raw: string): string[] {
  return String(raw || '')
    .replace(/\\/g, '/')
    .split('/')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s !== '.' && s !== '..')
}
