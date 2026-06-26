import { expect } from 'chai'
import { buildProfileIni } from './build_profile_ini.js'

describe('buildProfileIni', () => {
  it('builds an account + role block', () => {
    const ini = buildProfileIni({ name: 'dev', accountId: '123456789012', roleName: 'Admin' });
    expect(ini).to.eq('[dev]\naws_account_id = 123456789012\nrole_name = Admin');
  })

  it('builds a role_arn block', () => {
    const ini = buildProfileIni({ name: 'prod', roleArn: 'arn:aws:iam::123456789012:role/Admin' });
    expect(ini).to.eq('[prod]\nrole_arn = arn:aws:iam::123456789012:role/Admin');
  })

  it('includes optional parameters and strips a leading # from color', () => {
    const ini = buildProfileIni({
      name: 'prod-admin',
      accountId: '123456789012',
      roleName: 'Admin',
      region: 'us-east-1',
      color: '#FF3333',
      env: 'production',
      container: 'true',
      containerColor: 'red',
    });
    expect(ini).to.contain('region = us-east-1');
    expect(ini).to.contain('color = ff3333');
    expect(ini).to.contain('env = production');
    expect(ini).to.contain('container = true');
    expect(ini).to.contain('container_color = red');
  })

  it('includes a custom label', () => {
    const ini = buildProfileIni({ name: 'acct-prod', accountId: '123456789012', label: 'Production (billing)' });
    expect(ini).to.contain('label = Production (billing)');
  })

  it('adds confirm = true when requested', () => {
    const ini = buildProfileIni({ name: 'p', accountId: '123456789012', confirm: true });
    expect(ini).to.contain('confirm = true');
  })

  it('uses a custom container name', () => {
    const ini = buildProfileIni({ name: 'p', accountId: '123456789012', container: 'shared-sandbox' });
    expect(ini).to.contain('container = shared-sandbox');
  })

  it('omits container parameters when off', () => {
    const ini = buildProfileIni({ name: 'p', accountId: '123456789012', container: 'off', containerColor: 'red' });
    expect(ini).to.not.contain('container');
  })

  it('throws when the name is missing', () => {
    expect(() => buildProfileIni({ accountId: '123456789012' })).to.throw(/name is required/);
  })

  it('throws when neither account id nor role arn is given', () => {
    expect(() => buildProfileIni({ name: 'x' })).to.throw(/account ID or a role ARN/);
  })

  it('throws on an invalid role arn', () => {
    expect(() => buildProfileIni({ name: 'x', roleArn: 'not-an-arn' })).to.throw(/Role ARN looks invalid/);
  })

  it('throws on an invalid color', () => {
    expect(() => buildProfileIni({ name: 'x', accountId: '123456789012', color: 'zzz' })).to.throw(/6-digit hex/);
  })
})
