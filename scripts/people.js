/**
 * people.js — LifeCOM 成員 Slack/Email 設定（人員為基礎的發送）
 * DM channel 和 email 已透過 Slack API 驗證
 */
const PEOPLE = {
  Eric:    { id: 'U02E37Q59S9', dm: 'D0ABWLGLGHY',  email: 'eric@lifecom.com.tw',    name: 'Eric Su' },
  Willy:   { id: 'U08L3SR2K6H', dm: 'D08LG6196RX',  email: 'willy@licodes.net',       name: 'Willy(陳茂清)' },
  Alex:    { id: 'U02E682ALTU', dm: 'D02DZFHEQ06',  email: 'alex@lifecom.com.tw',     name: '陳少飛(Alex)' },
  Kennedy: { id: 'U07GFT6V4DR', dm: 'D07H4Q7Q9UY',  email: 'kennedy@licodes.net',     name: 'Kennedy(李品軒)' },
};

/**
 * 取得指定人員的 Slack DM channel IDs
 * @param {...string} names  e.g. 'Eric', 'Willy'
 * @returns {string[]}
 */
function dms(...names) {
  return names.map(n => {
    if (!PEOPLE[n]) throw new Error('Unknown person: ' + n);
    return PEOPLE[n].dm;
  });
}

/**
 * 取得指定人員的 Email 清單
 * @param {...string} names
 * @returns {string[]}
 */
function emails(...names) {
  return names.map(n => {
    if (!PEOPLE[n]) throw new Error('Unknown person: ' + n);
    return PEOPLE[n].email;
  });
}

module.exports = { PEOPLE, dms, emails };
