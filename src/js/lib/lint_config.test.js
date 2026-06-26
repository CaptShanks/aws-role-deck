import { expect } from 'chai'
import { lintConfig } from './lint_config.js'

const errors = (w) => w.filter(x => x.level === 'error');
const messages = (w) => w.map(x => x.message).join(' | ');

describe('lintConfig', () => {
  it('returns no warnings for a valid config', () => {
    const text = `[base]
aws_account_id = 000011112222

[child]
role_arn = arn:aws:iam::123456789012:role/Admin
source_profile = base`;
    expect(lintConfig(text)).to.have.length(0);
  })

  it('flags a dangling source_profile', () => {
    const text = `[child]
aws_account_id = 123456789012
role_name = Admin
source_profile = missing`;
    const w = lintConfig(text);
    expect(errors(w)).to.have.length(1);
    expect(messages(w)).to.match(/source_profile "missing" is not defined/);
  })

  it('flags duplicate profile names', () => {
    const text = `[dup]
aws_account_id = 111111111111
role_name = A

[dup]
aws_account_id = 222222222222
role_name = B`;
    expect(messages(lintConfig(text))).to.match(/Duplicate profile name "dup"/);
  })

  it('flags mixing role_arn with aws_account_id', () => {
    const text = `[x]
role_arn = arn:aws:iam::123456789012:role/Admin
aws_account_id = 123456789012`;
    expect(messages(lintConfig(text))).to.match(/mixes role_arn/);
  })

  it('flags a profile with neither arn nor account', () => {
    const text = `[x]
region = us-east-1`;
    expect(messages(lintConfig(text))).to.match(/neither role_arn nor aws_account_id/);
  })

  it('warns on an invalid color', () => {
    const text = `[x]
aws_account_id = 123456789012
role_name = A
color = nothex`;
    const w = lintConfig(text);
    expect(w.some(x => x.level === 'warn' && /color/.test(x.message))).to.be.true;
  })

  it('warns on duplicate account/role pairs', () => {
    const text = `[a]
aws_account_id = 123456789012
role_name = Admin

[b]
aws_account_id = 123456789012
role_name = Admin`;
    expect(messages(lintConfig(text))).to.match(/same account\/role/);
  })

  it('flags a setting outside any profile', () => {
    const text = `color = ffffff
[a]
aws_account_id = 123456789012`;
    expect(messages(lintConfig(text))).to.match(/outside of any \[profile\]/);
  })

  it('reports the line number of the offending profile', () => {
    const text = `[ok]
aws_account_id = 111111111111

[bad]
source_profile = nope`;
    const w = lintConfig(text);
    const e = w.find(x => /not defined/.test(x.message));
    expect(e.line).to.eq(4);
  })
})
