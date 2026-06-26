import { createRoleListItem } from './lib/create_role_list_item.js';
import { CurrentContext } from './lib/current_context.js';
import { findTargetProfiles } from './lib/target_profiles.js';
import { SessionMemory, SyncStorageRepository, LocalStorageRepository } from './lib/storage_repository.js';
import { remoteCallback } from './handlers/remote_connect.js';
import { writeProfileSetToTable } from './lib/profile_db.js';
import { containersAvailable, profileUsesContainer, hexFromAccount } from './lib/container_tabs.js';
import { searchProfiles, groupProfiles, updateRecents, needsConfirm, detectEnv, envLabel } from './lib/profile_organizer.js';
import { appendActivity } from './lib/activity_log.js';

const brw = chrome || browser;

const sessionMemory = new SessionMemory(brw);
const syncRepo = new SyncStorageRepository(brw);
const localRepo = new LocalStorageRepository(brw);

const FAV_KEY = 'rdFavorites';
const RECENT_KEY = 'rdRecents';
const ACTIVITY_KEY = 'rdActivityLog';
const ENVMAP_KEY = 'rdEnvByAccount';

let autoSessionRenewEnabled = false;

// popup state
let mainEl, noMainEl, resultsEl, filterEl;
let allProfiles = [];
let favoritesSet = new Set();
let recentsList = [];
let currentOptions = {};
let curUrlInfo = { url: '', region: '' };
let currentUserInfo = null;
let selectHandler = null;
let visibleRows = [];
let selectedIndex = -1;

function openOptions() {
  brw.runtime.openOptionsPage().catch(err => {
    console.error(`Error: ${err}`);
  });
}

function openPage(pageUrl) {
  const url = brw.runtime.getURL(pageUrl);
  return brw.tabs.create({ url }).catch(err => {
    console.error(`Error: ${err}`);
  });
}

async function getCurrentTab() {
  const [tab] = await brw.tabs.query({ currentWindow:true, active:true });
  return tab;
}

async function moveTabToOption(tabId) {
  const url = await brw.runtime.getURL('options.html');
  await brw.tabs.update(tabId, { url });
}

async function executeAction(tabId, action, data) {
  return brw.tabs.sendMessage(tabId, { action, data });
}

function showMessage(msg, level = 'info') {
  const p = noMainEl.querySelector('p');
  p.textContent = msg;
  if (level === 'error') p.style.color = '#d11';
  noMainEl.style.display = 'block';
  mainEl.style.display = 'none';
}

window.onload = function() {
  mainEl = document.getElementById('main');
  noMainEl = document.getElementById('noMain');
  resultsEl = document.getElementById('roleResults');
  filterEl = document.getElementById('roleFilter');

  const MANY_SWITCH_COUNT = 4;

  document.getElementById('openOptionsLink').onclick = function() {
    openOptions();
    return false;
  }
  document.getElementById('openUpdateNoticeLink').onclick = function() {
    openPage('updated.html');
    return false;
  }
  document.getElementById('openCreditsLink').onclick = function() {
    openPage('credits.html');
    return false;
  }
  document.getElementById('openSupportMe').onclick = function() {
    openPage('supporters.html');
    return false;
  }

  syncRepo.get(['visualMode', 'autoTabGrouping']).then(({ visualMode, autoTabGrouping }) => {
    const mode = visualMode || 'default';
    if (mode === 'dark' || (mode === 'default' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.body.classList.add('darkMode');
    }
    if (autoTabGrouping) {
      brw.runtime.sendMessage({ action: 'listenTabGroupsRemove' });
    }
  });

  sessionMemory.get(['hasGoldenKey', 'switchCount'])
    .then(({ hasGoldenKey, switchCount }) => {
      if (hasGoldenKey || false) {
        document.getElementById('goldenkey').style.display = 'block';
      } else if ((switchCount || 0) > MANY_SWITCH_COUNT) {
        document.getElementById('supportComment').style.display = 'block';
      }
      main();
    })
}

function main() {
  getCurrentTab()
    .then(tab => {
      if (!tab.url) return;

      const url = new URL(tab.url)
      if (url.host.endsWith('.aws.amazon.com')
       || url.host.endsWith('.amazonaws-us-gov.com')
       || url.host.endsWith('.amazonaws.cn')) {
        executeAction(tab.id, 'loadInfo', {}).then(userInfo => {
          if (userInfo) {
            mainEl.style.display = 'block';
            return loadFormList(url, userInfo, tab.id);
          } else {
            showMessage('Failed to fetch user info from the AWS Management Console page', 'error');
          }
        })
      } else if (url.host.endsWith('.aesr.dev') && url.pathname.startsWith('/callback')) {
        remoteCallback(url)
        .then(userCfg => {
          showMessage("Successfully connected to AESR Config Hub!");
          return writeProfileSetToTable(userCfg.profile);
        })
        .then(() => moveTabToOption(tab.id))
        .catch(err => {
          showMessage(`Failed to connect to AESR Config Hub because.\n${err.message}`, 'error');
        });
      } else {
        showMessage("You'll see your roles here when the current tab is an AWS Management Console page.");
      }
    })
}

async function loadFormList(curURL, userInfo, tabId) {
  const data = await syncRepo.get([
    'hidesAccountId', 'showOnlyMatchingRoles', 'autoTabGrouping', 'signinEndpointInHere',
    'useFirefoxContainers', 'autoSessionRenew', FAV_KEY, RECENT_KEY,
  ]);
  const {
    hidesAccountId = false, showOnlyMatchingRoles = false, autoTabGrouping = false,
    signinEndpointInHere = false, autoSessionRenew = false,
  } = data;
  // Default to container-per-account on Firefox so switching to a new account
  // never has to chain roles (and never forces you back to base).
  const useFirefoxContainers = data.useFirefoxContainers === undefined
    ? containersAvailable()
    : data.useFirefoxContainers;
  autoSessionRenewEnabled = autoSessionRenew;
  favoritesSet = new Set(data[FAV_KEY] || []);
  recentsList = data[RECENT_KEY] || [];

  currentOptions = { hidesAccountId, autoTabGrouping, signinEndpointInHere, useFirefoxContainers };

  const curCtx = new CurrentContext(userInfo, { showOnlyMatchingRoles });
  setContextLine(curCtx);

  allProfiles = await findTargetProfiles(curCtx);
  curUrlInfo = getCurrentUrlandRegion(curURL);
  currentUserInfo = userInfo;
  selectHandler = makeSelectHandler(tabId, userInfo);

  render('');
  setupSearch();
}

function setContextLine(curCtx) {
  const el = document.getElementById('ctxLine');
  if (!el) return;
  if (curCtx.baseAccount) {
    el.innerHTML = '';
    el.appendChild(document.createTextNode('Switching from '));
    const b = document.createElement('b');
    b.textContent = curCtx.loginRole ? `${curCtx.loginRole} @ ${curCtx.baseAccount}` : curCtx.baseAccount;
    el.appendChild(b);
  }
}

function makeSelectHandler(tabId, userInfo) {
  const { region, isLocal } = curUrlInfo;
  const isPrism = userInfo.prism;

  return function(sender, data, item) {
    const proceed = () => {
      sender.onclick = null;
      sender.classList.add('loading');

      if (currentOptions.signinEndpointInHere && isLocal) data.actionSubdomain = region;
      // Give the AWS console role badge a distinct per-account color when the
      // profile didn't set one (instead of the default grey).
      if (!data.color || data.color === 'aaaaaa') data.color = hexFromAccount(data.account);
      recordRecent(item.name);
      recordSwitchMeta(item, data);

      if (containersAvailable() && profileUsesContainer(data, currentOptions.useFirefoxContainers)) {
        if (isPrism) {
          data.displayname = data.displayname.replace(/\s\s\|\s\s\d{12}$/, '');
          if (userInfo.sessionDifferentiator) {
            data.redirecturi = data.redirecturi.replace(`${userInfo.sessionDifferentiator}.`, '');
          }
        }
        data.signinEndpoint = userInfo.signinEndpoint;
        sendOpenInContainer(data);
        return;
      }

      if (isPrism) {
        if (currentOptions.autoTabGrouping) {
          data.tabGroup = { title: data.profile, color: data.color };
        }
        data.displayname = data.displayname.replace(/\s\s\|\s\s\d{12}$/, '');
      }
      sendSwitchRole(tabId, data);
    };

    if (needsConfirm(item)) {
      showGuardrail(item, proceed);
    } else {
      proceed();
    }
  }
}

function recordRecent(name) {
  recentsList = updateRecents(recentsList, name);
  syncRepo.set({ [RECENT_KEY]: recentsList }).catch(() => {});
}

// Append to the local activity log and remember this account's environment so
// the content script can show its in-console production banner.
async function recordSwitchMeta(item, data) {
  try {
    const detectedEnv = detectEnv(item);
    const acct = data.account || item.aws_account_id;
    const stored = await localRepo.get([ACTIVITY_KEY, ENVMAP_KEY]);
    const log = appendActivity(stored[ACTIVITY_KEY] || [], {
      ts: Date.now(),
      profile: item.name || data.profile,
      account: acct,
      role: item.role_name || data.rolename,
      env: detectedEnv || '',
      browser: navigator.userAgent.includes('Firefox') ? 'firefox' : 'chrome',
    });
    const envMap = stored[ENVMAP_KEY] || {};
    // Store the raw env= value; the in-console banner shows it, and only shows
    // when env= is explicitly set.
    if (acct) envMap[acct] = (item.env || data.env || '').toString().trim();
    await localRepo.set({ [ACTIVITY_KEY]: log, [ENVMAP_KEY]: envMap });
  } catch (e) {
    console.error(`Failed to record switch metadata: ${e}`);
  }
}

// Open every favorite in its own container tab (Firefox containers only).
async function openWorkspace() {
  if (!containersAvailable()) return;
  const isPrism = currentUserInfo && currentUserInfo.prism;
  const anchors = Array.from(resultsEl.querySelectorAll('a.rl-row'))
    .filter(a => favoritesSet.has(a.dataset.profile));

  for (const a of anchors) {
    const data = { ...a.dataset };
    if (!data.color || data.color === 'aaaaaa') data.color = hexFromAccount(data.account);
    if (currentOptions.signinEndpointInHere && curUrlInfo.isLocal) data.actionSubdomain = curUrlInfo.region;
    if (isPrism) {
      data.displayname = data.displayname.replace(/\s\s\|\s\s\d{12}$/, '');
      if (currentUserInfo.sessionDifferentiator) {
        data.redirecturi = data.redirecturi.replace(`${currentUserInfo.sessionDifferentiator}.`, '');
      }
    }
    if (currentUserInfo) data.signinEndpoint = currentUserInfo.signinEndpoint;
    recordRecent(data.profile);
    recordSwitchMeta({ name: data.profile, aws_account_id: data.account, role_name: data.rolename }, data);
    await brw.runtime.sendMessage({ action: 'openInContainer', data }).catch(() => {});
  }
  window.close();
}

function toggleFavorite(name, makeFavorite) {
  if (makeFavorite) favoritesSet.add(name);
  else favoritesSet.delete(name);
  syncRepo.set({ [FAV_KEY]: [...favoritesSet] }).catch(() => {});
}

function render(query) {
  resultsEl.innerHTML = '';

  if (query) {
    const matches = searchProfiles(allProfiles, query);
    if (matches.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'rl-empty';
      empty.textContent = `No roles match “${query}”.`;
      resultsEl.appendChild(empty);
    } else {
      resultsEl.appendChild(buildList(matches));
    }
  } else {
    const { favorites, recent, others } = groupProfiles(allProfiles, [...favoritesSet], recentsList);
    const sectioned = favorites.length > 0 || recent.length > 0;
    if (favorites.length) resultsEl.appendChild(buildSection('Favorites', favorites));
    if (recent.length) resultsEl.appendChild(buildSection('Recent', recent));
    if (others.length) resultsEl.appendChild(buildSection(sectioned ? 'All roles' : '', others));
    if (allProfiles.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'rl-empty';
      empty.textContent = 'No roles available to switch into from here.';
      resultsEl.appendChild(empty);
    }
  }

  refreshVisibleRows();
  setSelected(visibleRows.length ? 0 : -1);
}

function buildSection(title, profiles) {
  const wrap = document.createElement('div');
  wrap.className = 'rl-section';
  if (title) {
    const h = document.createElement('div');
    h.className = 'rl-section-title';
    const label = document.createElement('span');
    label.textContent = title;
    h.appendChild(label);
    if (title === 'Favorites' && containersAvailable() && profiles.length > 1) {
      const btn = document.createElement('button');
      btn.className = 'rl-section-action';
      btn.textContent = 'Open all';
      btn.title = 'Open every favorite in its own container tab';
      btn.onclick = (e) => { e.preventDefault(); openWorkspace(); };
      h.appendChild(btn);
    }
    wrap.appendChild(h);
  }
  wrap.appendChild(buildList(profiles));
  return wrap;
}

function buildList(profiles) {
  const ul = document.createElement('ul');
  ul.className = 'roleList';
  const opts = {
    hidesAccountId: currentOptions.hidesAccountId,
    favorites: favoritesSet,
    onToggleFavorite: toggleFavorite,
  };
  profiles.forEach(item => {
    ul.appendChild(createRoleListItem(document, item, curUrlInfo.url, curUrlInfo.region, opts, selectHandler));
  });
  return ul;
}

function refreshVisibleRows() {
  visibleRows = Array.from(resultsEl.querySelectorAll('ul.roleList > li'));
  // number the first nine rows for Alt+1–9 quick-switch
  visibleRows.forEach((li, i) => {
    const a = li.querySelector('a.rl-row');
    if (!a) return;
    const existing = a.querySelector('.rl-index');
    if (existing) existing.remove();
    if (i < 9) {
      const idx = document.createElement('span');
      idx.className = 'rl-index';
      idx.textContent = String(i + 1);
      a.insertBefore(idx, a.firstChild);
    }
  });
}

function setSelected(index) {
  visibleRows.forEach(li => li.classList.remove('selected'));
  selectedIndex = index;
  if (index >= 0 && index < visibleRows.length) {
    const li = visibleRows[index];
    li.classList.add('selected');
    li.scrollIntoView({ block: 'nearest' });
  }
}

function setupSearch() {
  filterEl.addEventListener('input', function() {
    render(this.value.trim());
  });

  filterEl.addEventListener('keydown', function(e) {
    if (e.altKey && /^[1-9]$/.test(e.key)) {
      e.preventDefault();
      const li = visibleRows[Number(e.key) - 1];
      const a = li && li.querySelector('a.rl-row');
      if (a) a.click();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected(Math.min(selectedIndex + 1, visibleRows.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected(Math.max(selectedIndex - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const li = visibleRows[selectedIndex];
      const a = li && li.querySelector('a.rl-row');
      if (a) a.click();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (this.value) {
        this.value = '';
        render('');
      } else {
        window.close();
      }
    }
  });

  filterEl.focus();
}

function showGuardrail(item, onConfirm) {
  const env = detectEnv(item);
  const overlay = document.getElementById('guardrail');
  const badge = document.getElementById('guardrailBadge');
  const title = document.getElementById('guardrailTitle');
  const msg = document.getElementById('guardrailMsg');
  const confirmBtn = document.getElementById('guardrailConfirm');
  const cancelBtn = document.getElementById('guardrailCancel');

  badge.textContent = envLabel(env) || 'CONFIRM';
  badge.className = 'overlay-badge' + (env ? ` env-${env}` : '');
  title.textContent = env === 'production' ? 'Switch into production?' : 'Confirm this switch';
  msg.textContent = `You're about to switch into “${item.name}” (account ${item.aws_account_id}).`;
  overlay.style.display = 'flex';

  const cleanup = () => {
    overlay.style.display = 'none';
    confirmBtn.onclick = null;
    cancelBtn.onclick = null;
    document.removeEventListener('keydown', onKey, true);
  };
  // Escape cancels. Confirming is deliberately NOT bound to Enter so a stray
  // keypress can't blow through a production guardrail — it needs a real click
  // (or Enter on the focused Cancel button, which cancels).
  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cleanup(); filterEl.focus(); }
  };

  confirmBtn.onclick = () => { cleanup(); onConfirm(); };
  cancelBtn.onclick = () => { cleanup(); filterEl.focus(); };
  document.addEventListener('keydown', onKey, true);
  cancelBtn.focus();
}

async function sendOpenInContainer(data) {
  const resp = await brw.runtime.sendMessage({ action: 'openInContainer', data });
  if (resp && resp.error) {
    showMessage(`Failed to open the profile in a container tab. ${resp.error}`, 'error');
    return;
  }

  const { switchCount } = await sessionMemory.get(['switchCount']);
  await sessionMemory.set({ switchCount: (switchCount || 0) + 1 });

  window.close();
}

async function sendSwitchRole(tabId, data) {
  const { prism, url, signinHost } = await executeAction(tabId, 'switch', data);
  if (prism && !url) {
    // AWS won't let an already-assumed role chain into another one. Rather than
    // forcing the user back to base, open the target in its own container — an
    // isolated session that switches from base — when containers are available.
    if (containersAvailable()) {
      if (currentUserInfo) {
        data.signinEndpoint = currentUserInfo.signinEndpoint;
        if (currentUserInfo.sessionDifferentiator && data.redirecturi) {
          data.redirecturi = data.redirecturi.replace(`${currentUserInfo.sessionDifferentiator}.`, '');
        }
      }
      return sendOpenInContainer(data);
    }
    showMessage("AWS can't switch straight from one role into another. Go ‘Back to <base account>’ and switch again, or enable container tabs so each account opens in its own session.", 'error');
    return;
  }

  const { switchCount } = await sessionMemory.get(['switchCount']);
  await sessionMemory.set({ switchCount: (switchCount || 0) + 1 });

  if (prism) {
    await brw.runtime.sendMessage({
      action: 'openTab',
      url,
      signinHost,
      tabGroup: data.tabGroup,
    });
  } else if (autoSessionRenewEnabled) {
    await brw.runtime.sendMessage({ action: 'trackSwitch', tabId, data });
  }

  window.close();
}

function getCurrentUrlandRegion(aURL) {
  const url = aURL.href;
  let region = '';
  const md = aURL.search.match(/region=([a-z\-1-9]+)/);
  if (md) region = md[1];

  let isLocal = false;
  const mdsd = aURL.host.match(/(([a-z]{2}\-[a-z-]+\-[1-9])\.)?console\.(aws|amazonaws)/);
  if (mdsd) {
    const [,, cr = 'us-east-1'] = mdsd;
    if (cr === region) isLocal = true;
  }

  return { url, region, isLocal }
}
