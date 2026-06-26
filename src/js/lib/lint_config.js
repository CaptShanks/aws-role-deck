//
// RoleDeck: lightweight linter for the aws-config-style profile text.
//
// Independent of the `aesr-config` parser so it can run (and be unit tested)
// on its own. Returns an array of { line, level: 'error' | 'warn', message }.
//

export function lintConfig(text) {
  const warnings = [];
  const lines = (text || '').split(/\r\n|\r|\n/);
  const sections = []; // { name, line, params: { key: value } }
  let cur = null;

  lines.forEach((raw, i) => {
    const ln = i + 1;
    const s = raw.replace(/[;#].*$/, '').trim(); // strip comments + spaces
    if (!s) return;

    const m = s.match(/^\[(.+)\]$/);
    if (m) {
      const name = m[1].trim().replace(/^profile\s+/i, '');
      cur = { name, line: ln, params: {} };
      sections.push(cur);
      return;
    }
    if (!cur) {
      warnings.push({ line: ln, level: 'error', message: `Setting outside of any [profile]: "${s}"` });
      return;
    }
    const idx = s.indexOf('=');
    if (idx === -1) {
      warnings.push({ line: ln, level: 'error', message: `Not a [section] or "key = value": "${s}"` });
      return;
    }
    const key = s.slice(0, idx).trim();
    const val = s.slice(idx + 1).trim();
    if (key in cur.params) {
      warnings.push({ line: ln, level: 'warn', message: `Duplicate key "${key}" in [${cur.name}]` });
    }
    cur.params[key] = val;
  });

  // Duplicate profile names.
  const firstSeen = new Map();
  for (const sec of sections) {
    if (firstSeen.has(sec.name)) {
      warnings.push({ line: sec.line, level: 'error', message: `Duplicate profile name "${sec.name}" (also defined at line ${firstSeen.get(sec.name)})` });
    } else {
      firstSeen.set(sec.name, sec.line);
    }
  }

  const names = new Set(sections.map(s => s.name));
  const acctRole = new Map();

  for (const sec of sections) {
    const p = sec.params;
    const hasArn = Boolean(p.role_arn);
    const hasAcct = Boolean(p.aws_account_id);

    if (!hasArn && !hasAcct) {
      warnings.push({ line: sec.line, level: 'error', message: `[${sec.name}] has neither role_arn nor aws_account_id` });
    }
    if (hasArn && (hasAcct || p.role_name)) {
      warnings.push({ line: sec.line, level: 'error', message: `[${sec.name}] mixes role_arn with aws_account_id/role_name` });
    }
    if (hasArn && !/^arn:aws[\w-]*:iam::\d{12}:role\/.+/.test(p.role_arn)) {
      warnings.push({ line: sec.line, level: 'error', message: `[${sec.name}] has an invalid role_arn` });
    }
    if (hasAcct && !/^\d{12}$/.test(p.aws_account_id) && !/^[\w-]+$/.test(p.aws_account_id)) {
      warnings.push({ line: sec.line, level: 'warn', message: `[${sec.name}] aws_account_id "${p.aws_account_id}" is not 12 digits or an alias` });
    }
    if (p.source_profile && !names.has(p.source_profile)) {
      warnings.push({ line: sec.line, level: 'error', message: `[${sec.name}] source_profile "${p.source_profile}" is not defined` });
    }
    if (p.color && !/^[0-9a-fA-F]{6}$/.test(p.color)) {
      warnings.push({ line: sec.line, level: 'warn', message: `[${sec.name}] color "${p.color}" should be a 6-digit hex value` });
    }

    if (hasAcct && p.role_name) {
      const key = `${p.aws_account_id}/${p.role_name}`;
      if (acctRole.has(key)) {
        warnings.push({ line: sec.line, level: 'warn', message: `[${sec.name}] points at the same account/role as "${acctRole.get(key)}"` });
      } else {
        acctRole.set(key, sec.name);
      }
    }
  }

  return warnings;
}
