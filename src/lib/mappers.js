// Postgres columns are snake_case, the React tree is camelCase. Translating in
// one place keeps the pages from having to know which side they are on.
//
// The editor documents (slides, overlays, hook, audio, demoTrim) stay camelCase
// inside their jsonb columns — they are opaque blobs to the database, and
// rewriting their keys on every read would be pure cost.

export function brandFromRow(row) {
  return {
    appName: row?.app_name ?? '',
    tagline: row?.tagline ?? '',
    category: row?.category ?? 'productivity',
    verb: row?.verb ?? 'get things done',
    tone: row?.tone ?? 'bold',
    accent: row?.accent ?? '#c9a4ff',
    onboarded: row?.onboarded ?? false,
  }
}

export function brandToRow(brand) {
  return {
    app_name: brand.appName ?? '',
    tagline: brand.tagline ?? '',
    category: brand.category ?? 'productivity',
    verb: brand.verb ?? 'get things done',
    tone: brand.tone ?? 'bold',
    accent: brand.accent ?? '#c9a4ff',
    onboarded: brand.onboarded ?? false,
  }
}

export function carouselFromRow(row) {
  return {
    id: row.id,
    name: row.name,
    createdAt: new Date(row.created_at).getTime(),
    presetId: row.preset_id,
    setAssignment: row.set_assignment || {},
    slides: row.slides || [],
  }
}

export function carouselToRow(proj, userId) {
  return {
    id: proj.id,
    user_id: userId,
    name: proj.name,
    preset_id: proj.presetId ?? null,
    set_assignment: proj.setAssignment || {},
    slides: proj.slides || [],
  }
}

export function videoFromRow(row) {
  return {
    id: row.id,
    name: row.name,
    createdAt: new Date(row.created_at).getTime(),
    characterId: row.character_id,
    hook: row.hook || {},
    demoPath: row.demo_path,
    demoDuration: Number(row.demo_duration) || 0,
    demoTrim: row.demo_trim || { start: 0, end: 0 },
    audio: row.audio || { trackId: 'hype', volume: 0.8 },
    overlays: row.overlays || [],
  }
}

export function videoToRow(proj, userId) {
  return {
    id: proj.id,
    user_id: userId,
    name: proj.name,
    character_id: proj.characterId,
    hook: proj.hook || {},
    demo_path: proj.demoPath ?? null,
    demo_duration: proj.demoDuration ?? 0,
    demo_trim: proj.demoTrim || { start: 0, end: 0 },
    audio: proj.audio || { trackId: 'hype', volume: 0.8 },
    overlays: proj.overlays || [],
  }
}

export function blinkFromRow(row) {
  return {
    id: row.id,
    prompt: row.prompt,
    creatorId: row.creator_id,
    creatorName: row.creator_name,
    durationSeconds: row.duration_seconds,
    aspectRatio: row.aspect_ratio,
    resolution: row.resolution,
    status: row.status,
    storagePath: row.storage_path,
    error: row.error,
    createdAt: new Date(row.created_at).getTime(),
  }
}

/**
 * A custom set plus its images, shaped like the built-in sets so the picker and
 * the editor cannot tell them apart.
 */
export function setFromRow(row) {
  const images = (row.set_images || [])
    .slice()
    .sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at))
    .map((img) => ({ id: img.id, path: img.storage_path }))

  return {
    id: row.id,
    name: row.name,
    builtin: false,
    createdAt: new Date(row.created_at).getTime(),
    images,
  }
}
