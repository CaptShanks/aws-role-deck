//
// RoleDeck: local activity-log helpers (pure). The log records each role
// switch so it can be reviewed/exported for incident write-ups or audits.
// Storage I/O is handled by the callers; these functions are side-effect free.
//

export function appendActivity(log, entry, cap = 500) {
  return [entry, ...(log || [])].slice(0, cap);
}

const CSV_HEADER = ['time', 'profile', 'account', 'role', 'env', 'browser'];

function csvEscape(value) {
  const s = value == null ? '' : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function activityToCsv(entries) {
  const rows = (entries || []).map(e => [
    e.ts == null ? '' : new Date(e.ts).toISOString(),
    e.profile,
    e.account,
    e.role,
    e.env || '',
    e.browser || '',
  ].map(csvEscape).join(','));
  return [CSV_HEADER.join(','), ...rows].join('\n');
}
