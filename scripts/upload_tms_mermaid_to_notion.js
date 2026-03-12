/**
 * upload_tms_mermaid_to_notion.js
 * LifeTMS Mermaid 架構圖集上傳到 Notion
 */
const https = require('https');
const fs = require('fs');
const path = require('path');

const TOKEN = fs.readFileSync(path.join(process.env.USERPROFILE, '.config/notion/api_key'), 'utf8').trim();
const TMS_MAIN_PAGE = '31fd2a91-c732-8145-a6a5-c3866c93fd6b';

function request(method, apiPath, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : undefined;
    const headers = { 'Authorization': 'Bearer ' + TOKEN, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' };
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

function h2(t) { return { object:'block', type:'heading_2', heading_2:{rich_text:[{type:'text',text:{content:t}}]} }; }
function h3(t) { return { object:'block', type:'heading_3', heading_3:{rich_text:[{type:'text',text:{content:t}}]} }; }
function p(t) { if(!t||!t.trim()) return {object:'block',type:'paragraph',paragraph:{rich_text:[]}}; const c=[]; for(let i=0;i<t.length;i+=2000) c.push({type:'text',text:{content:t.slice(i,i+2000)}}); return {object:'block',type:'paragraph',paragraph:{rich_text:c}}; }
function code(t,l='mermaid') { const c=[]; for(let i=0;i<t.length;i+=2000) c.push({type:'text',text:{content:t.slice(i,i+2000)}}); return {object:'block',type:'code',code:{rich_text:c,language:l}}; }
function div() { return {object:'block',type:'divider',divider:{}}; }
function co(t,e='📋') { return {object:'block',type:'callout',callout:{rich_text:[{type:'text',text:{content:t}}],icon:{type:'emoji',emoji:e}}}; }
function li(t) { return {object:'block',type:'bulleted_list_item',bulleted_list_item:{rich_text:[{type:'text',text:{content:t}}]}}; }

async function createPage(parentId, title, icon, children) {
  const body = { parent:{page_id:parentId}, icon:icon?{type:'emoji',emoji:icon}:undefined, properties:{title:{title:[{text:{content:title}}]}}, children:children.slice(0,100) };
  const page = await request('POST','/v1/pages',body);
  console.log(`✅ "${title}" → ${page.url}`);
  for(let i=100;i<children.length;i+=100) { await request('PATCH',`/v1/blocks/${page.id}/children`,{children:children.slice(i,i+100)}); }
  return page;
}
const sleep = ms => new Promise(r=>setTimeout(r,ms));

async function main() {
  console.log('🚀 上傳 LifeTMS Mermaid 架構圖集...\n');

  // Parent page
  const mermaidMain = await createPage(TMS_MAIN_PAGE, '架構圖集（Mermaid）', '📊', [
    co('LifeTMS（oldmcvs）系統架構 Mermaid 圖集。共 10 張圖涵蓋系統分層、物流流程、排程、超商整合。','📊'),
    p('以下每個子頁面包含一個主題的 Mermaid 圖表。'),
  ]);
  await sleep(500);

  // 1. 系統分層架構
  await createPage(mermaidMain.id, '1. 系統分層架構圖', '🏗️', [
    h2('LifeTMS 三層架構'),
    p('oldmcvs 分為管理端（adm）、客戶端（ec）、排程引擎（scheduler）三層，各層獨立但共用 mcvs 資料庫。'),
    code(`graph TB
    subgraph "LifeTMS oldmcvs"
        subgraph "adm/ 管理端"
            A1[ship/ 出貨管理]
            A2[Orders/ 訂單管理]
            A3[Deliver/ 配送追蹤]
            A4[InOut/ 進出貨]
            A5[Product/ 商品管理]
            A6[Accounting/ 帳務結算]
            A7[cars/ 車隊管理]
            A8[manage/ 營運管理]
            A9[invoice/ 發票]
            A10[Accept/ 驗收]
        end
        subgraph "ec/ 客戶端"
            E1[service/ 外部API入口]
            E2[webservice/ MCVS地圖]
            E3[mcvs/ 超商選店橋接]
            E4[Orders/ 訂單接收]
            E5[Deliver/ 配送追蹤]
            E6[Dist/ 配發管理]
            E7[InOut/ 進出貨]
            E8[dcap/ 標籤列印PDF]
            E9[api/ 內部API]
            E10[Accept/ 驗收]
        end
        subgraph "scheduler/ 排程引擎"
            S1[pjob/ 130+排程任務]
            S2[include/ 物流商模組]
            S3[reyi2/ 日翊全家API]
            S4[bdoor/ 後門維護任務]
        end
    end
    DB[(mcvs MySQL)]
    A1 & A2 & A3 & A4 --> DB
    E1 & E4 & E5 & E6 --> DB
    S1 & S2 --> DB`),
    p(''),
    div(),
    h2('技術棧'),
    li('原生 PHP（無 Laravel/Symfony）'),
    li('MySQL mcvs 資料庫'),
    li('Windows IIS 部署'),
    li('Windows Task Scheduler 驅動排程'),
    li('fpdf.php 產生 PDF 標籤'),
    li('phpseclib 1.0.18 處理 SFTP'),
    li('NuSOAP 處理 SOAP 通訊'),
  ]);
  await sleep(400);

  // 2. 訂單 API 流程
  await createPage(mermaidMain.id, '2. 訂單 API 流程', '📋', [
    h2('LifeERPv2 → LifeTMS 訂單流程'),
    p('BlackDog 透過 LifeTMSApi*.php 呼叫 LifeTMS 的 ec/service/httporder2.php，支援 Add/Chk/Update/Cancel 四種動作。'),
    code(`sequenceDiagram
    participant BD as LifeERPv2 BlackDog
    participant API as LifeTMS ec/service/httporder2.php
    participant CHK as httporderCheck
    participant ADD as httporderAdd
    participant DB as mcvs DB

    BD->>API: HTTP POST order_action=Add
    API->>CHK: chkDataControl 資料驗證
    alt 驗證失敗
        CHK-->>API: ErrCode=1, ErrDesc
        API-->>BD: order_result=0, error_msg
    else 驗證通過
        API->>ADD: createControl 建立訂單
        ADD->>DB: INSERT orders + order_detail
        ADD-->>API: order_result=1, order_no
        API-->>BD: order_result=1, order_no
    end

    Note over BD,API: 其他動作
    BD->>API: order_action=Chk 檢查
    BD->>API: order_action=Update 更新
    BD->>API: order_action=Cancel 取消`),
    p(''),
    div(),
    h2('批次訂單 API'),
    code(`flowchart LR
    subgraph "批次客戶整合"
        AVON[Avon 雅芳] -->|httporder_batch_avon.php| API
        SFL[SFL 新竹物流] -->|httporder_batch_sfl.php| API
        ZW[展旺] -->|orderstatus_batch_zw.php| API
    end
    API[httporder2.php<br/>核心訂單 API]
    API --> DB[(mcvs DB)]`),
  ]);
  await sleep(400);

  // 3. CVS 超商物流狀態機
  await createPage(mermaidMain.id, '3. CVS 超商物流狀態機', '🏪', [
    h2('超商取貨流程狀態機'),
    p('涵蓋 7-11、全家、萊爾富、OKMart 共通的物流狀態流轉。'),
    code(`stateDiagram-v2
    [*] --> F01_出貨通知: EC發送出貨資料
    F01_出貨通知 --> F03_寄件確認: CVS確認收件
    F03_寄件確認 --> F10_物流追蹤: 物流狀態同步
    F10_物流追蹤 --> F04_到店驗收: 包裹到店
    F04_到店驗收 --> F05_到店通知: 通知消費者
    F05_到店通知 --> F07_取件確認: 消費者取件
    F07_取件確認 --> [*]: 完成

    F05_到店通知 --> F25_逾時退貨: 超過取件期限
    F25_逾時退貨 --> F09_退回倉庫: 退回

    F03_寄件確認 --> F60_DC轉CVS: DC配發轉超商
    F60_DC轉CVS --> F10_物流追蹤

    note right of F10_物流追蹤: F10 雙向同步\\n定時排程更新`),
    p(''),
    div(),
    h2('7-11 PCSC 細部狀態'),
    code(`stateDiagram-v2
    [*] --> ACC_接單確認
    ACC_接單確認 --> EIN_入庫
    EIN_入庫 --> SIN_出庫
    SIN_出庫 --> OL_上線
    OL_上線 --> PPS_揀貨
    PPS_揀貨 --> STD_送達
    STD_送達 --> ETA_到店
    ETA_到店 --> EVR_驗收: 消費者取件

    ETA_到店 --> SRP_退貨申請: 逾時
    SRP_退貨申請 --> EDR_退貨
    EDR_退貨 --> ERT_退貨確認: 退回完成`),
    p(''),
    h2('全家 REYI 細部狀態'),
    code(`stateDiagram-v2
    [*] --> I00_出貨
    I00_出貨 --> R00_出貨通知
    R00_出貨通知 --> R04_到店通知
    R04_到店通知 --> R08_取件: 消費者取件
    R08_取件 --> [*]: 完成

    R04_到店通知 --> R96_逾時退回: 超過取件期限
    R04_到店通知 --> R25_退貨申請: 消費者退貨
    R25_退貨申請 --> R28_退貨到店
    R28_退貨到店 --> R29_退貨完成

    note left of I00_出貨: IR1 列印標籤
    note right of R00_出貨通知: CTC 店到店\\nC2B 消費者退貨`),
  ]);
  await sleep(400);

  // 4. 宅配物流商整合
  await createPage(mermaidMain.id, '4. 宅配物流商整合', '📦', [
    h2('宅配物流商排程架構'),
    code(`graph TB
    subgraph "黑貓 TCat"
        CAT_SOD[CAT_SOD 取號] --> CAT_EOD[CAT_EOD 日結]
        CAT_EOD --> CAT_STS[CAT_STS_OL 狀態查詢]
        CAT_Med[CATMed.php 醫療品]
        getCAT[getCAT 取件排程]
    end
    subgraph "新竹 HCT"
        HCT_TXT[HCT_TXT 上傳出貨TXT] --> HCT_UPD[HCT_update 狀態回寫]
        HCT_MP[HCT_multi_package 多件包裹]
    end
    subgraph "宅急便 Pelican"
        PEL_TXT[PELICAN_TXT 上傳TXT]
        PEL_STS[PELICAN_STS 狀態查詢]
        PEL_309[PELICAN_STS309 到店狀態]
        PEL_OL[PELICAN_STS_OL 上線狀態]
    end
    subgraph "郵局 POST"
        POST_GET[getPOST 取號]
        POST_ADD[POST_ADD 新增出貨]
    end
    subgraph "大榮 KTJ"
        KTJ_UP[KTJ_upload 上傳] --> KTJ_UPD[KTJ_update 狀態]
    end
    subgraph "其他"
        ACS_TO[Orders_toACS] --> ACS_FROM[Update_FromACS]
        GMJ[Orders_toGoodmaji]
        FSD_TXT[FSD_TXT]
        SF[SSL/sf.php 順豐]
    end

    DB[(mcvs DB)]
    CAT_SOD & HCT_TXT & PEL_TXT & POST_GET & KTJ_UP --> DB
    CAT_STS & HCT_UPD & PEL_STS & KTJ_UPD & ACS_FROM --> DB`),
    p(''),
    div(),
    h2('FTP vs API 傳輸方式'),
    code(`graph LR
    subgraph "FTP 檔案交換"
        FTP1[7-11 PCSC<br/>ftp.php / ftp_cvs.php]
        FTP2[全家 REYI<br/>sshftp.php SFTP]
        FTP3[新竹 HCT<br/>HCT.php + ftp.php]
        FTP4[宅急便 Pelican<br/>PELICAN.php + ftp.php]
        FTP5[ACS<br/>ACS_XML.php XML檔]
    end
    subgraph "API 呼叫"
        API1[萊爾富 HiLife<br/>直接 HTTP]
        API2[OKMart<br/>直接 HTTP]
        API3[黑貓 TCat<br/>CAT.php API]
        API4[郵局 POST<br/>POST_ADD.php]
        API5[大榮 KTJ<br/>ktjapi.php]
        API6[順豐 SF<br/>SSL.php]
    end`),
  ]);
  await sleep(400);

  // 5. 排程引擎內部
  await createPage(mermaidMain.id, '5. 排程引擎架構', '⏰', [
    h2('排程引擎運作流程'),
    code(`flowchart TD
    WT[Windows Task Scheduler<br/>定時觸發] -->|每N分鐘| PJ[pjob/pjob.php<br/>排程主控程式]
    PJ -->|1. 檢查 Token| TK{isTokenFree?<br/>有無 X 狀態任務}
    TK -->|有 X 在跑| SKIP[跳過本次]
    TK -->|無 X| QUERY[2. 查詢待執行<br/>status=N AND runtime<=NOW<br/>ORDER BY runtime, seq LIMIT 1]
    QUERY -->|無任務| DONE[結束]
    QUERY -->|取得任務| LOCK[3. 鎖定任務<br/>UPDATE status=X<br/>startdatetime=NOW]
    LOCK --> EXEC[4. 執行任務<br/>根據 docid 載入對應 include]
    EXEC -->|成功| OK[5. UPDATE status=Y]
    EXEC -->|失敗| ERR[5. UPDATE status=E]
    OK & ERR --> LOG[6. 寫入日誌<br/>D:\\service_log\\pJob_YYYYMMDD.txt]`),
    p(''),
    div(),
    h2('scheduler 資料表結構'),
    code(`erDiagram
    SCHEDULER {
        int seq PK "自增序號"
        varchar docid "任務文件ID"
        char status "N待執行 X執行中 Y完成 E錯誤"
        varchar type "任務類型 NULL=一般"
        datetime runtime "預定執行時間"
        text param "任務參數 query string格式"
        datetime startdatetime "實際開始時間"
    }`),
    p(''),
    h2('排程任務分佈'),
    code(`pie title LifeTMS 排程任務分佈（~130個）
    "PCSC 7-11" : 22
    "REYI 全家" : 25
    "HiLife 萊爾富" : 18
    "OK OKMart" : 10
    "CVS 共通" : 15
    "黑貓 CAT" : 6
    "新竹 HCT" : 4
    "宅急便 Pelican" : 6
    "其他宅配" : 6
    "SMS 簡訊" : 6
    "帳務/DC" : 7
    "其他" : 5`),
  ]);
  await sleep(400);

  // 6. MCVS 超商選店
  await createPage(mermaidMain.id, '6. MCVS 超商選店地圖', '🗺️', [
    h2('MCVS 超商選店流程'),
    code(`sequenceDiagram
    participant User as 消費者
    participant Shop as 電商網站
    participant Bridge as LifeTMS<br/>cvsemapbridge.php
    participant Map as MCVS 地圖服務
    participant CB as LifeTMS<br/>receive.php callback

    User->>Shop: 結帳選擇超商取貨
    Shop->>Bridge: 開啟超商選店
    Bridge->>Map: 導向 MCVS 地圖<br/>帶入 CVS 類型參數
    Map->>User: 顯示地圖 + 門市列表
    User->>Map: 搜尋/選擇門市
    Map->>CB: POST callback<br/>門市代碼/名稱/地址/電話
    CB->>Shop: 回傳門市資訊
    Shop->>User: 顯示已選門市

    Note over Bridge,Map: 支援 7-11/全家/萊爾富/OKMart
    Note over CB: ec/mcvs/receive.php<br/>ec/mcvs/receive2.php`),
    p(''),
    div(),
    h2('選店地圖版本歷史'),
    li('ec/webservice/cvsemap.php — 現行版'),
    li('ec/webservice/cvsemap_20190130.php'),
    li('ec/webservice/cvsemap_20191220.php'),
    li('ec/webservice/cvsemap_20210201.php'),
    li('ec/webservice/cvsemap_20220707.php'),
    li('ec/webservice/cvsemap_20221103.php'),
    li('ec/webservice/cvsemap_ori_20181113.php — 最早版本'),
    p(''),
    h2('API 端選店'),
    code(`flowchart LR
    subgraph "ec/api/ 選店API"
        SS[setStore.php] --> SS711[setStore_711.php<br/>7-11專用]
        SEL[SelectStore.php<br/>門市選擇]
    end
    subgraph "ec/service/"
        SVC_SS[SetStore.php<br/>服務端設定門市]
        SVC_FS[findstore.php<br/>門市查詢]
    end`),
  ]);
  await sleep(400);

  // 7. 標籤列印
  await createPage(mermaidMain.id, '7. 標籤列印系統', '🏷️', [
    h2('標籤列印架構'),
    code(`graph TB
    subgraph "ec/dcap/ 標籤列印"
        FPDF[fpdf.php<br/>PDF 產生引擎]
        
        subgraph "超商標籤"
            PCSC_L[PCSCPackPDF1d.php<br/>7-11]
            STORE_L[StorePackPDF1d.php<br/>門市配送]
            S2S_L[StoreToStorePDF1d.php<br/>店到店]
            HILIFE_B[HilifeB2CPackPDF1d.php<br/>萊爾富B2C]
            HILIFE_L[HilifeLTLPackPDF1d.php<br/>萊爾富大物件]
        end
        subgraph "宅配標籤"
            CAT_L[CatPackPDF1d.php<br/>黑貓]
            HCT_L[HctPackPDF1d.php<br/>新竹]
            BIRD_L[BirdPackPDF1d.php<br/>宅急便]
            TPL_L[3plorderPDF1d.php<br/>三方物流]
        end
        subgraph "其他"
            PACK_L[PackLabel2.php<br/>通用標籤]
            CHG_L[changelabel_print.php<br/>換標列印]
        end
    end

    PCSC_L & STORE_L & CAT_L & HCT_L --> FPDF
    BIRD_L & HILIFE_B & HILIFE_L & TPL_L --> FPDF
    FPDF --> PDF[輸出 PDF]`),
  ]);
  await sleep(400);

  // 8. 進出貨與配發
  await createPage(mermaidMain.id, '8. 進出貨與配發流程', '🔄', [
    h2('進出貨（InOut）流程'),
    code(`flowchart TD
    subgraph "進出貨操作 ec/InOut/"
        NEW[NewInOut.php<br/>新增進出貨]
        SINGLE[InOutSingle.php<br/>單筆進出]
        MULTI[InOutMulti.php<br/>多筆進出]
        HAND[InOutHand.php<br/>手動進出]
        MANUAL[ManualInOut.php<br/>人工調整]
    end
    
    subgraph "配發 Distribute"
        DIST[Distribute.php<br/>配發作業]
        DIST_INS[DistributeInsert.php<br/>新增配發]
        DIST_LIST[DistributeList.php<br/>配發列表]
    end
    
    subgraph "出貨 Delivery"
        DEL[Delivery.php<br/>出貨作業]
        DEL_INS[DeliveryInsert.php<br/>新增出貨]
        DEL_LIST[DeliveryList.php<br/>出貨列表]
        DEL_RPT[DeliveryReport.php<br/>出貨報表]
    end
    
    subgraph "站點集貨"
        SC[StationCollect.php<br/>站點集貨]
        SC_MULTI[StationCollectMulti.php<br/>多站集貨]
        SC_RPT[StationCollectReport.php<br/>集貨報表]
    end
    
    subgraph "後續處理"
        POST_OP[InOutPost.php<br/>過帳]
        REVERSE[InOutReverse.php<br/>沖銷]
        REPOST[RePost.php<br/>重新過帳]
    end
    
    NEW & SINGLE & MULTI --> DIST
    DIST --> DEL
    DEL --> SC
    DEL --> POST_OP
    POST_OP --> REVERSE`),
    p(''),
    div(),
    h2('退貨流程'),
    code(`flowchart LR
    CANBACK[CanBackGoods.php<br/>可退貨查詢] --> CANBACK_FORM[CanBackGoodsFrom.php<br/>退貨表單]
    CANBACK_FORM --> CANBACK_RESULT[CanBackGoodsResult.php<br/>退貨結果]
    ERR_BACK[ErrBackGoods.php<br/>異常退貨] --> ERR_RESULT[ErrBackGoodsResult.php<br/>異常退貨結果]
    REGET[ReGetItem.php<br/>重新取件] --> REGET_RESULT[ReGetItemResult.php<br/>取件結果]`),
  ]);
  await sleep(400);

  // 9. SMS 簡訊系統
  await createPage(mermaidMain.id, '9. SMS 簡訊與通知', '📱', [
    h2('簡訊發送架構'),
    code(`flowchart TD
    subgraph "簡訊觸發"
        ORDER_EVT[訂單事件<br/>到店/取件/逾時]
        DELIVER_EVT[配送事件<br/>出貨/送達/失敗]
        MANAGE_EVT[管理端<br/>manage/SendMsg.php]
    end
    
    subgraph "簡訊排程 scheduler/pjob/"
        SMS_PRC[SMS_PRC.php<br/>簡訊處理主程式]
        SMS_PRC1[SMS_PRC1.php<br/>處理v1]
        SMS_PRC2[SMS_PRC2.php<br/>處理v2]
        SMS_DO[SMS_do.php<br/>執行發送]
        SMS_MSG[SMS_msg.php<br/>訊息組成]
        SMS_INS[SMS_Insert_one.php<br/>單筆插入]
    end
    
    subgraph "簡訊模組 scheduler/include/"
        SMS[SMS.php / SMS2.php / SMSa.php / SMSnew.php]
        FPMS[sms_FPMS.php / sms_FPMSa.php / sms_FPMSnew.php]
    end
    
    subgraph "三竹簡訊平台"
        MITAKE[smexpress.mitake.com.tw<br/>三竹 SmSendGet API]
    end
    
    ORDER_EVT & DELIVER_EVT --> SMS_PRC
    MANAGE_EVT --> SMS_INS
    SMS_PRC --> SMS_DO --> SMS & FPMS --> MITAKE`),
    p(''),
    h2('營運管理通知'),
    li('manage/SendMsg.php — 手動發送簡訊'),
    li('manage/SendMsgReport.php — 簡訊發送報表'),
    li('manage/SendMsgErrReport.php — 發送失敗報表'),
    li('manage/SendTextMsg.php — 純文字訊息'),
    li('scheduler/pjob/alert_mail.php — Email 告警'),
    li('scheduler/pjob/job_send_msg.php — 排程訊息'),
  ]);
  await sleep(400);

  // 10. 帳務與結算
  await createPage(mermaidMain.id, '10. 帳務結算與 EDI', '💰', [
    h2('帳務結算流程'),
    code(`flowchart TD
    subgraph "結算產生"
        F20[F20 結算帳務<br/>EC→CVS]
        F21[F21 結算確認<br/>CVS→EC]
        F20_F21[pjob/F20_F21.php<br/>結算排程]
    end
    
    subgraph "帳務管理 adm/Acc/"
        CCA[ContractCustAcc.php<br/>合約客戶帳務]
        CCA_SEL[ContractCustAccSelect.php<br/>帳務查詢]
        LP[LogisticsPay.php<br/>物流付款]
        LPA[LogisticsPayActive.php<br/>付款啟用]
        SA[StationAward.php<br/>站點獎勵]
    end
    
    subgraph "EDI 電子資料交換 ec/edi/"
        EDI_F20[f20_list.php / f20_row_list.php]
        EDI_F21[f21_list.php / f21_row_list.php]
    end
    
    subgraph "API 帳務 ec/api/"
        API_F20[accounting_f20_rows.php]
        API_F21[accounting_f21_rows.php]
        API_ODM[accounting_orderdatam.php]
    end
    
    subgraph "帳務同步"
        ACC_SYNC[pjob/Acc_load_sync.php<br/>帳務載入同步]
    end
    
    F20_F21 --> F20 & F21
    F20 --> EDI_F20
    F21 --> EDI_F21
    ACC_SYNC --> CCA`),
    p(''),
    h2('運費管理'),
    li('manage/CompanyShipfee.php — 公司運費設定'),
    li('manage/CompanyShipfeeRecord.php — 運費紀錄'),
    li('manage/CompanyShipfeeUpdate.php — 運費更新'),
    li('ship/TipReport.php — 運費報表'),
  ]);

  console.log(`\n🎉 Mermaid 圖集完成！共 10 子頁面。主頁：${mermaidMain.url}`);
}

main().catch(e => { console.error('❌',e.message||e); process.exit(1); });
