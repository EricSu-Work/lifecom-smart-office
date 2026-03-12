/**
 * create_ailogora_notion.js
 * 將 AILogora「Openclaw 龍蝦養殖大全」整理為 Notion 頁面
 * 父頁面：LifeCOM Works (4bc121cd-b560-4fb9-acc8-08a9887c42ad)
 */
const https = require('https');
const fs = require('fs');
const path = require('path');

const TOKEN = fs.readFileSync(path.join(process.env.USERPROFILE, '.config/notion/api_key'), 'utf8').trim();
const PARENT_PAGE_ID = '4bc121cd-b560-4fb9-acc8-08a9887c42ad';

function notionRequest(method, endpoint, body) {
  return new Promise((resolve, reject) => {
    const bodyStr = JSON.stringify(body);
    const opts = {
      hostname: 'api.notion.com',
      path: `/v1/${endpoint}`,
      method,
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr, 'utf8'),
      },
    };
    const req = https.request(opts, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

function p(text) {
  return { object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: text } }] } };
}
function h1(text) {
  return { object: 'block', type: 'heading_1', heading_1: { rich_text: [{ type: 'text', text: { content: text } }] } };
}
function h2(text) {
  return { object: 'block', type: 'heading_2', heading_2: { rich_text: [{ type: 'text', text: { content: text } }] } };
}
function h3(text) {
  return { object: 'block', type: 'heading_3', heading_3: { rich_text: [{ type: 'text', text: { content: text } }] } };
}
function bullet(text) {
  return { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ type: 'text', text: { content: text } }] } };
}
function divider() {
  return { object: 'block', type: 'divider', divider: {} };
}
function callout(text, emoji) {
  return { object: 'block', type: 'callout', callout: { rich_text: [{ type: 'text', text: { content: text } }], icon: { type: 'emoji', emoji } } };
}
function quote(text) {
  return { object: 'block', type: 'quote', quote: { rich_text: [{ type: 'text', text: { content: text } }] } };
}
function code(text) {
  return { object: 'block', type: 'code', code: { rich_text: [{ type: 'text', text: { content: text } }], language: 'plain text' } };
}

async function main() {
  // Step 1: 建立主頁面
  const page = await notionRequest('POST', 'pages', {
    parent: { type: 'page_id', page_id: PARENT_PAGE_ID },
    properties: {
      title: { title: [{ type: 'text', text: { content: 'Openclaw 龍蝦養殖大全 — 社群知識整理' } }] },
    },
    icon: { type: 'emoji', emoji: '🦞' },
  });
  const pageId = page.id;
  console.log('Page created:', pageId);

  // Step 2: 加入內容
  const blocks = [
    callout('來源：AILogora 社群收藏牆「Openclaw 龍蝦養殖大全」\nhttps://ailogora.com/library/collection/4245753b-a7f1-43c7-8408-6e65f5770f60\n整理日期：2026-03-05 | 收錄 16 篇（14 觀點卡 + 2 討論卡）', '📚'),
    divider(),

    // ===== 一、入門與核心心態 =====
    h1('一、入門與核心心態'),

    h2('📌 OpenClaw 不是聊天室，是 persistent system'),
    p('（by Agent狂魔，2026/3/2，4 讚）'),
    p('把 OpenClaw 當成一個要認真建置的系統，不是裝完就試玩。設定好之後效果差很多，但前提是你要願意花時間設定前幾步。'),
    bullet('SOUL.md 和 MEMORY.md 不要偷懶，認真寫人設、工作脈絡，開頭的廢話就消失了'),
    bullet('memory/YYYY-MM-DD.md 每日自動摘要，第二天直接抓上下文，省很多「你還記得我上次說的」'),
    bullet('先只接一個通道，把主要 workflow 跑順再加第二個（同時開多個通道只會讓每個都做到一半）'),
    bullet('requireMention 早點開，不開會在群組白燒很多 token'),
    bullet('不要急著做「有趣的功能」，基本安全設定先做好'),
    bullet('先把一個 workflow 做到「不用管它也會動」，再動下一個'),
    p('原始出處：https://www.reddit.com/r/openclaw/comments/1rf0vz6/'),

    h2('📌 入門筆記：不想踩坑就先搞懂這些'),
    p('（by 張家慶，2026/2/7，3 讚）'),
    bullet('OpenClaw 可以做到收信、排程、網路爬蟲，但不是裝好就能用'),
    bullet('模型選擇比你想的重要，一開始就要思考'),
    bullet('SOUL.md、AGENTS.md、MEMORY.md 是核心設定檔，要先搞清楚'),

    divider(),

    // ===== 二、進階設定 =====
    h1('二、進階設定技巧'),

    h2('🔒 Security（很多人沒認真做）'),
    p('（by Jesse，2026/3/4，2 讚）'),
    bullet('API key 不要放 openclaw.json，要放 .env 然後加密'),
    bullet('AGENTS.md 加 anti-loop rule（重要）：'),
    code('If a task fails twice with the same error, STOP and report the error. Do not retry.\nNever make more than 5 consecutive tool calls for a single request without checking in with me.\nIf a command times out, report it. Do not re-run it silently.'),

    h2('🤖 模型分層（省錢關鍵）'),
    bullet('規劃和設定 → Opus（高複雜度）'),
    bullet('Heartbeat 和例行任務 → Gemini Flash（大概 $1-2/月）'),
    bullet('Email 類 → Sonnet 或 Kimi'),
    bullet('按工作性質選模型，不要一套到底'),
    callout('高頻低複雜度任務根本不需要砸重量級模型', '💡'),

    h2('📋 Task Management 串法'),
    bullet('用 DartAI 當任務板'),
    bullet('Heartbeat 定期 check「in progress 超過 30 分鐘沒動」的任務然後 ping'),
    bullet('自動追蹤 stuck 任務比等 agent 自己報告靠譜（agent 通常不知道自己卡住了）'),

    h2('🔍 搜尋工具替換'),
    bullet('Tavily 取代 Brave Search（1000 次/月免費）'),
    bullet('Nylas 串多帳號 email 和日曆'),
    p('原始出處：https://www.reddit.com/r/openclaw/comments/1riiglv/'),

    divider(),

    // ===== 三、LINE 串接踩坑 =====
    h1('三、LINE 串接踩坑（必讀）'),
    p('（by Chi，2026/2/24，7 讚）'),

    h2('🐛 坑一：多帳號 Webhook 路由壞掉，訊息全跑去 Main Agent'),
    p('設定兩個 LINE Bot，webhook 路徑拆開，但不管傳給哪個 Bot，session 都建在 :main 上。'),
    p('根因：LINE API 的 accountId 沒被帶進 agent route 解析，永遠 fallback 到預設 main agent。'),
    bullet('解法：重新 install gateway 後修復'),

    h2('🐛 坑二：LINE 的 Model 會偷偷跳回 Main 預設 Model'),
    p('WebChat 用的是設定的模型，但從 LINE 進來的對話卻跳回 Main 預設模型（Opus），導致帳單暴增。'),
    bullet('定期檢查 .openclaw/agents/<agent>/sessions/sessions.json 裡的 model 欄位'),
    bullet('改用支援 tool use 的模型（如 GPT-5-mini）後問題消失'),

    h2('🐛 坑三：mentionPatterns 在群組裡完全沒作用'),
    p('設了 requireMention 和 mentionPatterns，但群組裡不管誰講什麼都回。'),
    p('根因：LINE 沒有被註冊到 channel 的 DOCKS 物件，且 inbound message flow 直接跳過 mention 檢查。'),
    bullet('Issue：https://github.com/openclaw/openclaw/issues/16975'),
    bullet('解法：改用 groupPolicy: "mention"（config 設定層面）'),

    h2('🐛 坑四：LINE Provider 無限重啟'),
    p('log 一直跳：starting LINE provider → auto-restart attempt 1/10 → webhook path already registered'),
    p('根因：LINE 是 webhook 模式，設好 HTTP route 後函式就 return（約 4ms），gateway 以為 provider 掛掉觸發重啟。'),
    bullet('快速解法：在 config 設定 channels.channelHealthCheckMinutes=0'),
    bullet('PR 修復：https://github.com/openclaw/openclaw/pull/23621（已修，待 merge）'),
    bullet('另一原因：重複安裝 LINE plugin 造成衝突，清掉重複的 extension'),

    h2('💡 LINE 安全補充（社群討論）'),
    bullet('OpenClaw 有驗 x-line-signature：HMAC-SHA256(body, channelSecret) + timingSafeEqual'),
    bullet('LINE Developers Console 的 Verify（空 events[]）會特例放行，不處理實際訊息'),
    bullet('Reply token 是一次性的，用完即失效，不能存起來慢慢用'),

    divider(),

    // ===== 四、Context Caching =====
    h1('四、Context Caching 省錢技巧'),
    p('（by allen2，2026/3/4）'),
    p('OpenAI 現在有 server-side context caching，每次對話不需要重送全部 context，token 用量大幅下降。'),
    bullet('記得更新 OpenClaw 版本以啟用 caching 功能'),
    bullet('用量異常下降不一定是壞事，可能是 caching 生效'),

    divider(),

    // ===== 五、Use Cases =====
    h1('五、真實應用案例'),

    h2('🤖 Agent 自動找工作（巴西工程師案例）'),
    p('（by Agent狂魔，2026/2/25）'),
    p('給 agent 任務「幫我找薪水更好的工作」，3 天後 agent 幫他申請了超過 100 份工作：搜職缺、客製化 CV（.md 轉 PDF）、自動填表申請。'),
    p('費用：$40 美元。見：awesome-openclaw-usecases（GitHub repo，35 個社群貢獻的真實 use case）'),

    h2('🔄 Agent 取代 SaaS 工作流'),
    p('（by MingTech，2026/2/27）'),
    bullet('Email 自動分類 + 每天三次摘要'),
    bullet('影片拍完 Gemini 自動寫 caption 再排程 IG'),
    bullet('通話結束後自動生成提案直接送 PandaDoc'),
    callout('這才是 Agent 取代 SaaS 的真正方式：不是替換 SaaS，而是串起所有 SaaS 的邏輯層', '💡'),

    divider(),

    // ===== 六、Skills 生態系 =====
    h1('六、Skills 生態系'),

    h2('📦 awesome-moltbot-skills'),
    p('（by Chi，2026/1/28，4 讚）'),
    p('GitHub repo 收錄社群貢獻的 skills，可把 AI 能力拆成一個個可被裝、可被替換的模組。'),

    h2('🗺️ skill-openclaw-map'),
    p('（by Chi，2026/3/4，4 讚）'),
    p('用 Antigravity / Claude code / Cursor 等 coding agent 來維護或精進你的龍蝦（OpenClaw）。'),
    p('見：https://github.com/wsxqaza12/skill-openclaw-map'),

    h2('🧠 agent-brain skill（記憶抽拔化）'),
    p('（by Tai，留言於「用了兩週 OpenClaw」）'),
    p('把 memory 抽離成獨立持久層（使用 pcloud），讓 agent 的靈魂/記憶可以跨平台共享。'),
    bullet('在 Antigravity 改東西，server 裡的龍蝦也能同步知道'),
    bullet('未來換 AI 平台，記憶可低成本遷移'),
    p('見：https://github.com/Tai-ch0802/skills-bundle/blob/main/agent-brain/SKILL.md'),

    divider(),

    // ===== 七、模型選擇 =====
    h1('七、模型選擇實測'),
    p('（by ChiaYoa，2026/2/17）'),
    bullet('Claude Sonnet 4.5 效果最好但最貴'),
    bullet('OpenRouter 上有便宜替代方案'),
    bullet('根據任務複雜度分層選模型是正確方向'),

    divider(),

    // ===== 八、社群背景 =====
    h1('八、社群背景與生態'),

    h2('🦞 OpenClaw 起源'),
    p('（by Tham Yik Foong，2026/1/27，4 讚）'),
    p('從 20k → 40k GitHub Stars 一天內漲到，開發者是奧地利的半辦退休工程師，據說開發全靠 vibe-coding。'),

    h2('🤖 Moltbook 實驗'),
    p('（by 陳朝美，2026/2/10）'),
    p('給 bot 用的社群平台，AI agents 在上面發文、討論、按讚，人類在旁邊看。170 萬個 agents 註冊，發文 90% 是灌水，現在已關閉。'),
    p('結論：AI agents 之間互動沒什麼意義，agent 的價值在於協助人類，不在互相交流。'),

    divider(),

    // ===== 九、對 LifeCOM 的啟示 =====
    h1('九、對 LifeCOM 現有設定的啟示'),
    callout('以下為整理後對照我們現有 OpenClaw 設定的 action items', '🎯'),
    bullet('✅ SOUL.md、MEMORY.md、AGENTS.md 已設定完整'),
    bullet('✅ memory/YYYY-MM-DD.md 每日記錄機制已建立'),
    bullet('✅ LINE groupPolicy 已改為 mention（解決坑三）'),
    bullet('✅ channelHealthCheckMinutes 問題：考慮設定 = 0 防止無限重啟'),
    bullet('⚠️ 模型分層：目前全用 claude-sonnet-4-6，heartbeat 可考慮改用 Gemini Flash 省錢'),
    bullet('⚠️ Anti-loop rule：尚未加入 AGENTS.md（安全性強化）'),
    bullet('⚠️ Sessions.json model 欄位：定期確認 LINE session 模型沒有跳掉'),
    bullet('💡 Task management：可考慮用 DartAI 或類似工具追蹤 stuck 任務'),
    bullet('💡 Tavily 搜尋：1000 次/月免費，可評估取代 Brave Search'),
  ];

  // Notion blocks 上限 100，分批送
  const CHUNK = 99;
  for (let i = 0; i < blocks.length; i += CHUNK) {
    const chunk = blocks.slice(i, i + CHUNK);
    const res = await notionRequest('PATCH', `blocks/${pageId}/children`, { children: chunk });
    if (res.object === 'error') {
      console.error('Error adding blocks:', JSON.stringify(res));
    } else {
      console.log(`Blocks added: ${i + chunk.length}/${blocks.length}`);
    }
  }

  console.log(`\n✅ Done! Notion page: https://notion.so/${pageId.replace(/-/g, '')}`);
}

main().catch(console.error);
