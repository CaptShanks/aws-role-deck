//
// Firefox container tabs support (Firefox only).
//
// A profile can be opened in its own contextual identity (container) so that
// each AWS account keeps an isolated cookie session. Tabs opened from a
// container tab (links, tree-style child tabs) stay in the same container.
//

const CONTAINER_COLORS = [
  'blue', 'turquoise', 'green', 'yellow', 'orange', 'red', 'pink', 'purple', 'toolbar',
];

const CONTAINER_ICONS = [
  'fingerprint', 'briefcase', 'dollar', 'cart', 'circle', 'gift',
  'vacation', 'food', 'fruit', 'pet', 'tree', 'chill', 'fence',
];

// representative RGB values of the Firefox container colors
const CONTAINER_COLOR_VALUES = {
  blue: [55, 173, 255],
  turquoise: [0, 199, 154],
  green: [81, 205, 0],
  yellow: [255, 203, 0],
  orange: [255, 159, 0],
  red: [255, 97, 61],
  pink: [255, 75, 218],
  purple: [175, 81, 245],
};

const MANAGED_STORES_KEY = 'aesrContainerStores';
const DEFAULT_STORE_ID = 'firefox-default';

export function containersAvailable() {
  return typeof browser !== 'undefined' && !!browser.contextualIdentities;
}

// `container` profile parameter:
//   absent          -> follow the 'useFirefoxContainers' setting
//   false/no/off/0  -> never use a container
//   true/yes/on/1   -> use a container named after the profile
//   any other value -> use a container with that name (can be shared between profiles)
export function profileUsesContainer(data, useByDefault) {
  if (!data.container) return Boolean(useByDefault);
  return !['false', 'no', 'off', '0'].includes(data.container.toLowerCase());
}

export function resolveContainerName(data) {
  const flag = (data.container || '').toLowerCase();
  if (['', 'true', 'yes', 'on', '1'].includes(flag)) return data.label || data.profile;
  return data.container;
}

// Deterministic, distinct container color per AWS account when no color is set,
// so every account is visibly color-coded.
const ACCOUNT_PALETTE = ['blue', 'turquoise', 'green', 'yellow', 'orange', 'red', 'pink', 'purple'];
// Hex equivalents of the Firefox container palette, so the AWS console role
// badge color (a hex) matches the container chip color (a name).
const ACCOUNT_HEX = ['37adff', '00c79a', '51cd00', 'ffcb00', 'ff9f00', 'ff614d', 'ff4bda', 'af51f5'];

function accountIndex(account) {
  let h = 0;
  for (const ch of String(account || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % ACCOUNT_PALETTE.length;
}

export function colorFromAccount(account) {
  if (!account) return 'toolbar';
  return ACCOUNT_PALETTE[accountIndex(account)];
}

// Deterministic hex color per account for the AWS console role badge, aligned
// with colorFromAccount so the badge and container chip use the same color.
export function hexFromAccount(account) {
  if (!account) return 'aaaaaa';
  return ACCOUNT_HEX[accountIndex(account)];
}

export function resolveContainerColor(data) {
  const explicit = (data.containerColor || '').toLowerCase();
  if (CONTAINER_COLORS.includes(explicit)) return explicit;
  // 'aaaaaa' is the extension's default grey for profiles without a color — not
  // a meaningful choice, so derive a distinct color from the account instead.
  const color = (data.color || '').toLowerCase();
  if (color && color !== 'aaaaaa') return nearestContainerColor(color);
  return colorFromAccount(data.account);
}

export function nearestContainerColor(hexColor) {
  const inputRgb = (() => {
    if (!hexColor) return null;
    const result = /^([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hexColor);
    return result ? [
      parseInt(result[1], 16),
      parseInt(result[2], 16),
      parseInt(result[3], 16)
    ] : null;
  })();
  if (!inputRgb) return 'toolbar';

  let closestColor = 'toolbar';
  let minDistance = Infinity;
  for (const color in CONTAINER_COLOR_VALUES) {
    const rgb = CONTAINER_COLOR_VALUES[color];
    const distance = inputRgb.reduce((dis, val, i) => dis + (val - rgb[i]) ** 2, 0);
    if (distance < minDistance) {
      minDistance = distance;
      closestColor = color;
    }
  }
  return closestColor;
}

export function buildSwitchUrl(data) {
  let host = data.signinEndpoint || 'signin.aws.amazon.com';
  const { actionSubdomain } = data;
  if (actionSubdomain) {
    if (
      host === 'signin.aws.amazon.com' ||
      host === 'signin.amazonaws-us-gov.com' ||
      host === 'signin.amazonaws.cn'
    ) {
      host = `${actionSubdomain}.${host}`;
    } else if (
      host.endsWith('.signin.aws.amazon.com') ||
      host.endsWith('.signin.amazonaws-us-gov.com') ||
      host.endsWith('.signin.amazonaws.cn')
    ) {
      host = host.replace(/^[^\.]+/, actionSubdomain);
    }
  }

  const params = new URLSearchParams();
  params.set('account', data.account);
  params.set('roleName', data.rolename);
  params.set('displayName', data.displayname);
  if (data.color) params.set('color', data.color);
  if (data.redirecturi) params.set('redirect_uri', decodeURIComponent(data.redirecturi));
  // #rd-auto tells the switchrole content script to auto-confirm this switch.
  // The fragment is client-side only and never sent to AWS.
  return `https://${host}/switchrole?${params.toString()}#rd-auto`;
}

async function ensureContainer(data) {
  const name = resolveContainerName(data);
  const color = resolveContainerColor(data);
  const icon = (() => {
    const explicit = (data.containerIcon || '').toLowerCase();
    return CONTAINER_ICONS.includes(explicit) ? explicit : 'briefcase';
  })();

  const found = await browser.contextualIdentities.query({ name });
  if (found.length > 0) {
    const identity = found[0];
    if (identity.color !== color || identity.icon !== icon) {
      return browser.contextualIdentities.update(identity.cookieStoreId, { color, icon });
    }
    return identity;
  }
  return browser.contextualIdentities.create({ name, color, icon });
}

async function registerManagedStore(cookieStoreId) {
  const data = await browser.storage.local.get(MANAGED_STORES_KEY);
  const stores = data[MANAGED_STORES_KEY] || [];
  if (!stores.includes(cookieStoreId)) {
    stores.push(cookieStoreId);
    await browser.storage.local.set({ [MANAGED_STORES_KEY]: stores });
  }
}

export async function openProfileInContainer(data) {
  const identity = await ensureContainer(data);
  // Copy the base AWS login into the container first, so the switch lands
  // signed-in (a fresh container has no cookies and would show a sign-in page).
  await bootstrapContainerSession(identity.cookieStoreId, data.signinEndpoint);
  const url = buildSwitchUrl(data);
  await browser.tabs.create({ url, cookieStoreId: identity.cookieStoreId });
  await registerManagedStore(identity.cookieStoreId);
}

function awsCookieDomains(signinEndpoint) {
  const ep = signinEndpoint || '';
  if (ep.includes('amazonaws-us-gov')) return ['amazonaws-us-gov.com', 'amazon.com'];
  if (ep.includes('amazonaws.cn')) return ['amazonaws.cn', 'amazon.com'];
  return ['aws.amazon.com', 'amazon.com'];
}

async function copyCookies(fromStore, toStore, domain) {
  let cookies;
  try {
    cookies = await browser.cookies.getAll({ storeId: fromStore, domain });
  } catch (e) {
    return; // no host permission for this domain — skip
  }
  for (const c of cookies) {
    const host = c.domain.replace(/^\./, '');
    const details = {
      url: `http${c.secure ? 's' : ''}://${host}${c.path}`,
      name: c.name,
      value: c.value,
      path: c.path,
      secure: c.secure,
      httpOnly: c.httpOnly,
      sameSite: c.sameSite,
      storeId: toStore,
    };
    if (!c.hostOnly) details.domain = c.domain;
    if (c.expirationDate) details.expirationDate = c.expirationDate;
    if (c.sameSite === 'no_restriction') details.secure = true; // required by browsers
    try {
      await browser.cookies.set(details);
    } catch (e) {
      // skip cookies that can't be copied (partitioned / __Host- edge cases)
    }
  }
}

async function clearCookies(store, domain) {
  let cookies;
  try {
    cookies = await browser.cookies.getAll({ storeId: store, domain });
  } catch (e) {
    return;
  }
  for (const c of cookies) {
    const host = c.domain.replace(/^\./, '');
    try {
      await browser.cookies.remove({ url: `http${c.secure ? 's' : ''}://${host}${c.path}`, name: c.name, storeId: store });
    } catch (e) {
      // ignore
    }
  }
}

// Mirror the current AWS session from the default container into the target so
// the switch lands signed-in. The target's existing AWS cookies are cleared
// first so a stale/partial session can't keep it logged out. (Trimming to
// "just the login cookies" is unreliable — AWS's session cookies are
// intertwined — so we copy them all; the multi-session picker is auto-confirmed.)
async function bootstrapContainerSession(targetStoreId, signinEndpoint) {
  if (!targetStoreId || targetStoreId === DEFAULT_STORE_ID) return;
  if (!browser.cookies) return;
  for (const domain of awsCookieDomains(signinEndpoint)) {
    await clearCookies(targetStoreId, domain);
    await copyCookies(DEFAULT_STORE_ID, targetStoreId, domain);
  }
}

//
// Keep tabs opened from a managed container tab (links, tree-style child
// tabs) in the same container. Firefox inherits the container for most
// opener-based tabs natively; this covers tabs that other extensions or edge
// cases create in the default store.
//
export function setupContainerTabGuard() {
  if (!containersAvailable()) return;

  browser.tabs.onCreated.addListener(async tab => {
    if (tab.cookieStoreId !== DEFAULT_STORE_ID || !tab.openerTabId) return;

    const opener = await browser.tabs.get(tab.openerTabId).catch(() => null);
    if (!opener || !opener.cookieStoreId || opener.cookieStoreId === DEFAULT_STORE_ID) return;

    const data = await browser.storage.local.get(MANAGED_STORES_KEY);
    const stores = data[MANAGED_STORES_KEY] || [];
    if (!stores.includes(opener.cookieStoreId)) return;

    reopenTabInContainer(tab, opener.cookieStoreId);
  });
}

function reopenTabInContainer(tab, cookieStoreId) {
  const reopen = async url => {
    try {
      await browser.tabs.create({
        url,
        cookieStoreId,
        index: tab.index,
        active: tab.active,
        windowId: tab.windowId,
        openerTabId: tab.openerTabId, // keeps the tree shape for tree-style tab extensions
      });
      await browser.tabs.remove(tab.id);
    } catch (err) {
      console.error(`Failed to move the tab into the container: ${err}`);
    }
  };

  if (tab.url && !tab.url.startsWith('about:')) {
    reopen(tab.url);
    return;
  }

  // the URL is not known yet, wait for the first navigation
  const timeout = setTimeout(() => {
    browser.tabs.onUpdated.removeListener(onUpdated);
  }, 10000);
  const onUpdated = (tabId, changeInfo) => {
    if (tabId !== tab.id || !changeInfo.url) return;
    browser.tabs.onUpdated.removeListener(onUpdated);
    clearTimeout(timeout);
    if (changeInfo.url.startsWith('about:')) return;
    reopen(changeInfo.url);
  };
  browser.tabs.onUpdated.addListener(onUpdated);
}
