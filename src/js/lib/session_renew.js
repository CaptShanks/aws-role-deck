//
// Switch-role session auto-renew (silent re-switch before expiry).
//
// An AWS Management Console *switch-role* session is hard-capped at 1 hour by
// AWS and cannot be extended by activity or keep-alive pings; the only way to
// continue is to re-assume the role (switch again). This module tracks when a
// profile was switched into and, shortly before the 1-hour limit, automatically
// re-assumes the role by reloading the tab through the switch flow. The reload
// is silent (no prompt), so unsaved input on the console page can be lost --
// this is opt-in via the options page.
//
// Renewal only works while the underlying base login (IAM user / SSO /
// federated) is still valid. Multi-session ("Prism") tabs are not tracked
// because their switch flow opens a separate tab rather than reloading.
//
import { SessionMemory } from './storage_repository.js';

const brw = (typeof chrome !== 'undefined' && chrome)
  || (typeof browser !== 'undefined' && browser)
  || undefined;

let _memory = null;
function memory() {
  if (!_memory) _memory = new SessionMemory(brw);
  return _memory;
}

export const RENEW_ALARM_PREFIX = 'aesrRenew:';
export const SWITCH_SESSION_MINUTES = 60; // AWS console switch-role hard limit
export const RENEW_BEFORE_MINUTES = 5;

export function renewKey(tabId) {
  return `${RENEW_ALARM_PREFIX}${tabId}`;
}

export function parseTabIdFromAlarm(name) {
  if (typeof name !== 'string' || !name.startsWith(RENEW_ALARM_PREFIX)) return null;
  const raw = name.slice(RENEW_ALARM_PREFIX.length);
  if (raw === '') return null;
  const id = Number(raw);
  return Number.isInteger(id) ? id : null;
}

export function computeExpiry(now, ttlMinutes = SWITCH_SESSION_MINUTES) {
  return now + ttlMinutes * 60 * 1000;
}

export function alarmTimeFor(expiresAt, renewBeforeMinutes = RENEW_BEFORE_MINUTES) {
  return expiresAt - renewBeforeMinutes * 60 * 1000;
}

async function scheduleAlarm(tabId, expiresAt) {
  const name = renewKey(tabId);
  await clearAlarm(name);
  const when = Math.max(Date.now() + 1000, alarmTimeFor(expiresAt));
  brw.alarms.create(name, { when });
}

async function clearAlarm(name) {
  try { await brw.alarms.clear(name); } catch {}
}

async function recordSwitch(tabId, data) {
  const expiresAt = computeExpiry(Date.now());
  await memory().set({ [renewKey(tabId)]: { data, expiresAt } });
  await scheduleAlarm(tabId, expiresAt);
}

// Called when a profile is switched into in a tab. Records the expiry and arms
// the renewal alarm.
export async function trackSwitch(tabId, data) {
  if (!tabId || !data) return;
  await recordSwitch(tabId, data);
}

export async function clearTracking(tabId) {
  const name = renewKey(tabId);
  memory().delete([name]);
  await clearAlarm(name);
}

// Fired by the renewal alarm: silently re-assume the role in the tab (which
// reloads the page) and arm the next renewal. Cleans up if the tab is gone or
// no longer has a content script.
export async function handleRenewAlarm(name) {
  const tabId = parseTabIdFromAlarm(name);
  if (tabId === null) return;

  const key = renewKey(tabId);
  const stored = await memory().get([key]);
  const rec = stored && stored[key];
  if (!rec) return;

  const tab = await brw.tabs.get(tabId).catch(() => null);
  if (!tab) {
    await clearTracking(tabId);
    return;
  }

  // Arm the next renewal before triggering this one, so the cycle continues
  // after the page reloads.
  await recordSwitch(tabId, rec.data);

  brw.tabs.sendMessage(tabId, { action: 'performRenew', data: rec.data })
    .catch(() => clearTracking(tabId));
}
