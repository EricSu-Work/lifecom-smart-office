// 執行 DB migration：加 parent_id 欄位
const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, '../data/lifecom.db'));

try {
  db.exec('ALTER TABLE ado_workitems ADD COLUMN parent_id INTEGER');
  console.log('✅ Added parent_id column to ado_workitems');
} catch(e) {
  if (e.message.includes('duplicate column')) console.log('✅ parent_id already exists');
  else console.error('❌', e.message);
}
db.close();
