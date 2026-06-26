import { expect } from 'chai'
import {
  profileUsesContainer,
  resolveContainerName,
  resolveContainerColor,
  nearestContainerColor,
  colorFromAccount,
  hexFromAccount,
  buildSwitchUrl,
} from './container_tabs.js'

describe('profileUsesContainer', () => {
  it('follows the default when the container parameter is absent', () => {
    expect(profileUsesContainer({}, true)).to.be.true;
    expect(profileUsesContainer({}, false)).to.be.false;
  })

  it('is enabled by truthy values', () => {
    expect(profileUsesContainer({ container: 'true' }, false)).to.be.true;
    expect(profileUsesContainer({ container: 'yes' }, false)).to.be.true;
    expect(profileUsesContainer({ container: 'my-container' }, false)).to.be.true;
  })

  it('is disabled by falsy values even if the default is on', () => {
    expect(profileUsesContainer({ container: 'false' }, true)).to.be.false;
    expect(profileUsesContainer({ container: 'no' }, true)).to.be.false;
    expect(profileUsesContainer({ container: 'off' }, true)).to.be.false;
    expect(profileUsesContainer({ container: '0' }, true)).to.be.false;
  })
})

describe('resolveContainerName', () => {
  it('uses the profile name for boolean values', () => {
    expect(resolveContainerName({ profile: 'prod', container: 'true' })).to.eq('prod');
    expect(resolveContainerName({ profile: 'prod' })).to.eq('prod');
  })

  it('uses a custom value as the container name', () => {
    expect(resolveContainerName({ profile: 'prod', container: 'shared-env' })).to.eq('shared-env');
  })

  it('prefers a custom label over the profile name', () => {
    expect(resolveContainerName({ profile: 'acct-1234', label: 'Production', container: 'true' })).to.eq('Production');
  })
})

describe('colorFromAccount', () => {
  it('is deterministic for the same account', () => {
    expect(colorFromAccount('123456789012')).to.eq(colorFromAccount('123456789012'));
  })
  it('returns a real palette color (never grey) for an account', () => {
    expect(colorFromAccount('123456789012')).to.be.oneOf(['blue', 'turquoise', 'green', 'yellow', 'orange', 'red', 'pink', 'purple']);
  })
  it('falls back to toolbar when there is no account', () => {
    expect(colorFromAccount('')).to.eq('toolbar');
  })
})

describe('hexFromAccount', () => {
  it('returns a 6-digit hex for an account', () => {
    expect(hexFromAccount('905418058169')).to.match(/^[0-9a-f]{6}$/);
  })
  it('is deterministic', () => {
    expect(hexFromAccount('905418058169')).to.eq(hexFromAccount('905418058169'));
  })
  it('aligns with the container color (badge hex maps to the same container color)', () => {
    const acct = '905418058169';
    expect(nearestContainerColor(hexFromAccount(acct))).to.eq(colorFromAccount(acct));
  })
  it('falls back to grey when there is no account', () => {
    expect(hexFromAccount('')).to.eq('aaaaaa');
  })
})

describe('resolveContainerColor', () => {
  it('prefers an explicit container_color', () => {
    expect(resolveContainerColor({ containerColor: 'Purple', color: 'ff0000' })).to.eq('purple');
  })

  it('falls back to the nearest container color of the profile color', () => {
    expect(resolveContainerColor({ color: 'ff0000' })).to.eq('red');
  })

  it('derives a color from the account when no color is given', () => {
    const c = resolveContainerColor({ account: '123456789012' });
    expect(c).to.eq(colorFromAccount('123456789012'));
    expect(c).to.not.eq('toolbar');
  })

  it('ignores an invalid container_color', () => {
    expect(resolveContainerColor({ containerColor: 'magenta', color: '00cc99' })).to.eq('turquoise');
  })
})

describe('nearestContainerColor', () => {
  it('maps hex colors to the firefox container palette', () => {
    expect(nearestContainerColor('ff0000')).to.eq('red');
    expect(nearestContainerColor('0000ff')).to.eq('blue');
    expect(nearestContainerColor('ffcc00')).to.eq('yellow');
    expect(nearestContainerColor('ff9900')).to.eq('orange');
    expect(nearestContainerColor('00ff00')).to.eq('green');
  })

  it('returns toolbar when the color is missing or invalid', () => {
    expect(nearestContainerColor(undefined)).to.eq('toolbar');
    expect(nearestContainerColor('red')).to.eq('toolbar');
  })
})

describe('buildSwitchUrl', () => {
  const data = {
    account: '123456789012',
    rolename: 'Admin',
    displayname: 'prod  |  123456789012',
    color: 'ff0000',
    redirecturi: encodeURIComponent('https://us-east-1.console.aws.amazon.com/ec2/home?region=us-east-1'),
  };

  it('builds a switchrole URL on the default endpoint', () => {
    const url = new URL(buildSwitchUrl(data));
    expect(url.origin).to.eq('https://signin.aws.amazon.com');
    expect(url.pathname).to.eq('/switchrole');
    expect(url.searchParams.get('account')).to.eq('123456789012');
    expect(url.searchParams.get('roleName')).to.eq('Admin');
    expect(url.searchParams.get('displayName')).to.eq('prod  |  123456789012');
    expect(url.searchParams.get('color')).to.eq('ff0000');
    expect(url.searchParams.get('redirect_uri')).to.eq('https://us-east-1.console.aws.amazon.com/ec2/home?region=us-east-1');
  })

  it('uses the session signin endpoint', () => {
    const url = new URL(buildSwitchUrl({ ...data, signinEndpoint: 'signin.amazonaws-us-gov.com' }));
    expect(url.host).to.eq('signin.amazonaws-us-gov.com');
  })

  it('applies the region subdomain to the default endpoint', () => {
    const url = new URL(buildSwitchUrl({ ...data, actionSubdomain: 'ap-northeast-1' }));
    expect(url.host).to.eq('ap-northeast-1.signin.aws.amazon.com');
  })

  it('replaces the region subdomain of a regional endpoint', () => {
    const url = new URL(buildSwitchUrl({
      ...data,
      signinEndpoint: 'us-east-1.signin.aws.amazon.com',
      actionSubdomain: 'eu-west-1',
    }));
    expect(url.host).to.eq('eu-west-1.signin.aws.amazon.com');
  })
})
