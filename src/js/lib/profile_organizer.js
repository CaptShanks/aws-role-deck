//
// RoleDeck: profile organization helpers — environment detection, production
// guardrails, fuzzy search, and favorites/recents grouping.
//
// Pure functions with no browser or DOM dependencies, so they can be unit
// tested in isolation.
//

const TRUTHY = ['true', 'yes', 'on', '1'];
const FALSY = ['false', 'no', 'off', '0'];

export function parseBoolish(value) {
  if (value === true) return true;
  if (value === false || value == null) return false;
  const v = String(value).trim().toLowerCase();
  if (TRUTHY.includes(v)) return true;
  if (FALSY.includes(v)) return false;
  return null; // unknown / unset
}

// Returns 'production' | 'staging' | 'development' | null.
// An explicit `env` (or `environment`) parameter wins; otherwise the
// environment is inferred from the profile name / account alias.
export function detectEnv(item) {
  const explicit = (item.env ?? item.environment ?? '').toString().trim().toLowerCase();
  if (explicit) {
    if (/^(prod|production|prd)$/.test(explicit)) return 'production';
    if (/^(stag|staging|stg|uat|preprod|pre-?prod)$/.test(explicit)) return 'staging';
    if (/^(dev|development|test|qa|sandbox|sbx|nonprod|non-?prod)$/.test(explicit)) return 'development';
    return null;
  }
  const hay = `${item.name || ''} ${item.aws_account_alias || ''}`.toLowerCase();
  if (/(^|[\s\-_./])(non[-\s]?prod|nonprod)/.test(hay)) return 'development';
  if (/(^|[\s\-_./])(prod|production|prd)([\s\-_./]|$)/.test(hay)) return 'production';
  if (/(^|[\s\-_./])(stag|staging|stg|uat|pre[-\s]?prod)/.test(hay)) return 'staging';
  if (/(^|[\s\-_./])(dev|development|test|qa|sandbox|sbx)/.test(hay)) return 'development';
  return null;
}

export function envLabel(env) {
  switch (env) {
    case 'production': return 'PROD';
    case 'staging': return 'STG';
    case 'development': return 'DEV';
    default: return '';
  }
}

// Whether switching into this profile should ask for confirmation.
// An explicit `confirm` parameter wins; otherwise production profiles are
// guarded by default.
export function needsConfirm(item) {
  const raw = item.confirm;
  if (raw != null && String(raw).trim() !== '') {
    const explicit = parseBoolish(raw);
    if (explicit !== null) return explicit;
  }
  return detectEnv(item) === 'production';
}

// Subsequence fuzzy match. Returns a score (higher is better) or -1 for no match.
export function fuzzyScore(query, text) {
  if (!query) return 0;
  const q = query.toLowerCase();
  const t = (text || '').toLowerCase();
  let qi = 0, score = 0, streak = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      streak += 1;
      score += streak;                                  // reward consecutive runs
      if (ti === 0) score += 3;                          // prefix bonus
      else if (/[\s\-_./|]/.test(t[ti - 1])) score += 2; // word-boundary bonus
      qi += 1;
    } else {
      streak = 0;
    }
  }
  return qi === q.length ? score : -1;
}

function defaultSearchText(item) {
  return `${item.label || ''} ${item.name || ''} ${item.aws_account_id || ''}`;
}

// Filter + rank profiles by a query. Space-separated words are matched
// independently (AND), each as a fuzzy subsequence of the profile's text.
export function searchProfiles(profiles, query, searchTextOf = defaultSearchText) {
  const words = (query || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return profiles.slice();

  const scored = [];
  for (const item of profiles) {
    const text = searchTextOf(item);
    let total = 0, ok = true;
    for (const w of words) {
      const s = fuzzyScore(w, text);
      if (s < 0) { ok = false; break; }
      total += s;
    }
    if (ok) scored.push({ item, total });
  }
  scored.sort((a, b) => b.total - a.total);
  return scored.map(s => s.item);
}

// Move `name` to the front of the MRU list, dedupe, cap at `max`.
export function updateRecents(recents, name, max = 8) {
  const next = [name, ...(recents || []).filter(n => n !== name)];
  return next.slice(0, max);
}

// Group profiles into favorites / recent / others, without duplicates across
// the groups.
export function groupProfiles(profiles, favorites = [], recents = [], recentLimit = 6) {
  const favSet = new Set(favorites);
  const byName = new Map(profiles.map(p => [p.name, p]));

  const fav = profiles.filter(p => favSet.has(p.name));

  const recent = [];
  for (const name of recents) {
    if (favSet.has(name)) continue;
    const p = byName.get(name);
    if (p) recent.push(p);
    if (recent.length >= recentLimit) break;
  }
  const recentSet = new Set(recent.map(p => p.name));

  const others = profiles.filter(p => !favSet.has(p.name) && !recentSet.has(p.name));

  return { favorites: fav, recent, others };
}
