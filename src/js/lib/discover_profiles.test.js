import { expect } from 'chai'
import { discoverProfiles } from './discover_profiles.js'

describe('discoverProfiles', () => {
  it('keeps switch-role profiles and strips the "profile " prefix', () => {
    const text = `[profile prod-admin]
role_arn = arn:aws:iam::123456789012:role/Admin
region = us-east-1`;
    const r = discoverProfiles(text);
    expect(r.profiles).to.have.length(1);
    expect(r.profiles[0].name).to.eq('prod-admin');
    expect(r.text).to.contain('[prod-admin]');
    expect(r.text).to.not.contain('[profile');
  })

  it('skips static credential profiles', () => {
    const text = `[default]
aws_access_key_id = AKIAEXAMPLE
aws_secret_access_key = secret

[profile dev]
role_arn = arn:aws:iam::123456789012:role/Dev`;
    const r = discoverProfiles(text);
    expect(r.profiles.map(p => p.name)).to.deep.eq(['dev']);
    expect(r.skipped.some(s => s.reason === 'static credentials')).to.be.true;
  })

  it('skips sso-session blocks', () => {
    const text = `[sso-session my-sso]
sso_start_url = https://example.awsapps.com/start

[profile a]
aws_account_id = 123456789012
role_name = Admin`;
    const r = discoverProfiles(text);
    expect(r.profiles.map(p => p.name)).to.deep.eq(['a']);
    expect(r.skipped.some(s => /SSO/.test(s.reason))).to.be.true;
  })

  it('skips sections with neither role_arn nor aws_account_id', () => {
    const text = `[profile region-only]
region = eu-west-1`;
    const r = discoverProfiles(text);
    expect(r.profiles).to.have.length(0);
    expect(r.skipped[0].reason).to.match(/no role_arn or aws_account_id/);
  })

  it('drops a source_profile that points at a filtered-out profile', () => {
    const text = `[default]
aws_access_key_id = AKIA
aws_secret_access_key = s

[profile child]
role_arn = arn:aws:iam::123456789012:role/Child
source_profile = default`;
    const r = discoverProfiles(text);
    expect(r.profiles).to.have.length(1);
    expect(r.profiles[0]).to.not.have.property('source_profile');
    expect(r.text).to.not.contain('source_profile');
  })

  it('keeps a source_profile that points at a kept base profile', () => {
    const text = `[org]
aws_account_id = 000011112222

[profile child]
aws_account_id = 123456789012
role_name = Role
source_profile = org`;
    const r = discoverProfiles(text);
    expect(r.profiles.map(p => p.name)).to.deep.eq(['org', 'child']);
    expect(r.profiles[1].source_profile).to.eq('org');
  })

  it('counts distinct accounts from role_arn and aws_account_id', () => {
    const text = `[a]
role_arn = arn:aws:iam::111111111111:role/A

[b]
aws_account_id = 222222222222
role_name = B

[c]
role_arn = arn:aws:iam::111111111111:role/C`;
    expect(discoverProfiles(text).accountCount).to.eq(2);
  })
})
