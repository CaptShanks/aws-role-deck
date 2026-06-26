import { expect } from 'chai'
import { appendActivity, activityToCsv } from './activity_log.js'

describe('appendActivity', () => {
  it('prepends the newest entry', () => {
    const log = appendActivity([{ profile: 'a' }], { profile: 'b' });
    expect(log.map(e => e.profile)).to.deep.eq(['b', 'a']);
  })
  it('caps the log length', () => {
    let log = [];
    for (let i = 0; i < 10; i++) log = appendActivity(log, { profile: `p${i}` }, 5);
    expect(log).to.have.length(5);
    expect(log[0].profile).to.eq('p9');
  })
})

describe('activityToCsv', () => {
  it('writes a header and one row per entry', () => {
    const csv = activityToCsv([
      { ts: 0, profile: 'prod', account: '123456789012', role: 'Admin', env: 'production', browser: 'firefox' },
    ]);
    const [header, row] = csv.split('\n');
    expect(header).to.eq('time,profile,account,role,env,browser');
    expect(row).to.eq('1970-01-01T00:00:00.000Z,prod,123456789012,Admin,production,firefox');
  })
  it('escapes values containing commas or quotes', () => {
    const csv = activityToCsv([{ ts: 0, profile: 'a,b', account: '1', role: 'say "hi"', env: '', browser: '' }]);
    expect(csv.split('\n')[1]).to.contain('"a,b"');
    expect(csv.split('\n')[1]).to.contain('"say ""hi"""');
  })
  it('handles an empty log', () => {
    expect(activityToCsv([])).to.eq('time,profile,account,role,env,browser');
  })
})
