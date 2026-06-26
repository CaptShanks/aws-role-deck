//
// RoleDeck: discover switchable roles/profiles from an uploaded config file.
//
// Real `~/.aws/config` files contain things RoleDeck can't switch into —
// static credential profiles, [sso-session] blocks, a bare [default] with just
// a region, etc. This extracts the usable switch-role profiles, strips the
// "profile " prefix, drops references to profiles that were filtered out, and
// returns a clean config text plus a summary of what was kept and skipped.
//
// Pure (no DOM / browser), so it can be unit tested.
//

function parseSections(text) {
  const sections = [];
  let cur = null;
  (text || '').split(/\r\n|\r|\n/).forEach(raw => {
    const s = raw.replace(/[;#].*$/, '').trim();
    if (!s) return;
    const m = s.match(/^\[(.+)\]$/);
    if (m) {
      const rawName = m[1].trim();
      cur = { rawName, name: rawName.replace(/^profile\s+/i, ''), params: {} };
      sections.push(cur);
    } else if (cur) {
      const i = s.indexOf('=');
      if (i === -1) return;
      cur.params[s.slice(0, i).trim()] = s.slice(i + 1).trim();
    }
  });
  return sections;
}

function serialize(sec) {
  const lines = [`[${sec.name}]`];
  for (const [k, v] of Object.entries(sec.params)) lines.push(`${k} = ${v}`);
  return lines.join('\n');
}

export function discoverProfiles(text) {
  const sections = parseSections(text);
  const kept = [];
  const skipped = [];

  for (const sec of sections) {
    const p = sec.params;
    if (/^(sso-session|services)(\s|$)/i.test(sec.rawName)) {
      skipped.push({ name: sec.rawName, reason: 'SSO / services section' });
      continue;
    }
    if (p.aws_access_key_id || p.aws_secret_access_key || p.credential_process) {
      skipped.push({ name: sec.name, reason: 'static credentials' });
      continue;
    }
    if (!p.role_arn && !p.aws_account_id) {
      skipped.push({ name: sec.name, reason: 'no role_arn or aws_account_id' });
      continue;
    }
    kept.push(sec);
  }

  const keptNames = new Set(kept.map(s => s.name));
  const accounts = new Set();
  for (const sec of kept) {
    const p = sec.params;
    // a source_profile pointing at something we filtered out would be invalid
    if (p.source_profile && !keptNames.has(p.source_profile)) delete p.source_profile;

    let account = p.aws_account_id;
    if (p.role_arn) {
      const m = p.role_arn.match(/:iam::(\d{12}):/);
      if (m) account = m[1];
    }
    if (account) accounts.add(account);
  }

  return {
    profiles: kept.map(s => ({ name: s.name, ...s.params })),
    skipped,
    accountCount: accounts.size,
    text: kept.map(serialize).join('\n\n'),
  };
}
