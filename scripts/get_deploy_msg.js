const { slack } = require('./lifecom_db');
const msgs = slack.getSince('C03FSJ3PQKD', '1772588973.932209');
const keywords = ['Merged','OMS-Release','開始進行','Release','上板部署'];
const filtered = msgs.filter(m => m.user_id !== 'USLACKBOT' && keywords.some(k => m.text.includes(k)));
filtered.forEach(m => console.log('TS:', m.ts, '\nTEXT:', m.text, '\n---'));
