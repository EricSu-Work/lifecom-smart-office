const https = require('https');
const fs = require('fs');
const token = fs.readFileSync(require('os').homedir() + '/.config/slack/user_token', 'utf8').trim();

function slackGet(path) {
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname: 'slack.com', path, method: 'GET',
      headers: { 'Authorization': 'Bearer ' + token }
    }, res => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>resolve(JSON.parse(d))); });
    req.on('error', reject); req.end();
  });
}

async function lookupByEmail(email) {
  const r = await slackGet('/api/users.lookupByEmail?email=' + encodeURIComponent(email));
  if (!r.ok) return null;
  const u = r.user;
  // 取 DM channel
  const dm = await slackGet('/api/conversations.open?users=' + u.id);
  return {
    id: u.id,
    name: u.real_name || u.name,
    email: u.profile?.email || email,
    dm_channel: dm.channel?.id,
  };
}

async function main() {
  const people = [
    { label: 'Eric',    email: 'eric@lifecom.com.tw' },
    { label: 'Willy',   email: 'willy@licodes.net' },
    { label: 'Alex',    email: 'alex@lifecom.com.tw' },
    { label: 'Kennedy', email: 'kennedy@licodes.net' },
  ];

  for (const p of people) {
    const info = await lookupByEmail(p.email);
    if (info) {
      console.log(`${p.label}: id=${info.id} dm=${info.dm_channel} email=${info.email} name=${info.name}`);
    } else {
      console.log(`${p.label}: NOT FOUND`);
    }
  }
}

main().catch(console.error);
