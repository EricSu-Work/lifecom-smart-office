/**
 * upload_tms_kb_to_notion.js
 * 將 LifeTMS 產品知識庫上傳到 Notion
 */
const https = require('https');
const fs = require('fs');
const path = require('path');

const TOKENS = {
  personal: fs.readFileSync(path.join(process.env.USERPROFILE, '.config/notion/api_key'), 'utf8').trim(),
};

const AI_OPS_PAGE_ID = '319d2a91-c732-81da-b683-f199f150cf3c';

function request(token, method, apiPath, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : undefined;
    const headers = { 'Authorization': 'Bearer ' + token, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' };
    if (data) headers['Content-Length'] = Buffer.byteLength(data, 'utf8');
    const req = https.request({ hostname: 'api.notion.com', path: apiPath, method, headers }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { const p = JSON.parse(d); if (p.object === 'error') { console.error(`API Error: ${p.status} - ${p.message}`); reject(new Error(p.message)); } else resolve(p); } catch(e) { reject(e); } });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function h1(t) { return { object:'block', type:'heading_1', heading_1:{rich_text:[{type:'text',text:{content:t}}]} }; }
function h2(t) { return { object:'block', type:'heading_2', heading_2:{rich_text:[{type:'text',text:{content:t}}]} }; }
function h3(t) { return { object:'block', type:'heading_3', heading_3:{rich_text:[{type:'text',text:{content:t}}]} }; }
function p(t) { if(!t||!t.trim()) return {object:'block',type:'paragraph',paragraph:{rich_text:[]}}; const c=[]; for(let i=0;i<t.length;i+=2000) c.push({type:'text',text:{content:t.slice(i,i+2000)}}); return {object:'block',type:'paragraph',paragraph:{rich_text:c}}; }
function code(t,l='mermaid') { const c=[]; for(let i=0;i<t.length;i+=2000) c.push({type:'text',text:{content:t.slice(i,i+2000)}}); return {object:'block',type:'code',code:{rich_text:c,language:l}}; }
function div() { return {object:'block',type:'divider',divider:{}}; }
function co(t,e='📋') { return {object:'block',type:'callout',callout:{rich_text:[{type:'text',text:{content:t}}],icon:{type:'emoji',emoji:e}}}; }
function li(t) { return {object:'block',type:'bulleted_list_item',bulleted_list_item:{rich_text:[{type:'text',text:{content:t}}]}}; }
function tr(cells) { return {type:'table_row',table_row:{cells:cells.map(c=>[{type:'text',text:{content:String(c||'')}}])}}; }
function tbl(headers,rows) { return {object:'block',type:'table',table:{table_width:headers.length,has_column_header:true,has_row_header:false,children:[tr(headers),...rows.map(r=>tr(r))]}}; }

async function createPage(parentId, title, icon, children, token) {
  const body = { parent:{page_id:parentId}, icon:icon?{type:'emoji',emoji:icon}:undefined, properties:{title:{title:[{text:{content:title}}]}}, children:children.slice(0,100) };
  const page = await request(token,'POST','/v1/pages',body);
  console.log(`✅ "${title}" → ${page.url}`);
  for(let i=100;i<children.length;i+=100) { await request(token,'PATCH',`/v1/blocks/${page.id}/children`,{children:children.slice(i,i+100)}); }
  return page;
}
const sleep = ms => new Promise(r=>setTimeout(r,ms));

async function main() {
  const token = TOKENS.personal;
  console.log('🚀 上傳 LifeTMS 知識庫...\n');

  // Main page
  const main = await createPage(AI_OPS_PAGE_ID, 'LifeTMS 物流管理系統（oldmcvs）', '🚚', [
    co('LifeTMS = oldmcvs，LifeCOM 核心物流管理系統。處理超商取貨、宅配、物流排程、標籤列印。與 LifeERPv2（BlackDog）透過 LifeTMSApi 整合。', '🗺️'),
    p(''),
    h2('基本資訊'),
    tbl(['項目','值'],[
      ['正式名稱','LifeTMS（代號 oldmcvs）'],
      ['技術棧','原生 PHP（無框架）+ MySQL'],
      ['PHP 檔案數','2,614'],
      ['總檔案數','4,764'],
      ['資料庫','MySQL mcvs'],
      ['部署','Windows IIS + Task Scheduler'],
      ['Repo','Bitbucket systemLifecom/oldmcvs'],
    ]),
    p(''),
    h2('三大模組'),
    tbl(['模組','路徑','用途'],[
      ['管理端','adm/','出貨、訂單、配送、帳務、車隊、發票'],
      ['客戶端','ec/','外部API（OMS串接）、MCVS地圖、配送追蹤'],
      ['排程引擎','scheduler/','物流商FTP/API排程（100+任務）'],
    ]),
    p(''),
    h2('與 LifeERPv2 的關係'),
    code(`graph LR
    subgraph "LifeERPv2 BlackDog"
        BD1[LifeTMSApi.php]
        BD2[LifeTMSApiBizWms.php]
        BD3[LifeTMSApiSFL.php]
    end
    subgraph "LifeTMS oldmcvs"
        TMS1[ec/service/httporder2.php]
        TMS2[ec/service/httporderquery.php]
        TMS3[scheduler/pjob/* 100+排程]
    end
    subgraph "物流商"
        L1[7-11 PCSC]
        L2[全家 REYI]
        L3[萊爾富 HiLife]
        L4[OKMart]
        L5[黑貓/新竹/宅急便/郵局...]
    end
    BD1 & BD2 & BD3 -->|HTTP POST| TMS1 & TMS2
    TMS3 -->|FTP/API| L1 & L2 & L3 & L4 & L5`),
  ], token);
  await sleep(500);

  // 2. 超商物流
  await createPage(main.id, '超商物流整合（CVS）', '🏪', [
    h2('超商物流全景圖'),
    code(`graph TB
    subgraph "7-ELEVEN PCSC"
        P1[ACC 接單] --> P2[EIN 入庫] --> P3[SIN 出庫]
        P3 --> P4[OL 上線] --> P5[PPS 揀貨]
        P5 --> P6[STD 送達] --> P7[ETA 到店]
        P7 --> P8[SRP 退貨申請] --> P9[EDR 退貨]
        P9 --> P10[ERT 退貨確認] --> P11[EVR 驗收]
    end
    subgraph "全家 FamilyMart via REYI"
        R1[R00 出貨] --> R2[R04 到店] --> R3[R08 取件]
        R1 --> R4[R25 退貨申請] --> R5[R28 退貨到店]
        R5 --> R6[R96 逾時退回]
        R7[I00 出貨] --> R8[IR1 列印標籤]
        R9[CTC 店到店]
        R10[C2B 消費者退貨]
    end
    subgraph "萊爾富 HiLife"
        H1[B2C 寄件] --> H2[R00 出貨] --> H3[R01 取件]
        H4[LTL 大物件]
        H5[C2B 退件]
    end
    subgraph "OKMart"
        O1[F17 寄件] --> O2[F44 到店] --> O3[F63 取件]
        O3 --> O4[F67 逾時] --> O5[F71 退回]
    end`),
    p(''),
    h2('CVS 共通流程碼'),
    tbl(['流程碼','說明','方向'],[
      ['F01','出貨通知','EC→CVS'],
      ['F03','寄件確認','CVS→EC'],
      ['F04','到店驗收','CVS→EC'],
      ['F05','到店通知','CVS→EC'],
      ['F07','取件確認','CVS→EC'],
      ['F09','退回倉庫','CVS→EC'],
      ['F10','物流狀態同步','雙向'],
      ['F17','OK寄件','EC→OK'],
      ['F20','結算帳務','EC→CVS'],
      ['F21','結算確認','CVS→EC'],
      ['F25','退貨通知','CVS→EC'],
      ['F44','OK到店','OK→EC'],
      ['F60','DC轉CVS','內部'],
      ['F63~F72','各類物流事件','視物流商'],
    ]),
    p(''),
    h2('排程任務數量'),
    tbl(['物流商','排程數','主要任務'],[
      ['7-11 PCSC','22','PCSC_PROC_ACC/EDR/EIN/ERT/ETA/EVR/OL/PPS/SIN/SRP/STD (x2版)'],
      ['全家 REYI','25','REYI_PROC_R00~RS9 + IR1/I00/i92/CTC/C2B'],
      ['萊爾富 HiLife','18','HiLife_B2C/LTL/C2B + R00/R01'],
      ['OKMart','10','OK_B2C_PROC_F17~F84 + F01/F60'],
      ['CVS 共通','15','F01~F10/F17/F26/F44/F72'],
    ]),
  ], token);
  await sleep(500);

  // 3. 宅配物流
  await createPage(main.id, '宅配物流整合', '📦', [
    h2('宅配物流商'),
    code(`graph LR
    subgraph "宅配排程"
        J1[CAT_SOD/EOD 黑貓取號結帳]
        J2[HCT_TXT/update 新竹上傳狀態]
        J3[PELICAN_STS/TXT 宅急便狀態上傳]
        J4[getPOST 郵局取號]
        J5[KTJ_upload/update 大榮]
        J6[Orders_toACS ACS]
        J7[Orders_toGoodmaji 好馬吉]
        J8[FSD_TXT FSD]
    end
    subgraph "物流商模組 scheduler/include/"
        M1[CAT.php / CATv2.php / CATMed.php]
        M2[HCT.php / HCT2.php]
        M3[PELICAN.php / PELICAN2.php]
        M4[POST_ADD.php]
        M5[ktj.php / ktjapi.php]
        M6[ACS_XML.php]
        M7[Goodmaji.php]
        M8[FSD.php]
        M9[sf.php / SSL.php]
    end`),
    p(''),
    h2('傳輸方式'),
    tbl(['物流商','傳輸','模組'],[
      ['7-11 PCSC','FTP','ftp.php / ftp_cvs.php'],
      ['全家 REYI','SFTP + API','sshftp.php + reyi2/'],
      ['萊爾富 HiLife','API','直接 HTTP'],
      ['OKMart','API','直接 HTTP'],
      ['黑貓 TCat','API','CAT.php / CATv2.php'],
      ['新竹 HCT','FTP（TXT）','HCT.php + ftp.php'],
      ['宅急便 Pelican','FTP（TXT）','PELICAN.php + ftp.php'],
      ['郵局 POST','API','POST_ADD.php'],
      ['大榮 KTJ','API','ktjapi.php'],
      ['ACS','XML 檔案','ACS_XML.php'],
      ['順豐 SF','SSL','SSL.php / sf.php'],
    ]),
  ], token);
  await sleep(500);

  // 4. 排程系統
  await createPage(main.id, '排程系統', '⏰', [
    h2('排程架構'),
    code(`flowchart TD
    WT[Windows Task Scheduler] -->|定時| PJ[pjob/pjob.php]
    PJ -->|查詢 status=N| DB[(mcvs.scheduler 表)]
    DB -->|runtime<=NOW| PJ
    PJ -->|Token Lock| EXEC[執行任務]
    EXEC --> CVS[CVS 超商 75個]
    EXEC --> HOME[宅配 20個]
    EXEC --> STS[狀態同步]
    EXEC --> ACC[帳務結算]
    EXEC --> SMS[簡訊發送 6個]
    EXEC --> OTHER[逾期/告警/序號]`),
    p(''),
    h2('排程機制'),
    li('scheduler 表：seq, docid, status, runtime, param, startdatetime'),
    li('Status：N=待執行、X=執行中、Y=完成、E=錯誤'),
    li('Token Lock：同時只允許一個 X（防並行衝突）'),
    li('日誌：D:\\service_log\\pJob_YYYYMMDD.txt'),
    p(''),
    h2('排程任務總覽'),
    tbl(['類別','數量','說明'],[
      ['PCSC 7-11','22','接單/入庫/出庫/送達/退貨 (x2版)'],
      ['REYI 全家','25','出貨/到店/取件/退貨/店到店/C2B'],
      ['HiLife 萊爾富','18','B2C/LTL/C2B'],
      ['OK OKMart','10','寄件/到店/取件/逾時/退回'],
      ['CVS 共通','15','F01~F72 DC/CVS'],
      ['CAT 黑貓','6','SOD/EOD/MedEOD/STS_OL/getCAT'],
      ['HCT 新竹','4','TXT/TXT2/update/multi_package'],
      ['PELICAN 宅急便','6','STS*/TXT'],
      ['KTJ 大榮','2','upload/update'],
      ['POST 郵局','1','getPOST'],
      ['ACS/GMJ','3','toACS/Update_FromACS/toGoodmaji'],
      ['SMS 簡訊','6','PRC/do/msg/Insert_one'],
      ['帳務','2','Acc_load_sync/F20_F21'],
      ['DC 配發','5','F01_DC/F03_DC/P01_DC/DCAP'],
      ['其他','5+','overdue/alert/Seq500/SSL/DistShipStatus'],
      ['**合計**','**~130**',''],
    ]),
  ], token);
  await sleep(500);

  // 5. 外部API + MCVS
  await createPage(main.id, '外部API & MCVS 超商選店', '🔌', [
    h2('外部 API 服務（ec/service/）'),
    co('這是 LifeERPv2（BlackDog）呼叫 LifeTMS 的主要入口。','🔗'),
    tbl(['端點','功能'],[
      ['httporder2.php','主要訂單 API（Add/Chk/Update/Cancel）'],
      ['httporderquery.php','訂單查詢（狀態/物流）'],
      ['backorder.php','退貨訂單'],
      ['receive.php','收貨確認'],
      ['SetStore.php','門市設定'],
      ['findorder.php','查詢訂單'],
      ['findstore.php','查詢門市'],
      ['printlabel.php','列印標籤'],
      ['csgetproduct_update.php','CS 商品同步'],
      ['csreturn_update.php','CS 退貨同步'],
      ['sftracking_update.php','SF 物流追蹤'],
      ['add3plorder.php','三方物流訂單'],
      ['httporder_batch_sfl.php','SFL 批次訂單'],
      ['httporder_batch_avon.php','Avon 批次訂單'],
    ]),
    p(''),
    div(),
    h2('MCVS 超商選店地圖'),
    code(`sequenceDiagram
    participant User as 消費者
    participant Shop as 電商平台
    participant TMS as LifeTMS
    participant MCVS as MCVS 地圖
    User->>Shop: 選擇超商取貨
    Shop->>TMS: cvsemapbridge.php
    TMS->>MCVS: 導向選店地圖
    MCVS->>User: 顯示地圖
    User->>MCVS: 選擇門市
    MCVS->>TMS: callback（門市代碼/名稱/地址）
    TMS->>Shop: 回傳門市資訊`),
    p(''),
    li('ec/webservice/cvsemap.php — MCVS 地圖入口（多版本）'),
    li('ec/mcvs/cvsemapbridge.php — 橋接層'),
    li('ec/mcvs/mcvsemap.php — 選店地圖頁'),
    li('ec/mcvs/receive.php — callback 接收'),
  ], token);
  await sleep(500);

  // 6. 管理端 + 標籤 + 車隊
  await createPage(main.id, '管理端 & 標籤列印 & 車隊', '🏢', [
    h2('管理端模組（adm/）'),
    tbl(['模組','功能'],[
      ['ship/','出貨管理（Shipping/ShipOutRp/ReShipPDF/Return）'],
      ['Orders/','訂單接收（UploadOrder/NewReceive/setStore）'],
      ['Deliver/','配送追蹤（DeliverSuccess/Failed/RePost）'],
      ['InOut/','進出貨（InOut/Distribute/StationCollect/Delivery）'],
      ['Product/','商品管理（Add/Edit/Delete/Select）'],
      ['Accounting/','帳務結算'],
      ['Acc/','帳務進階（ContractCustAcc/LogisticsPay）'],
      ['cars/','車隊管理（車輛/司機/趟次/發票）'],
      ['manage/','營運管理（異常/運費/CRM/簡訊/門市逾期）'],
      ['invoice/','發票管理'],
      ['Accept/','驗收（到貨品檢）'],
      ['Query/','查詢報表'],
      ['User/ & Role/','用戶 & 角色權限'],
    ]),
    p(''),
    div(),
    h2('標籤列印（dcap/）'),
    co('使用 fpdf.php 原生 PDF 產生（非 dompdf）','🏷️'),
    tbl(['PDF 類','物流商'],[
      ['CatPackPDF1d.php','黑貓'],
      ['HctPackPDF1d.php','新竹'],
      ['BirdPackPDF1d.php','宅急便'],
      ['PCSCPackPDF1d.php','7-11'],
      ['HilifeB2CPackPDF1d.php','萊爾富 B2C'],
      ['HilifeLTLPackPDF1d.php','萊爾富 大物件'],
      ['StorePackPDF1d.php','門市配送'],
      ['StoreToStorePDF1d.php','店到店'],
      ['3plorderPDF1d.php','三方物流'],
    ]),
    p(''),
    div(),
    h2('車隊管理（cars/）'),
    li('cars_add/edit/list/view.php — 車輛 CRUD'),
    li('chauffeur_add/edit/list/view/data.php — 司機管理'),
    li('cars_cycle_list.php — 趟次列表'),
    li('cars_barcode.php — 車輛條碼'),
    li('cars_print_pdf.php — 車隊報表'),
    li('invoice_list.php — 車隊發票'),
  ], token);

  console.log(`\n🎉 完成！主頁面：${main.url}`);
}

main().catch(e => { console.error('❌',e.message||e); process.exit(1); });
