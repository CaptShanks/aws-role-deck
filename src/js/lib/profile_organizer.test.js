import { expect } from 'chai'
import {
  parseBoolish,
  detectEnv,
  envLabel,
  needsConfirm,
  fuzzyScore,
  searchProfiles,
  updateRecents,
  groupProfiles,
} from './profile_organizer.js'

describe('parseBoolish', () => {
  it('parses truthy and falsy strings', () => {
    expect(parseBoolish('true')).to.be.true;
    expect(parseBoolish('YES')).to.be.true;
    expect(parseBoolish('off')).to.be.false;
    expect(parseBoolish('0')).to.be.false;
  })
  it('returns null for unknown values', () => {
    expect(parseBoolish('maybe')).to.be.null;
  })
  it('treats missing as false', () => {
    expect(parseBoolish(undefined)).to.be.false;
  })
})

describe('detectEnv', () => {
  it('uses an explicit env parameter', () => {
    expect(detectEnv({ env: 'prod' })).to.eq('production');
    expect(detectEnv({ env: 'Staging' })).to.eq('staging');
    expect(detectEnv({ env: 'qa' })).to.eq('development');
  })
  it('infers from the profile name', () => {
    expect(detectEnv({ name: 'acme-production-admin' })).to.eq('production');
    expect(detectEnv({ name: 'acme-staging' })).to.eq('staging');
    expect(detectEnv({ name: 'dev-sandbox' })).to.eq('development');
  })
  it('treats non-prod as development, not production', () => {
    expect(detectEnv({ name: 'acme-nonprod' })).to.eq('development');
  })
  it('returns null when nothing matches', () => {
    expect(detectEnv({ name: 'marketingadmin' })).to.be.null;
  })
})

describe('envLabel', () => {
  it('maps envs to short labels', () => {
    expect(envLabel('production')).to.eq('PROD');
    expect(envLabel('staging')).to.eq('STG');
    expect(envLabel('development')).to.eq('DEV');
    expect(envLabel(null)).to.eq('');
  })
})

describe('needsConfirm', () => {
  it('guards production profiles by default', () => {
    expect(needsConfirm({ name: 'prod-admin' })).to.be.true;
  })
  it('does not guard non-production by default', () => {
    expect(needsConfirm({ name: 'dev-admin' })).to.be.false;
    expect(needsConfirm({ name: 'marketingadmin' })).to.be.false;
  })
  it('respects an explicit confirm flag', () => {
    expect(needsConfirm({ name: 'dev-admin', confirm: 'true' })).to.be.true;
    expect(needsConfirm({ name: 'prod-admin', confirm: 'false' })).to.be.false;
  })
})

describe('fuzzyScore', () => {
  it('matches an empty query', () => {
    expect(fuzzyScore('', 'anything')).to.eq(0);
  })
  it('matches subsequences and rejects non-subsequences', () => {
    expect(fuzzyScore('abc', 'axbxc')).to.be.greaterThan(0);
    expect(fuzzyScore('abc', 'acb')).to.eq(-1);
  })
  it('rewards prefix and consecutive matches', () => {
    expect(fuzzyScore('pro', 'production')).to.be.greaterThan(fuzzyScore('pro', 'approd'));
  })
})

describe('searchProfiles', () => {
  const profiles = [
    { name: 'prod-admin', aws_account_id: '111111111111' },
    { name: 'staging-admin', aws_account_id: '222222222222' },
    { name: 'dev-readonly', aws_account_id: '333333333333' },
  ];
  it('returns all profiles for an empty query', () => {
    expect(searchProfiles(profiles, '')).to.have.length(3);
  })
  it('filters by fuzzy match across name and account id', () => {
    const r = searchProfiles(profiles, 'prod');
    expect(r).to.have.length(1);
    expect(r[0].name).to.eq('prod-admin');
  })
  it('matches by account id digits', () => {
    const r = searchProfiles(profiles, '222');
    expect(r).to.have.length(1);
    expect(r[0].name).to.eq('staging-admin');
  })
  it('ANDs multiple words', () => {
    const r = searchProfiles(profiles, 'admin staging');
    expect(r).to.have.length(1);
    expect(r[0].name).to.eq('staging-admin');
  })
  it('matches a custom label', () => {
    const withLabel = [{ name: 'acct-1', aws_account_id: '111111111111', label: 'Billing' }];
    const r = searchProfiles(withLabel, 'billing');
    expect(r).to.have.length(1);
  })
})

describe('updateRecents', () => {
  it('moves the name to the front and dedupes', () => {
    expect(updateRecents(['b', 'a', 'c'], 'a')).to.deep.eq(['a', 'b', 'c']);
  })
  it('caps the list length', () => {
    expect(updateRecents(['1', '2', '3'], '4', 3)).to.deep.eq(['4', '1', '2']);
  })
})

describe('groupProfiles', () => {
  const profiles = [
    { name: 'a' }, { name: 'b' }, { name: 'c' }, { name: 'd' },
  ];
  it('splits into favorites, recent, and others without duplicates', () => {
    const { favorites, recent, others } = groupProfiles(profiles, ['b'], ['c', 'b', 'a']);
    expect(favorites.map(p => p.name)).to.deep.eq(['b']);
    // 'b' is excluded from recent because it is already a favorite
    expect(recent.map(p => p.name)).to.deep.eq(['c', 'a']);
    expect(others.map(p => p.name)).to.deep.eq(['d']);
  })
  it('honors the recent limit', () => {
    const { recent } = groupProfiles(profiles, [], ['a', 'b', 'c', 'd'], 2);
    expect(recent.map(p => p.name)).to.deep.eq(['a', 'b']);
  })
})
