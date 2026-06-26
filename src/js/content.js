function needsInvertForeColorByBack(color) {
  let r, g, b;
  const md = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
  if (md) {
    r = parseInt(md[1], 10);
    g = parseInt(md[2], 10);
    b = parseInt(md[3], 10);
  } else {
    r = parseInt(color.substr(0, 2), 16);
    g = parseInt(color.substr(2, 2), 16);
    b = parseInt(color.substr(4, 2), 16);
  }
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5;
}

function adjustDisplayNameColor() {
  let menuBtn = document.querySelector('span[data-testid="account-menu-button__background"]');
  if (!menuBtn) {
    menuBtn = document.querySelector('#nav-usernameMenu .awsc-switched-role-username-wrapper');
  }
  if (menuBtn) {
    const bgColor = menuBtn.style.backgroundColor;
    if (bgColor && needsInvertForeColorByBack(bgColor)) {
      menuBtn.parentElement.style = 'color: #f9f9f9';
    }
  }
}

function adjustPrismDisplayNameColor() {
  try {
    const navUM = document.getElementById("nav-usernameMenu");
    const spanEl = Array.from(navUM.querySelectorAll("div > span")).at(-1);
    const frColor = window.getComputedStyle(spanEl).color;
    if (frColor && needsInvertForeColorByBack(frColor)) {
      spanEl.style.backgroundColor = "#bbbbbb";
    }
  } catch {}
}

function appendAESR() {
  const form = document.createElement('form');
  form.id = 'AESR_form';
  form.method = 'POST';
  form.target = '_top';
  form.innerHTML = '<input type="hidden" name="mfaNeeded" value="0"><input type="hidden" name="action" value="switchFromBasis"><input type="hidden" name="src" value="nav"><input type="hidden" name="csrf"><input type="hidden" name="roleName"><input type="hidden" name="account"><input type="hidden" name="color"><input type="hidden" name="redirect_uri"><input type="hidden" name="displayName">';
  document.body.appendChild(form)

  const divInfo = document.createElement('div');
  divInfo.id = 'AESR_info';
  divInfo.style.display = 'none';
  divInfo.style.visibility = 'hidden';
  document.body.appendChild(divInfo);

  const inputResult = document.createElement('input');
  inputResult.type = 'hidden';
  inputResult.id = 'AESR_result';
  inputResult.style.display = 'none';
  inputResult.style.visibility = 'hidden';
  document.body.appendChild(inputResult);
}

function getMetaData() {
  const result = { prismModeEnabled: false };

  const asd = document.querySelector('meta[name="awsc-session-data"]');
  if (asd) {
    try {
      const json = asd.getAttribute('content');
      Object.assign(result, JSON.parse(json));
    } catch (e) {}
  }

  if (!result.signInEndpoint) {
    result.signInEndpoint = (() => {
      const ase = document.getElementById('awsc-signin-endpoint');
      if (ase) return ase.getAttribute("content");

      const ir = result.infrastructureRegion;
      if (ir) {
        if (ir.startsWith("us-gov-")) return "signin.amazonaws-us-gov.com";
        else if (ir.startsWith("cn-"))  return "signin.amazonaws.cn";
      }

      return "signin.aws.amazon.com";
    })();
  }

  return result;
}

const brw = (chrome || browser);
let session = null;
let accountInfo = null;

function loadInfo(cb) {
  if (accountInfo) {
    cb(accountInfo);
    return false;
  }

  const script = document.createElement('script');
  script.src = brw.runtime.getURL('/js/war/attach_target.js');
  script.onload = function() {
    try {
      const json = document.getElementById('AESR_info').dataset.content;
      accountInfo = JSON.parse(json);
      accountInfo.prism = session.prismModeEnabled;
      accountInfo.signinEndpoint = session.signInEndpoint;
      accountInfo.sessionDifferentiator = session.sessionDifferentiator;
    } catch {}
    cb(accountInfo);
    this.remove();
  };
  document.body.appendChild(script);
  return true;
}

function getPrismSwitchUrl(cb) {
  const script = document.createElement('script');
  script.src = brw.runtime.getURL('/js/war/prism_switch_dest.js');

  const aesrResult = document.getElementById('AESR_result');
  function aesrResultOnChange() {
    aesrResult.removeEventListener('change', aesrResultOnChange);
    script.remove();
    const url = this.value;
    this.value = '';
    cb(url);
  }
  aesrResult.addEventListener('change', aesrResultOnChange);

  document.body.appendChild(script);
  return true;
}

function doSwitch(data, cb) {
  const formActionUrl = (() => {
    if (session.prismModeEnabled) {
      return `https://${session.signInEndpoint}/sessions/${session.sessionDifferentiator}/v1/switchrole`;
    } else {
      let actionHost = session.signInEndpoint;
      const { actionSubdomain } = data;
      if (actionSubdomain) {
        if (
          actionHost === "signin.aws.amazon.com" ||
          actionHost === "signin.amazonaws-us-gov.com" ||
          actionHost === "signin.amazonaws.cn"
        ) {
          actionHost = actionSubdomain + "." + actionHost;
        } else if (
          actionHost.endsWith(".signin.aws.amazon.com") ||
          actionHost.endsWith(".signin.amazonaws-us-gov.com") ||
          actionHost.endsWith(".signin.amazonaws.cn")
        ) {
          actionHost = actionHost.replace(/^[^\.]+/, actionSubdomain);
        }
      }
      return `https://${actionHost}/switchrole`;
    }
  })();

  const form = document.getElementById('AESR_form');
  form.setAttribute('action', formActionUrl);
  form.account.value = data.account;
  form.color.value = data.color;
  form.roleName.value = data.rolename;
  form.displayName.value = data.displayname;

  if (session.prismModeEnabled) {
    form.redirect_uri.value = data.redirecturi.replace(`${session.sessionDifferentiator}.`, "")
    getPrismSwitchUrl(url => {
      cb({ prism: true, url, signinHost: session.signInEndpoint });
    });
    return true;
  } else {
    form.redirect_uri.value = data.redirecturi;
    cb({ prism: false });
    form.submit();
    return false;
  }
}

// Silently re-assume the role before the session expires, staying on the page
// the user is currently viewing. This reloads the tab.
function performRenew(data) {
  if (session && session.prismModeEnabled) return; // not supported for multi-session tabs
  const renewData = { ...data, redirecturi: encodeURIComponent(location.href) };
  const go = () => doSwitch(renewData, () => {});
  if (accountInfo) {
    go(); // attach_target.js already set the CSRF token on this page load
  } else {
    loadInfo(() => go()); // inject attach_target.js first to set the CSRF token
  }
}

function setupMessageListener() {
  brw.runtime.onMessage.addListener(function(msg, sender, cb) {
    const { data, action } = msg;
    if (action === 'loadInfo') {
      return loadInfo(cb);
    } else if (action === 'switch') {
      return doSwitch(data, cb);
    } else if (action === 'performRenew') {
      performRenew(data);
    }
  })
}

function isMainFrame(body) {
  if (!body) return false;
  return Array.from(body.children).some(el => el.localName !== 'script');
}

// ---- RoleDeck: in-console label/production banner + idle lock ----
const RD_ENVMAP_KEY = 'rdEnvByAccount';

function rdDetectEnvFromText(text) {
  const t = (text || '').toLowerCase();
  if (/(^|[\s\-_./])(non[-\s]?prod|nonprod)/.test(t)) return 'development';
  if (/(^|[\s\-_./])(prod|production|prd)([\s\-_./]|$)/.test(t)) return 'production';
  if (/(^|[\s\-_./])(stag|staging|stg|uat|pre[-\s]?prod)/.test(t)) return 'staging';
  if (/(^|[\s\-_./])(dev|development|test|qa|sandbox|sbx)/.test(t)) return 'development';
  return null;
}

function rdSwitchedLabel() {
  const selectors = [
    '#nav-usernameMenu .awsc-switched-role-username-wrapper',
    'span[data-testid="account-menu-button__background"]',
    '[data-testid="awsc-account-detail-menu-button"]',
    '#nav-usernameMenu',
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    const txt = el && el.textContent ? el.textContent.trim() : '';
    if (txt) return txt;
  }
  return '';
}

function rdBrushAccount(v) {
  if (!v) return '';
  const m = String(v).match(/^(\d{4})-(\d{4})-(\d{4})$/);
  if (m) return m[1] + m[2] + m[3];
  const digits = String(v).replace(/\D/g, '');
  return /^\d{12}$/.test(digits) ? digits : '';
}

function rdAccountFromText(text) {
  const m1 = (text || '').match(/\b(\d{12})\b/);
  if (m1) return m1[1];
  const m2 = (text || '').match(/\b(\d{4})-(\d{4})-(\d{4})\b/);
  if (m2) return m2[1] + m2[2] + m2[3];
  return '';
}

function rdResolveContext(cb) {
  const pageLabel = rdSwitchedLabel();
  const nameProd = /prod|prd/i.test(pageLabel);

  const withAccount = (account) => {
    try {
      brw.storage.local.get([RD_ENVMAP_KEY], (data) => {
        const envMap = (data && data[RD_ENVMAP_KEY]) || {};
        const rawEnv = (account && envMap[account]) || '';
        try { console.debug('[RoleDeck] banner env', { account, rawEnv, nameProd }); } catch (e) {}
        cb({ rawEnv, nameProd });
      });
    } catch (e) {
      cb({ rawEnv: '', nameProd });
    }
  };

  // Prefer the account from the console session info (the same source the popup
  // uses); fall back to scraping the nav text.
  try {
    loadInfo((info) => {
      info = info || {};
      const account = rdBrushAccount(info.roleDisplayNameAccount)
        || rdBrushAccount(info.loginDisplayNameAccount)
        || rdAccountFromText(pageLabel);
      withAccount(account);
    });
  } catch (e) {
    withAccount(rdAccountFromText(pageLabel));
  }
}

function rdShowProdBorder() {
  if (document.getElementById('rd-prod-frame')) return;
  const frame = document.createElement('div');
  frame.id = 'rd-prod-frame';
  frame.setAttribute('style', 'position:fixed;inset:0;border:4px solid #e5484d;pointer-events:none;z-index:2147483646;box-sizing:border-box');
  document.body.appendChild(frame);
}

// A collapsible banner showing the account's label (whenever one is set) or
// "PRODUCTION". Click it to collapse to a slim ribbon; click the ribbon to
// bring it back. The collapsed state is remembered for the tab.
function rdBannerColor(env) {
  switch (env) {
    case 'production': return '#e5484d';
    case 'staging': return '#e8920c';
    case 'development': return '#2e9e44';
    default: return '#5b5ef0';
  }
}

function rdShowBanner(text, env) {
  const existing = document.getElementById('rd-banner');
  if (existing) existing.remove();

  const color = rdBannerColor(env);
  const fullText = (env === 'production' ? '⚠ ' : '') + text;
  const bar = document.createElement('div');
  bar.id = 'rd-banner';

  let collapsed = false;
  try { collapsed = sessionStorage.getItem('rdBannerCollapsed') === '1'; } catch (e) {}

  const expandedStyle = `position:fixed;top:0;left:50%;transform:translateX(-50%);background:${color};color:#fff;font:700 12px/1.1 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;letter-spacing:.04em;padding:6px 16px;border-radius:0 0 9px 9px;cursor:pointer;z-index:2147483647;box-shadow:0 2px 8px rgba(0,0,0,.3);max-width:60vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap`;
  const collapsedStyle = `position:fixed;top:0;left:50%;transform:translateX(-50%);background:${color};width:56px;height:6px;border-radius:0 0 8px 8px;cursor:pointer;z-index:2147483647;box-shadow:0 1px 4px rgba(0,0,0,.3);opacity:.85`;

  const render = () => {
    if (collapsed) {
      bar.textContent = '';
      bar.setAttribute('style', collapsedStyle);
      bar.title = `Show: ${fullText}`;
    } else {
      bar.textContent = fullText;
      bar.setAttribute('style', expandedStyle);
      bar.title = 'Click to collapse';
    }
  };
  bar.onclick = () => {
    collapsed = !collapsed;
    try { sessionStorage.setItem('rdBannerCollapsed', collapsed ? '1' : '0'); } catch (e) {}
    render();
  };
  render();
  document.body.appendChild(bar);
}

function rdShowIdleLock() {
  if (document.getElementById('rd-idle-lock')) return;
  const ov = document.createElement('div');
  ov.id = 'rd-idle-lock';
  ov.setAttribute('style', 'position:fixed;inset:0;z-index:2147483647;background:rgba(12,14,20,.78);display:flex;align-items:center;justify-content:center');
  const card = document.createElement('div');
  card.setAttribute('style', 'background:#fff;color:#16191f;border-radius:14px;padding:22px 26px;max-width:340px;text-align:center;font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;box-shadow:0 16px 50px rgba(0,0,0,.5)');
  card.innerHTML = '<div style="font-size:13px;font-weight:700;color:#e5484d;letter-spacing:.06em">PRODUCTION &middot; PAUSED</div><h3 style="margin:10px 0 6px;font-size:17px">You\'ve been idle in production</h3><p style="margin:0 0 16px;color:#5b6472">RoleDeck paused this tab to avoid accidental changes. Resume when you\'re ready.</p>';
  const btn = document.createElement('button');
  btn.textContent = 'Resume';
  btn.setAttribute('style', 'background:#5b5ef0;border:0;color:#fff;font-weight:600;font-size:14px;padding:9px 18px;border-radius:9px;cursor:pointer');
  btn.onclick = () => ov.remove();
  card.appendChild(btn);
  ov.appendChild(card);
  document.body.appendChild(ov);
}

function rdSetupIdleLock(minutes) {
  if (!minutes || minutes <= 0) return;
  const ms = minutes * 60 * 1000;
  let timer = null;
  const reset = () => {
    if (document.getElementById('rd-idle-lock')) return; // stay locked until dismissed
    clearTimeout(timer);
    timer = setTimeout(rdShowIdleLock, ms);
  };
  ['mousemove', 'keydown', 'scroll', 'click', 'wheel'].forEach(ev =>
    document.addEventListener(ev, reset, { passive: true }));
  reset();
}

function rdInitGuards() {
  try {
    brw.storage.sync.get(['prodBanner', 'prodIdleLockMin'], (cfg) => {
      cfg = cfg || {};
      const bannerOn = cfg.prodBanner !== false; // default on (production styling/border)
      const idleMin = Number(cfg.prodIdleLockMin || 0);

      let tries = 0;
      const attempt = () => {
        rdResolveContext((ctx) => {
          // Show the env= value when set; otherwise fall back to "production"
          // when the name contains prd/prod. No banner for anything else.
          const env = ctx.rawEnv || (ctx.nameProd ? 'production' : '');
          if (env) {
            const colorEnv = rdDetectEnvFromText(env); // normalize for color
            const isProd = colorEnv === 'production';
            if (bannerOn) {
              rdShowBanner(env.toUpperCase(), colorEnv);
              if (isProd) rdShowProdBorder();
            }
            if (isProd && idleMin) rdSetupIdleLock(idleMin);
          } else if (tries < 5) {
            tries++;
            setTimeout(attempt, 1200); // the nav may still be rendering
          }
        });
      };
      attempt();
    });
  } catch (e) {
    console.error(`RoleDeck guard init failed: ${e}`);
  }
}

if (isMainFrame(document.body)) {
  session = getMetaData();
  appendAESR();
  setupMessageListener();

  setTimeout(() => {
    session.prismModeEnabled ? adjustPrismDisplayNameColor() : adjustDisplayNameColor();
  }, 1000);

  setTimeout(rdInitGuards, 1200);
}
