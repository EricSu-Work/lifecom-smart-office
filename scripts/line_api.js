/**
 * line_api.js — LINE API 共用模組
 * 
 * 功能：
 * - getGroupMemberProfile: 取得群組成員 displayName
 * - 自動讀取 openclaw.json 的 channelAccessToken
 * - 內建快取避免重複呼叫
 */

const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(process.env.USERPROFILE || process.env.HOME, '.openclaw', 'openclaw.json');

let _token = null;
function getToken() {
  if (_token) return _token;
  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    _token = config.channels?.line?.channelAccessToken;
    if (!_token) throw new Error('LINE channelAccessToken not found in config');
    return _token;
  } catch (e) {
    throw new Error(`Failed to read LINE token: ${e.message}`);
  }
}

// 快取：{ "groupId:userId": { name, fetchedAt } }
const profileCache = new Map();
const CACHE_TTL = 24 * 3600 * 1000; // 24h

/**
 * 取得群組成員 displayName
 * @param {string} groupId - LINE group ID
 * @param {string} userId - LINE user ID
 * @returns {Promise<string|null>} displayName or null
 */
async function getGroupMemberProfile(groupId, userId) {
  if (!groupId || !userId) return null;
  
  const cacheKey = `${groupId}:${userId}`;
  const cached = profileCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return cached.name;
  }

  const token = getToken();
  const url = `https://api.line.me/v2/bot/group/${groupId}/member/${userId}`;
  
  try {
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (!res.ok) {
      if (res.status === 404) return null; // 使用者不在群組
      return null;
    }
    
    const data = await res.json();
    const name = data.displayName || null;
    
    if (name) {
      profileCache.set(cacheKey, { name, fetchedAt: Date.now() });
    }
    
    return name;
  } catch (e) {
    return null;
  }
}

/**
 * 取得群組摘要（名稱、圖片、成員數）
 * @param {string} groupId - LINE group ID
 * @returns {Promise<{groupName: string, pictureUrl: string, memberCount: number}|null>}
 */
async function getGroupSummary(groupId) {
  if (!groupId) return null;
  // LINE API requires uppercase 'C' prefix for group IDs
  const realId = groupId.startsWith('c') && !groupId.startsWith('C') ? 'C' + groupId.substring(1) : groupId;
  const token = getToken();
  const url = `https://api.line.me/v2/bot/group/${realId}/summary`;
  
  try {
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) return null;
    const data = await res.json();
    return {
      groupId: data.groupId,
      groupName: data.groupName || null,
      pictureUrl: data.pictureUrl || null,
      memberCount: data.memberCount || null,
    };
  } catch (e) {
    return null;
  }
}

module.exports = { getGroupMemberProfile, getGroupSummary, getToken };
