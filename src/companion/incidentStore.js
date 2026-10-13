// Incident clips live only in this browser (IndexedDB). Nothing is uploaded or shared.
// A clip exists only when the privacy guard confirmed something abnormal; old clips expire.

const DB = 'carebridge-incidents'
const STORE = 'clips'
export const CLIP_TTL_DAYS = 7
export const MAX_CLIPS = 5

const open = () => new Promise((resolve, reject) => {
  if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB unavailable'))
  const req = indexedDB.open(DB, 1)
  req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' })
  req.onsuccess = () => resolve(req.result)
  req.onerror = () => reject(req.error)
})

const run = async (mode, fn) => {
  const db = await open()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode)
    const out = fn(tx.objectStore(STORE))
    tx.oncomplete = () => { db.close(); resolve(out.result) }
    tx.onerror = () => { db.close(); reject(tx.error) }
  })
}

export const deleteClip = (id) => run('readwrite', s => s.delete(id)).catch(() => {})

export async function listClips() {
  try {
    const cutoff = Date.now() - CLIP_TTL_DAYS * 864e5
    const all = await run('readonly', s => s.getAll())
    const fresh = all.filter(c => new Date(c.at).getTime() >= cutoff)
    await Promise.all(all.filter(c => !fresh.includes(c)).map(c => deleteClip(c.id)))
    return fresh.sort((a, b) => b.at.localeCompare(a.at))
  } catch { return [] }
}

export async function saveClip({ blob, reasons, kind }) {
  const clip = { id: `clip-${Date.now()}`, at: new Date().toISOString(), reasons, kind, blob }
  try {
    await run('readwrite', s => s.put(clip))
    const all = await listClips()
    await Promise.all(all.slice(MAX_CLIPS).map(c => deleteClip(c.id)))
    return clip
  } catch { return null }
}
