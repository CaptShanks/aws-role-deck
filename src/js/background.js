import { SessionMemory, SyncStorageRepository } from './lib/storage_repository.js'
import { setIcon } from './lib/set_icon.js'
import { externalConfigReceived } from './handlers/external.js'
import { updateProfilesTable } from './handlers/update_profiles.js'
import { openProfileInContainer, setupContainerTabGuard, handleContainerRenewAlarm, clearContainerRenew } from './lib/container_tabs.js'
import { trackSwitch, clearTracking, handleRenewAlarm } from './lib/session_renew.js'
import { applyManagedConfig } from './lib/managed_config.js'

const syncStorageRepo = new SyncStorageRepository(chrome || browser)
const sessionMemory = new SessionMemory(chrome || browser)

setupContainerTabGuard()

chrome.alarms.onAlarm.addListener(alarm => {
  handleRenewAlarm(alarm.name).catch(err => console.error(err));
  handleContainerRenewAlarm(alarm.name).catch(err => console.error(err));
})

chrome.tabs.onRemoved.addListener(tabId => {
  clearTracking(tabId).catch(() => {});
  clearContainerRenew(tabId).catch(() => {});
})

async function initScript() {
  await sessionMemory.set({ switchCount: 0 });

  // The donor "golden key" only drives a cosmetic icon now; all features are
  // available to everyone.
  const { goldenKeyExpire } = await syncStorageRepo.get(['goldenKeyExpire']);
  if ((new Date().getTime() / 1000) < Number(goldenKeyExpire)) {
    await sessionMemory.set({ hasGoldenKey: 't' });
    setIcon('/icons/Icon_48x48_g.png');
  }
}

// Re-fetch the team-managed config on startup if enabled and the host
// permission is still granted.
async function refreshManagedConfig() {
  const { managedConfigUrl, managedConfigAuto } = await syncStorageRepo.get(['managedConfigUrl', 'managedConfigAuto']);
  if (!managedConfigAuto || !managedConfigUrl) return;
  try {
    const origin = new URL(managedConfigUrl).origin + '/*';
    const granted = await chrome.permissions.contains({ origins: [origin] });
    if (!granted) return;
    const resp = await fetch(managedConfigUrl, { cache: 'no-store' });
    if (!resp.ok) return;
    await applyManagedConfig(await resp.text());
    console.info('RoleDeck: refreshed managed config from', managedConfigUrl);
  } catch (err) {
    console.error(`RoleDeck managed config refresh failed: ${err}`);
  }
}

chrome.runtime.onStartup.addListener(function () {
  updateProfilesTable().catch(err => {
    console.error(err);
  });

  refreshManagedConfig();
  initScript();
})

chrome.runtime.onInstalled.addListener(function (details) {
  const { reason } = details;
  if (reason === 'install' || reason === 'update') {
    const url = chrome.runtime.getURL('updated.html')
    chrome.tabs.create({ url }, function(){});
  }
  if (reason === 'update') {
    updateProfilesTable().catch(err => {
      console.error(err);
    });
  }
  initScript();
})

chrome.runtime.onMessageExternal.addListener(function (message, sender, sendResponse) {
  const { action, dataType, data } = message || {};
  if (!action || !dataType || !data) return;

  externalConfigReceived(action, dataType, data, sender.id)
  .then(() => {
    sendResponse({ result: 'success' });
  })
  .catch(err => {
    setTimeout(() => {
      sendResponse({
        result: 'failure',
        error: { message: err.message },
      });
    }, 1000); // delay to prevent to try scanning id
  });
});

function createTabGroupKey(title) {
  return encodeURIComponent(`tabGroup/${title}`);
}

let listeningTabGroupsRemove = false;

chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  if (message.action === 'openInContainer') {
    // Firefox only: the returned promise resolution is delivered as the response
    try {
      await openProfileInContainer(message.data);
      return {};
    } catch (err) {
      return { error: err.message };
    }
  }
  if (message.action === 'trackSwitch') {
    await trackSwitch(message.tabId ?? sender.tab?.id, message.data);
  } else if (message.action === 'listenTabGroupsRemove' && !listeningTabGroupsRemove) {
    chrome.tabGroups.onRemoved.addListener(async function (group) {
      const key = createTabGroupKey(group.title);
      const result = await sessionMemory.get([key]);
      const { [key]: url } = result;
      if (url) {
        await sessionMemory.delete([key]);
        const tab = await chrome.tabs.create({ url, active: false });
        setTimeout(() => {
          chrome.tabs.remove(tab.id);
        }, 1000);
        console.info('Logout', group.title, url);
      }
    });
    listeningTabGroupsRemove = true;
  } else if (message.action === 'openTab') {
    const { url, signinHost, tabGroup } = message;
    const tab = await chrome.tabs.create({ url });

    if (tabGroup) {
      const uRL = new URL(url);
      const params = new URLSearchParams(uRL.search);
      const sessionId = params.get('login_hint');

      const { title, color } = tabGroup;

      const [group] = await chrome.tabGroups.query({ title });
      if (group) {
        await chrome.tabs.group({ groupId: group.id, tabIds: tab.id });
      } else {
        const newGroupId = await chrome.tabs.group({ tabIds: tab.id });
        await chrome.tabGroups.update(newGroupId, { title, color: getTabGroupColor(color) });
      }

      const key = createTabGroupKey(title);
      await sessionMemory.set({ [key]: `https://${signinHost}/sessions/${sessionId}/v1/logout` });
    }
  }
  sendResponse({});
});

function getTabGroupColor(hexColor) {
  if (!hexColor) return 'grey';

  const tabGroupColors = {
    grey: [128, 128, 128],
    blue: [0, 0, 255],
    red: [255, 0, 0],
    yellow: [255, 255, 0],
    green: [0, 128, 0],
    pink: [255, 192, 203],
    purple: [128, 0, 128],
    cyan: [0, 255, 255],
    orange: [255, 165, 0],
  };

  const inputRgb = (() => {
    const result = /^([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hexColor);
    return result ? [
      parseInt(result[1], 16),
      parseInt(result[2], 16),
      parseInt(result[3], 16)
    ] : null;
  })();

  const calcDistance = (rgb1, rgb2) => {
    if (!rgb1) return Infinity;
    return rgb1.reduce((dis, val, i) => dis + (val - rgb2[i]) ** 2, 0);
  };

  let closestColor = 'grey';
  let minDistance = Infinity;
  for (const tgColor in tabGroupColors) {
    const distance = calcDistance(inputRgb, tabGroupColors[tgColor]);
    if (distance < minDistance) {
      minDistance = distance;
      closestColor = tgColor;
    }
  }

  return closestColor;
}
