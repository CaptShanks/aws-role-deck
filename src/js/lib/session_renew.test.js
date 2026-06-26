import { expect } from 'chai'
import {
  RENEW_ALARM_PREFIX,
  SWITCH_SESSION_MINUTES,
  RENEW_BEFORE_MINUTES,
  renewKey,
  parseTabIdFromAlarm,
  computeExpiry,
  alarmTimeFor,
} from './session_renew.js'

describe('renewKey', () => {
  it('prefixes the tab id', () => {
    expect(renewKey(42)).to.eq(`${RENEW_ALARM_PREFIX}42`);
  })
})

describe('parseTabIdFromAlarm', () => {
  it('extracts the tab id from a renew alarm name', () => {
    expect(parseTabIdFromAlarm(`${RENEW_ALARM_PREFIX}42`)).to.eq(42);
  })

  it('returns null for unrelated alarm names', () => {
    expect(parseTabIdFromAlarm('tabGroup/foo')).to.be.null;
    expect(parseTabIdFromAlarm('')).to.be.null;
    expect(parseTabIdFromAlarm(undefined)).to.be.null;
  })

  it('returns null when the suffix is not an integer', () => {
    expect(parseTabIdFromAlarm(`${RENEW_ALARM_PREFIX}abc`)).to.be.null;
    expect(parseTabIdFromAlarm(`${RENEW_ALARM_PREFIX}`)).to.be.null;
  })
})

describe('computeExpiry', () => {
  it('adds the switch-role session length to now', () => {
    expect(computeExpiry(1000)).to.eq(1000 + SWITCH_SESSION_MINUTES * 60 * 1000);
  })

  it('honors a custom ttl', () => {
    expect(computeExpiry(0, 30)).to.eq(30 * 60 * 1000);
  })
})

describe('alarmTimeFor', () => {
  it('fires the renew-before window ahead of expiry', () => {
    const expiresAt = computeExpiry(0);
    expect(alarmTimeFor(expiresAt)).to.eq(expiresAt - RENEW_BEFORE_MINUTES * 60 * 1000);
  })

  it('lands the alarm RENEW_BEFORE minutes before a full-length session ends', () => {
    const now = 1_000_000;
    const expiresAt = computeExpiry(now);
    const minutesBeforeExpiry = (expiresAt - alarmTimeFor(expiresAt)) / 60000;
    expect(minutesBeforeExpiry).to.eq(RENEW_BEFORE_MINUTES);
  })
})
