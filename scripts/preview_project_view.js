const ado = require('./ado_client');

function extractCustomer(title) {
  const m = title.match(/\[LifeERP[^\]]*\]\[([^\]]+)\]/);
  if (m) return m[1];
  if (title.startsWith('[FTP]')) return 'FTP工具';
  return '通用/平台';
}

function daysTo(isoStr) {
  if (!isoStr) return null;
  return Math.round((new Date(isoStr).getTime() - Date.now()) / 86400000);
}

function lightOrder(l) { return {'🔴':0,'🟡':1,'⚫':2,'🟢':3}[l] ?? 9; }

async function main() {
  const ids = await ado.wiqlQuery(
    `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = 'LifeCOM' AND [System.WorkItemType] = 'Feature' AND [System.State] NOT IN ('Closed','Removed') ORDER BY [Microsoft.VSTS.Scheduling.TargetDate]`,
    200
  );
  const features = await ado.fetchWorkItems(ids, [
    'System.Id','System.Title','System.State','Microsoft.VSTS.Scheduling.TargetDate'
  ]);

  // Group by customer
  const groups = {};
  for (const f of features) {
    const title = f.fields['System.Title'];
    const tdate = f.fields['Microsoft.VSTS.Scheduling.TargetDate'];
    const days = daysTo(tdate);
    let light = '🟡';
    if (days !== null && days < 0) light = '🔴';
    else if (f.fields['System.State'] === 'New') light = '⚫';

    const customer = extractCustomer(title);
    const cleanTitle = title
      .replace(/^\[LifeERP[^\]]*\]\[[^\]]+\]\s*/, '')
      .replace(/^\[FTP\]\[[^\]]+\]\s*/, '')
      .trim();

    if (!groups[customer]) groups[customer] = [];
    groups[customer].push({ cleanTitle, light, tdate, days, state: f.fields['System.State'] });
  }

  // Sort customers by worst status
  const customerOrder = Object.entries(groups).map(([name, items]) => {
    const worst = Math.min(...items.map(i => lightOrder(i.light)));
    return { name, items, worst };
  }).sort((a,b) => a.worst - b.worst || b.items.length - a.items.length);

  const lines = ['*📊 專案開發進度（客戶視角）*', ''];
  for (const { name, items } of customerOrder.slice(0, 10)) {
    const reds = items.filter(i => i.light === '🔴').length;
    const yellows = items.filter(i => i.light === '🟡').length;
    const greens = items.filter(i => i.light === '🟢').length;
    const blacks = items.filter(i => i.light === '⚫').length;
    const summary = [reds && `🔴×${reds}`, yellows && `🟡×${yellows}`, blacks && `⚫×${blacks}`, greens && `🟢×${greens}`].filter(Boolean).join(' ');
    lines.push(`*🏢 ${name}*  (共 ${items.length} 項)  ${summary}`);
    const sorted = [...items].sort((a,b) => lightOrder(a.light) - lightOrder(b.light));
    sorted.slice(0,5).forEach(i => {
      const dateStr = i.tdate
        ? (i.days < 0 ? ` | ⚠️逾期${Math.abs(i.days)}天` : ` | 剩${i.days}天`)
        : '';
      const shortTitle = i.cleanTitle.length > 38 ? i.cleanTitle.slice(0,38)+'…' : i.cleanTitle;
      lines.push(`  ${i.light} ${shortTitle}${dateStr}`);
    });
    if (items.length > 5) lines.push(`  _(還有 ${items.length-5} 項...)_`);
    lines.push('');
  }
  if (customerOrder.length > 10) {
    lines.push(`_另有 ${customerOrder.length - 10} 個客戶未顯示_`);
  }

  console.log(lines.join('\n'));
}

main().catch(e => console.error(e.stack));
