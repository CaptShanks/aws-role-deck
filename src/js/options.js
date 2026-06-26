import { ConfigParser } from 'aesr-config';
import { buildProfileIni } from './lib/build_profile_ini.js';
import { nowEpochSeconds } from './lib/util.js';
import { loadConfigIni, saveConfigIni } from './lib/config_ini.js';
import { ColorPicker } from './lib/color_picker.js';
import { StorageProvider } from './lib/storage_repository.js';
import { writeProfileSetToTable } from "./lib/profile_db.js";
import { remoteConnect, getRemoteConnectInfo, deleteRemoteConnectInfo } from './handlers/remote_connect.js';
import { reloadConfig } from './lib/reload-config.js';
import { lintConfig } from './lib/lint_config.js';
import { activityToCsv } from './lib/activity_log.js';
import { applyManagedConfig } from './lib/managed_config.js';
import { discoverProfiles } from './lib/discover_profiles.js';

function elById(id) {
  return document.getElementById(id);
}

const brw = chrome || browser;

window.onload = function() {
  const syncStorageRepo = StorageProvider.getSyncRepository();
  let configStorageArea = 'sync';
  let colorPicker = new ColorPicker(document);

  elById('switchConfigHubButton').onclick = function() {
    updateRemoteFieldsState('disconnected');
  }
  elById('cancelConfigHubButton').onclick = function() {
    updateRemoteFieldsState('not_shown');
  }
  elById('connectConfigHubButton').onclick = function() {
    const subdomain = elById('configHubDomain').value;
    const clientId = elById('configHubClientId').value;
    remoteConnect(subdomain, clientId).catch(err => {
      updateMessage('remoteMsgSpan', err.message, 'warn');
    });
  }
  elById('disconnectConfigHubButton').onclick = function() {
    updateRemoteFieldsState('disconnected');
    deleteRemoteConnectInfo();
  }
  elById('reloadConfigHubButton').onclick = function() {
    getRemoteConnectInfo().then(rci => {
      if (rci && rci.subdomain && rci.clientId) {
        reloadConfig(rci).then(result => {
          if (result) {
            updateMessage('remoteMsgSpan', "Successfully reloaded config from Hub!");
          } else {
            updateMessage('remoteMsgSpan', `Failed to reload because the connection expired.`, 'warn');
            updateRemoteFieldsState('disconnected');
          }
        }).catch(e => {
          updateMessage('remoteMsgSpan', `Failed to reload because ${e.message}`, 'warn');
        });
      } else {
        updateMessage('remoteMsgSpan', `Failed to reload because the connection is broken.`, 'warn');
      }
    });
  }

  let selection = [];
  let textArea = elById('awsConfigTextArea');
  textArea.onselect = function() {
    let str = this.value.substring(this.selectionStart, this.selectionEnd);
    let r = str.match(/^([0-9a-fA-F]{6})$/);
    if (r !== null) {
      colorPicker.setColor(r[1]);
      selection = [this.selectionStart, this.selectionEnd];
      colorPicker.onpick = function(newColor) {
        str = textArea.value;
        textArea.value = str.substring(0, selection[0]) + newColor + str.substring(selection[1]);
      }
    } else {
      selection = [];
      colorPicker.onpick = null;
    }
  }

  elById('saveButton').onclick = function() {
    try {
      const area = elById('configStorageSyncRadioButton').checked ? 'sync' : 'local';
      saveConfiguration(textArea.value, area).then(() => {
        updateMessage('msgSpan', 'Configuration has been updated!');
      })
      .catch(lastError => {
        let msg = lastError.message
        if (lastError.message === "A mutation operation was attempted on a database that did not allow mutations.") {
          msg = "Configuration cannot be saved while using Private Browsing."
        }
        updateMessage('msgSpan', msg, 'warn');
        if (typeof lastError.line === 'number') focusConfigTextArea(lastError.line);
      });
    } catch (e) {
      updateMessage('msgSpan', `Failed to save because ${e.message}`, 'warn');
    }
  }

  // Visual profile editor: build an INI block from the form and append it.
  elById('addProfileButton').onclick = function() {
    try {
      const ini = buildProfileIni({
        name: elById('edName').value,
        label: elById('edLabel').value,
        accountId: elById('edAccountId').value,
        roleName: elById('edRoleName').value,
        roleArn: elById('edRoleArn').value,
        region: elById('edRegion').value,
        color: elById('edColor').value,
        env: elById('edEnv').value,
        sourceProfile: elById('edSourceProfile').value,
        container: elById('edContainer').value,
        containerColor: elById('edContainerColor').value,
        confirm: elById('edConfirm').checked,
      });
      const cur = textArea.value.replace(/\s*$/, '');
      textArea.value = cur ? `${cur}\n\n${ini}\n` : `${ini}\n`;
      textArea.scrollTop = textArea.scrollHeight;

      ['edName', 'edLabel', 'edAccountId', 'edRoleName', 'edRoleArn', 'edRegion', 'edColor', 'edSourceProfile', 'edContainer'].forEach(id => { elById(id).value = ''; });
      elById('edEnv').value = 'none';
      elById('edContainerColor').value = '';
      elById('edConfirm').checked = false;

      updateMessage('editorMsg', 'Added — review the configuration above and click Save.');
    } catch (e) {
      updateMessage('editorMsg', e.message, 'warn');
    }
  }

  // Import / export the raw configuration as a file.
  elById('exportConfigButton').onclick = function() {
    const blob = new Blob([textArea.value], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'roledeck-config.ini';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  elById('importConfigButton').onclick = function() {
    elById('importFileInput').click();
  }
  // Upload + discover: parse a dropped/chosen config file, show what was found,
  // and let the user load it into the editor.
  function handleConfigFile(file) {
    const reader = new FileReader();
    reader.onload = () => showDiscovery(String(reader.result || ''));
    reader.readAsText(file);
  }

  function afterDiscoverLoad() {
    elById('lintButton').click(); // surface any issues right away
    updateMessage('msgSpan', 'Loaded — review and click Save configuration.');
    textArea.scrollTop = 0;
  }

  function showDiscovery(text) {
    const result = discoverProfiles(text);
    const panel = elById('discoverSummary');
    panel.style.display = 'block';
    panel.innerHTML = '';

    if (result.profiles.length === 0) {
      panel.classList.add('warn-panel');
      panel.textContent = 'No switchable roles or profiles were found in that file.';
      return;
    }
    panel.classList.remove('warn-panel');

    const head = document.createElement('div');
    head.className = 'discover-head';
    const pCount = result.profiles.length;
    const aCount = result.accountCount;
    head.innerHTML = `<b>Discovered ${pCount} profile${pCount === 1 ? '' : 's'}</b> across ${aCount} account${aCount === 1 ? '' : 's'}`
      + (result.skipped.length ? ` &middot; skipped ${result.skipped.length}` : '');
    panel.appendChild(head);

    if (result.skipped.length) {
      const details = document.createElement('details');
      const summary = document.createElement('summary');
      summary.textContent = `Skipped ${result.skipped.length} entr${result.skipped.length === 1 ? 'y' : 'ies'} (credentials, SSO, incomplete)`;
      details.appendChild(summary);
      const ul = document.createElement('ul');
      ul.className = 'discover-skipped';
      result.skipped.forEach(s => {
        const li = document.createElement('li');
        li.textContent = `${s.name} — ${s.reason}`;
        ul.appendChild(li);
      });
      details.appendChild(ul);
      panel.appendChild(details);
    }

    const actions = document.createElement('div');
    actions.className = 'save-row';
    const loadBtn = document.createElement('button');
    loadBtn.className = 'btn btn-primary';
    loadBtn.textContent = 'Load into editor';
    loadBtn.onclick = () => { textArea.value = result.text; afterDiscoverLoad(); };
    const appendBtn = document.createElement('button');
    appendBtn.className = 'btn btn-sm';
    appendBtn.textContent = 'Append to editor';
    appendBtn.onclick = () => {
      const cur = textArea.value.replace(/\s*$/, '');
      textArea.value = cur ? `${cur}\n\n${result.text}` : result.text;
      afterDiscoverLoad();
    };
    actions.appendChild(loadBtn);
    actions.appendChild(appendBtn);
    panel.appendChild(actions);
  }

  elById('importFileInput').onchange = function() {
    const file = this.files && this.files[0];
    if (file) handleConfigFile(file);
    this.value = '';
  }
  elById('dropzoneBrowse').onclick = function(e) {
    e.preventDefault();
    e.stopPropagation();
    elById('importFileInput').click();
  }
  const dropzone = elById('configDropzone');
  dropzone.onclick = function() { elById('importFileInput').click(); }
  dropzone.addEventListener('dragover', function(e) { e.preventDefault(); dropzone.classList.add('dragover'); });
  dropzone.addEventListener('dragleave', function() { dropzone.classList.remove('dragover'); });
  dropzone.addEventListener('drop', function(e) {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) handleConfigFile(file);
  });

  // Config linter
  elById('lintButton').onclick = function() {
    const warnings = lintConfig(textArea.value);
    const panel = elById('lintResults');
    panel.innerHTML = '';
    panel.style.display = 'block';
    if (warnings.length === 0) {
      const ok = document.createElement('div');
      ok.className = 'lint-ok';
      ok.textContent = '✓ No problems found.';
      panel.appendChild(ok);
      return;
    }
    warnings.forEach(w => {
      const row = document.createElement('div');
      row.className = `lint-item lint-${w.level}`;
      row.textContent = (w.line ? `Line ${w.line}: ` : '') + w.message;
      if (w.line) {
        row.style.cursor = 'pointer';
        row.onclick = () => focusConfigTextArea(w.line);
      }
      panel.appendChild(row);
    });
  }

  // Activity log
  elById('exportActivityButton').onclick = function() {
    StorageProvider.getLocalRepository().get(['rdActivityLog']).then(({ rdActivityLog }) => {
      downloadText(activityToCsv(rdActivityLog || []), 'roledeck-activity.csv', 'text/csv');
    });
  }
  elById('clearActivityButton').onclick = function() {
    StorageProvider.getLocalRepository().set({ rdActivityLog: [] }).then(renderActivityLog);
  }
  renderActivityLog();

  // Managed config
  elById('managedUrl').onchange = function() {
    syncStorageRepo.set({ managedConfigUrl: this.value.trim() });
  }
  elById('managedAuto').onchange = function() {
    syncStorageRepo.set({ managedConfigAuto: this.checked });
  }
  elById('fetchManagedButton').onclick = async function() {
    const url = elById('managedUrl').value.trim();
    try {
      if (!/^https:\/\//i.test(url)) throw new Error('Enter an https:// URL.');
      const origin = new URL(url).origin + '/*';
      const granted = await new Promise(res => brw.permissions.request({ origins: [origin] }, res));
      if (!granted) throw new Error('Permission to access that URL was denied.');
      const resp = await fetch(url, { cache: 'no-store' });
      if (!resp.ok) throw new Error(`Fetch failed (HTTP ${resp.status}).`);
      const text = await resp.text();
      await applyManagedConfig(text);
      textArea.value = text;
      elById('configStorageLocalRadioButton').checked = true;
      updateMessage('managedMsg', 'Fetched and applied (stored locally).');
    } catch (e) {
      updateMessage('managedMsg', e.message, 'warn');
    }
  }
  syncStorageRepo.get(['managedConfigUrl', 'managedConfigAuto']).then(d => {
    elById('managedUrl').value = d.managedConfigUrl || '';
    elById('managedAuto').checked = Boolean(d.managedConfigAuto);
  });

  elById('prodIdleLockMin').onchange = function() {
    syncStorageRepo.set({ prodIdleLockMin: Number(this.value) });
  }

  const booleanSettings = ['hidesAccountId', 'showOnlyMatchingRoles', 'autoAssumeLastRole', 'useFirefoxContainers', 'autoSessionRenew', 'prodBanner'];
  for (let key of booleanSettings) {
    elById(`${key}CheckBox`).onchange = function() {
      syncStorageRepo.set({ [key]: this.checked });
    }
  }
  const autoTabGroupingCheckBox = elById('autoTabGroupingCheckBox');
  const signinEndpointInHereCheckBox = elById('signinEndpointInHereCheckBox');
  if (navigator.userAgent.includes('Firefox')) {
    // Firefox has no tab groups API.
    autoTabGroupingCheckBox.disabled = true;
    autoTabGroupingCheckBox.parentElement.style.textDecoration = 'line-through';
    autoTabGroupingCheckBox.parentElement.title = 'This browser does not support tab groups.';
  } else {
    // Chrome/Edge: container tabs are a Firefox-only feature.
    const useFirefoxContainersCheckBox = elById('useFirefoxContainersCheckBox');
    useFirefoxContainersCheckBox.disabled = true;
    useFirefoxContainersCheckBox.parentElement.style.textDecoration = 'line-through';
    useFirefoxContainersCheckBox.parentElement.title = 'This browser does not support container tabs.';

    autoTabGroupingCheckBox.onchange = function() {
      if (this.checked) {
        brw.permissions.request({
          permissions: ['tabGroups'],
          origins: ["https://*.console.aws.amazon.com/*"],
        }, (granted) => {
          if (granted) {
            syncStorageRepo.set({ autoTabGrouping: 'AddTabGroup,LogoutOnRemove' });
          } else {
            this.checked = false;
          }
        });
      } else {
        syncStorageRepo.set({ autoTabGrouping: false });
      }
    }
  }

  signinEndpointInHereCheckBox.onchange = function() {
    syncStorageRepo.set({ signinEndpointInHere: this.checked });
  }

  getRemoteConnectInfo().then(rci => {
    if (rci && rci.subdomain && rci.clientId) {
      elById('configHubDomain').value = rci.subdomain;
      elById('configHubClientId').value = rci.clientId;
      if (rci.refreshToken) {
        updateRemoteFieldsState('connected');
      } else {
        updateRemoteFieldsState('disconnected');
        updateMessage('remoteMsgSpan', "Please reconnect because your credentials have expired.", 'warn');
      }
    }
  });

  booleanSettings.push('autoTabGrouping');
  booleanSettings.push('signinEndpointInHere');

  elById('configSenderIdText').onchange = function() {
    syncStorageRepo.set({ configSenderId: this.value });
  }

  elById('configStorageSyncRadioButton').onchange = elById('configStorageLocalRadioButton').onchange = function(e) {
    if (this.value === 'sync') {
      // local to sync
      const localStorageRepo = StorageProvider.getLocalRepository();
      const now = nowEpochSeconds();
      loadConfigIni(localStorageRepo)
      .then(text => {
        if (text) {
          return saveConfigIni(syncStorageRepo, text)
        }
      })
      .then(() => {
        return Promise.all([
          syncStorageRepo.set({ configStorageArea: 'sync', profilesLastUpdated: now }),
          localStorageRepo.set({ profilesTableUpdated: now }),
        ])
      })
      .catch(err => {
        e.preventDefault();
        alert(err.message);
        elById('configStorageLocalRadioButton').checked = true;
      });
    } else {
      // sync to local
      syncStorageRepo.set({ configStorageArea: 'local' })
      .catch(err => {
        e.preventDefault();
        alert(err.message);
        elById('configStorageSyncRadioButton').checked = true;
      });
    }
  }

  elById('defaultVisualRadioButton').onchange = elById('lightVisualRadioButton').onchange = elById('darkVisualRadioButton').onchange = function() {
    const visualMode = this.value;
    syncStorageRepo.set({ visualMode });
    if (visualMode === 'dark' || (visualMode === 'default' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.body.classList.add('darkMode');
    } else {
      document.body.classList.remove('darkMode');
    }
  }

  syncStorageRepo.get(['configSenderId', 'configStorageArea', 'visualMode', 'prodIdleLockMin'].concat(booleanSettings))
  .then(data => {
    elById('configSenderIdText').value = data.configSenderId || '';
    for (let key of booleanSettings) {
      elById(`${key}CheckBox`).checked = Boolean(data[key]);
    }
    elById('prodBannerCheckBox').checked = data.prodBanner !== false; // default on
    elById('prodIdleLockMin').value = String(data.prodIdleLockMin || 0);
    if (navigator.userAgent.includes('Firefox')) {
      elById('useFirefoxContainersCheckBox').checked = data.useFirefoxContainers !== false; // default on (Firefox)
    }

    configStorageArea = data.configStorageArea || 'sync'
    switch (configStorageArea) {
      case 'sync':
        elById('configStorageSyncRadioButton').checked = true
        break;
      case 'local':
        elById('configStorageLocalRadioButton').checked = true
        break;
    }

    const visualMode = data.visualMode || 'default'
    elById(visualMode + 'VisualRadioButton').checked = true;
    if (visualMode === 'dark' || (visualMode === 'default' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.body.classList.add('darkMode');
    }

    loadConfigIni(StorageProvider.getRepositoryByKind(configStorageArea)).then(cfgText => {
      textArea.value = cfgText || '';
    });
  });
}

async function saveConfiguration(text, storageArea) {
  const profileSet = ConfigParser.parseIni(text);

  const syncRepo = StorageProvider.getSyncRepository();
  const localRepo = StorageProvider.getLocalRepository();
  const now = nowEpochSeconds();

  await saveConfigIni(localRepo, text);
  if (storageArea === 'sync') {
    await saveConfigIni(syncRepo, text);
    await syncRepo.set({ profilesLastUpdated: now });
  }

  await writeProfileSetToTable(profileSet);
  await localRepo.set({ profilesTableUpdated: now });
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function downloadText(text, filename, type = 'text/plain') {
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function renderActivityLog() {
  StorageProvider.getLocalRepository().get(['rdActivityLog']).then(({ rdActivityLog }) => {
    const log = rdActivityLog || [];
    const body = elById('activityBody');
    const wrap = elById('activityTableWrap');
    const empty = elById('activityEmpty');
    body.innerHTML = '';
    if (log.length === 0) {
      wrap.style.display = 'none';
      empty.style.display = 'block';
      return;
    }
    empty.style.display = 'none';
    wrap.style.display = 'block';
    log.slice(0, 200).forEach(e => {
      const tr = document.createElement('tr');
      const when = e.ts ? new Date(e.ts).toLocaleString() : '';
      const env = e.env ? `<span class="log-env env-${escapeHtml(e.env)}">${escapeHtml(e.env)}</span>` : '';
      tr.innerHTML = `<td>${escapeHtml(when)}</td><td>${escapeHtml(e.profile)}</td><td>${escapeHtml(e.account)}</td><td>${env}</td>`;
      body.appendChild(tr);
    });
  });
}

function updateMessage(elId, msg, cls = 'success') {
  const el = elById(elId);
  const span = document.createElement('span');
  span.className = cls;
  span.textContent = msg;
  const child = el.firstChild;
  if (child) {
    el.replaceChild(span, child);
  } else {
    el.appendChild(span);
  }

  if (cls === 'success') {
    setTimeout(() => {
      span.remove();
    }, 2500);
  }
}

function updateRemoteFieldsState(state) {
  if (state === 'connected') {
    elById('configHubPanel').style.display = 'block';
    elById('standalonePanel').style.display = 'none';
    elById('configHubDomain').disabled = true;
    elById('configHubClientId').disabled = true;
    elById('cancelConfigHubButton').style.display = 'none';
    elById('connectConfigHubButton').style.display = 'none';
    elById('disconnectConfigHubButton').style.display = 'inline-block';
    elById('reloadConfigHubButton').style.display = 'inline-block';
  } else if (state === 'disconnected') {
    elById('configHubPanel').style.display = 'block';
    elById('standalonePanel').style.display = 'none';
    elById('configHubDomain').disabled = false;
    elById('configHubClientId').disabled = false;
    elById('cancelConfigHubButton').style.display = 'inline-block';
    elById('connectConfigHubButton').style.display = 'inline-block';
    elById('disconnectConfigHubButton').style.display = 'none';
    elById('reloadConfigHubButton').style.display = 'none';
  } else { // not shown
    elById('standalonePanel').style.display = 'block';
    elById('configHubPanel').style.display = 'none';
  }
}

function focusConfigTextArea(ln) {
  const ta = elById('awsConfigTextArea');
  ta.scrollTop = ln < 10 ? 0 : 16 * (ln - 10);
  const lines = ta.value.split('\n');
  if (ln === 1) {
    ta.setSelectionRange(0, lines[0].length + 1);
    ta.focus();
    return;
  }
  ln--;
  const start = lines.slice(0, ln).join('\n').length + 1;
  const end = start + lines[ln].length;
  ta.setSelectionRange(start, end);
  ta.focus();
}
