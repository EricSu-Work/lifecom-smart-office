const { db } = require('./lifecom_db');
const ar = db.prepare(`SELECT data FROM notion_records WHERE json_extract(data,'$._db_name') = '尚未到款項' LIMIT 1`).all();
if (ar.length) console.log(JSON.stringify(JSON.parse(ar[0].data), null, 2));
