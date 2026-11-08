// Gameplay events (docs/EVENTS.md): the only shapes the server accepts. Anything else is dropped, so no free text reaches the table.
const CARDS = ['bact', 'virus', 'staph', 'flu', 'worm', 'candida', 'boss', 'salmon', 'toxo', 'rabies', 'bcell', 'fever', 'macro', 'hero', 'gz',
  'killer', 'spec-killer', 'spec-bcell', 'spec-neutro', 'spec-macro', 'swarm']; // the game's intro cards (INTRO in index.html); tools/test.js keeps them equal
const CHALLENGE_LEVELS = [3, 6, 9, 12, 15, 18];
const MAX_EVENTS = 20, DAILY_CAP = 2000, KEEP_DAYS = 395; // 2,000 rows x 395 days x ~150 B ~ 120 MB per environment, on its own 15 GB disk (render.yaml); saves untouched this long go too

const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const bool = v => typeof v === 'boolean';
const LEVEL = { level: v => int(v, 1, 18), mode: v => ['campaign', 'heroic', 'iron'].includes(v), difficulty: v => ['easy', 'normal', 'hard'].includes(v) };
const SHAPES = {
  open: { new: bool },
  level_start: LEVEL,
  level_end: { ...LEVEL, outcome: v => ['won', 'lost', 'quit', 'restart'].includes(v), first: bool, stars: v => v === null || int(v, 1, 3), wave: v => int(v, 0, 14) },
  card: { card: v => CARDS.includes(v), secs: v => int(v, 0, 86400) },
  hide: {},
};

// one event -> a table row, or null. Every key must be known and valid; level events need a mode that exists on that level.
function row(e) {
  if (!e || typeof e !== 'object' || Array.isArray(e)) return null;
  const shape = typeof e.name === 'string' && Object.hasOwn(SHAPES, e.name) && SHAPES[e.name]; // own keys only: 'constructor' or '__proto__' is no event
  if (!shape || !int(e.t, 0, 86400)) return null;
  const keys = Object.keys(e).filter(k => k !== 'name' && k !== 't');
  if (keys.length !== Object.keys(shape).length || !keys.every(k => Object.hasOwn(shape, k) && shape[k](e[k]))) return null;
  if (e.mode && e.mode !== 'campaign' && !CHALLENGE_LEVELS.includes(e.level)) return null;
  if (e.name === 'level_end' && (e.stars !== null) !== (e.mode === 'campaign' && e.outcome === 'won')) return null; // stars only on a campaign win
  return { name: e.name, t: e.t, level: e.level ?? null, mode: e.mode ?? null, difficulty: e.difficulty ?? null, outcome: e.outcome ?? null,
    first: e.first ?? null, stars: e.stars ?? null, wave: e.wave ?? null, card: e.card ?? null, secs: e.secs ?? null, is_new: e.new ?? null };
}

// the request body -> { page, release, rows }, or null when the envelope itself is wrong
function parse(body) {
  if (!body || typeof body !== 'object' || typeof body.page !== 'string' || !/^[0-9a-f]{16}$/.test(body.page)) return null;
  if (typeof body.release !== 'string' || (body.release !== '' && !/^[0-9a-f]{7,40}$/.test(body.release))) return null;
  if (!Array.isArray(body.events) || body.events.length > MAX_EVENTS) return null;
  return { page: body.page, release: body.release || null, rows: body.events.map(row).filter(Boolean) };
}

module.exports = { parse, CARDS, DAILY_CAP, KEEP_DAYS };
