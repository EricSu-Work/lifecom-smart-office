---
name: lifecom-tms
description: "TMS嚗ldmcvs嚗瘚恣?頂蝯???頞??疏???瘚?蝔?蝐文??啜?撣?遙雿?TMS / MCVS / oldmcvs / ?拇????賊????舀?敹???
---

# TMS嚗ldmcvs嚗??拇?蝞∠?蝟餌絞?亥?摨?
> **oldmcvs = TMS**嚗ifeCOM ?詨??拇?蝞∠?蝟餌絞嚗?????鞎剁?7-11/?典振/?撖?OKMart嚗???暺?/?啁姘/摰乩噶/?萄?嚗瘚?蝔?蝐文??啁???> Repo: `systemLifecom/oldmcvs`嚗itbucket嚗 ?祆?: `C:\Users\Eric\dev\oldmcvs`
> ??LifeERPv2嚗lackDog嚗? `TMSApi*.php` ?游???
---

## 1. 蝟餌絞蝮質汗

| ? | ??|
|------|-----|
| **甇???迂** | TMS嚗誨??oldmcvs嚗?|
| **?銵ㄖ** | ?? PHP嚗獢嚗? MySQL |
| **PHP 瑼???* | 2,614 |
| **蝮賣?獢** | 4,764 |
| **鞈?摨?* | MySQL嚗mcvs` 鞈?摨恬? |
| **?函蔡** | Windows IIS嚗D:\web\wwwadm\ecstore\`嚗?|
| **??** | Windows Task Scheduler ??`scheduler/pjob/` |
| **SMS** | 銝姘蝪∟?嚗mexpress.mitake.com.tw嚗?|
| **Email** | SMTP via Gmail嚗ervice@lifecom.com.tw嚗?|

---

## 2. 蝟餌絞?嗆?

```mermaid
graph TB
    subgraph "TMS嚗ldmcvs嚗?
        subgraph "adm/ 蝞∠?蝡?
            A1[ship/ ?箄疏蝞∠?]
            A2[Orders/ 閮蝞∠?]
            A3[Deliver/ ?恣?
            A4[InOut/ ?脣鞎沘
            A5[Product/ ??蝞∠?]
            A6[Accounting/ 撣喳?]
            A7[cars/ 頠?蝞∠?]
            A8[manage/ ??蝞∠?]
            A9[invoice/ ?潛巨]
            A10[Query/ ?亥岷]
        end
        subgraph "ec/ 摰Ｘ蝡?
            E1[service/ 憭API]
            E2[webservice/ MCVS?啣?]
            E3[mcvs/ 頞??詨?璈]
            E4[Orders/ 閮?交]
            E5[Deliver/ ?蕭頩也
            E6[Dist/ ?蝞∠?]
            E7[InOut/ ?脣鞎沘
            E8[Accept/ 撽]
            E9[dcap/ 璅惜?PDF]
            E10[api/ ?折API]
        end
        subgraph "scheduler/ ??撘?"
            S1[pjob/ ??隞餃? 100+]
            S2[include/ ?拇??芋蝯
            S3[reyi2/ ?亦?API]
            S4[bdoor/ 敺?隞餃?]
        end
    end

    subgraph "憭蝟餌絞"
        EXT1[LifeERPv2<br/>BlackDog OMS]
        EXT2[MCVS 頞??詨??啣?]
        EXT3[?拇???API/FTP]
    end

    EXT1 -->|TMSApi| E1
    E2 --> EXT2
    S1 --> EXT3
```

### 銝之璅∠?

| 璅∠? | 頝臬? | ?券?|
|------|------|------|
| **adm/** | 蝞∠?蝡?| ?折??嚗鞎具??柴??董???蟡剁? |
| **ec/** | 摰Ｘ蝡?| 憭 API嚗MS 銝脫嚗CVS ?啣????蕭頩?|
| **scheduler/** | ??撘? | ?拇???FTP/API ??嚗?00+ ??隞餃?嚗?|

---

## 3. ?拇????
### 頞??拇?嚗VS嚗?
```mermaid
graph TB
    subgraph "7-ELEVEN嚗絞銝頞? PCSC嚗?
        P1[PCSC_ACC ?亙蝣箄?]
        P2[PCSC_EDR ?鞎沘
        P3[PCSC_EIN ?亙澈]
        P4[PCSC_ERT ?鞎函Ⅱ隤
        P5[PCSC_ETA ?啣?]
        P6[PCSC_EVR 撽]
        P7[PCSC_OL 銝?]
        P8[PCSC_PPS ?鞎沘
        P9[PCSC_SIN ?箏澈]
        P10[PCSC_SRP ?鞎函隢
        P11[PCSC_STD ??]
    end
    subgraph "?典振嚗amilyMart via ?亦? REYI嚗?
        R1[REYI_R00 ?箄疏?]
        R2[REYI_R04 ?啣??]
        R3[REYI_R08 ?辣?]
        R4[REYI_R25 ?鞎函隢
        R5[REYI_R28 ?鞎典摨
        R6[REYI_R96 ?暹???
        R7[REYI_IR1 ?璅惜]
        R8[REYI_I00 ?箄疏]
        R9[REYI_CTC 摨摨
        R10[REYI_C2B 瘨祥?鞎沘
    end
    subgraph "?撖?HiLife嚗?
        H1[HiLife_B2C B2C撖辣]
        H2[HiLife_LTL 憭抒隞跑
        H3[HiLife_C2B C2B?隞跑
        H4[HiLife_R00 ?箄疏]
        H5[HiLife_R01 ?辣]
    end
    subgraph "OKMart"
        O1[OK_B2C_F17 撖辣]
        O2[OK_B2C_F44 ?啣?]
        O3[OK_B2C_F63 ?辣]
        O4[OK_B2C_F67 ?暹?]
        O5[OK_B2C_F71 ??
        O6[OK_F01 ?箄疏]
        O7[OK_F60 頧VS]
    end
```

### CVS ?梢?蝔Ⅳ

| 瘚?蝣?| 隤芣? | 撠? |
|--------|------|------|
| F01 | ?箄疏? | EC?VS |
| F03 | 撖辣蝣箄? | CVS?C |
| F04 | ?啣?撽 | CVS?C |
| F05 | ?啣?? | CVS?C |
| F07 | ?辣蝣箄? | CVS?C |
| F09 | ??澈 | CVS?C |
| F10 | ?拇????甇?| ?? |
| F17 | OK撖辣 | EC?K |
| F20 | 蝯?撣喳? | EC?VS |
| F21 | 蝯?蝣箄? | CVS?C |
| F25 | ?鞎券 | CVS?C |
| F44 | OK?啣? | OK?C |
| F60 | DC頧VS | ?折 |
| F63-F72 | ???拇?鈭辣 | 閬瘚? |

### 摰??拇?

```mermaid
graph LR
    subgraph "摰??拇???
        CAT[暺? TCat<br/>CAT.php / CATv2.php / CATMed.php]
        HCT[?啁姘鞎券?<br/>HCT.php / HCT2.php]
        PEL[摰乩噶 Pelican<br/>PELICAN.php / PELICAN2.php / PELICAN_TXT.php]
        POST[?萄?<br/>POST_ADD.php / POST_ADD_84.php]
        KTJ[憭扳旨 KerryTJ<br/>ktj.php / ktjapi.php]
        ACS[ACS<br/>ACS_XML.php]
        SF[??<br/>sf.php / SSL.php]
        FSD[FSD<br/>FSD.php]
        GMJ[Goodmaji 憟賡收??br/>Goodmaji.php]
    end

    subgraph "??隞餃?"
        J1[CAT_SOD 暺???]
        J2[CAT_EOD 暺?蝯董]
        J3[HCT_TXT ?啁姘銝]
        J4[HCT_update ?啁姘??
        J5[PELICAN_STS 摰乩噶??
        J6[PELICAN_TXT 摰乩噶銝]
        J7[getPOST ?萄???]
        J8[KTJ_upload 憭扳旨銝]
        J9[KTJ_update 憭扳旨??
        J10[Orders_toACS ACS?箄疏]
        J11[Orders_toGoodmaji 憟賡收?
    end

    CAT --> J1 & J2
    HCT --> J3 & J4
    PEL --> J5 & J6
    POST --> J7
    KTJ --> J8 & J9
    ACS --> J10
    GMJ --> J11
```

---

## 4. ??蝟餌絞嚗cheduler/嚗?
### ?嗆?

```mermaid
flowchart TD
    WT[Windows Task Scheduler] -->|摰?閫貊| PJ[pjob/pjob.php]
    PJ -->|敺?scheduler 銵典?隞餃?| DB[(mcvs DB<br/>scheduler 銵?]
    DB -->|status=N, runtime<=NOW| PJ
    PJ -->|?瑁?| JOBS[100+ ??隞餃?]
    
    subgraph "隞餃???"
        CVS[CVS 頞?<br/>F01~F72, PCSC, REYI, HiLife, OK]
        HOME[摰?<br/>CAT, HCT, PELICAN, POST, KTJ]
        STS[???甇?br/>DistShipStatus, Update_From*]
        ACC[撣喳?<br/>Acc_load_sync, F20_F21]
        SMS[蝪∟?<br/>SMS_PRC, SMS_do]
        OTHER[?嗡?<br/>overdue_order, alert_mail, Seq500Data]
    end
    
    JOBS --> CVS & HOME & STS & ACC & SMS & OTHER
```

### ??璈

- **scheduler 銵?*嚗遙????甈? `seq, docid, status, runtime, param, startdatetime`
- **Status**嚗N`=敺銵X`=?瑁?銝准Y`=摰??E`=?航炊
- **Token Lock**嚗???賣?銝??`X` ????脖蒂銵?
- **?亥?頝臬?**嚗D:\service_log\pJob_YYYYMMDD.txt`

### 銝餉???隞餃?皜

| 憿 | 隞餃? | ?賊? |
|------|------|------|
| **PCSC 7-11** | PCSC_PROC_ACC/EDR/EIN/ERT/ETA/EVR/OL/PPS/SIN/SRP/STD (x2?? | 22 |
| **REYI ?典振** | REYI_PROC_R00/R04/R08/R25/R27/R28/R29/R89/R96/R99/RS4/RS9/I00/i92/IR1/CTC_*/C2B_* | 25 |
| **HiLife ?撖?* | HiLife_B2C_PROC_*/HiLife_LTL_PROC_*/HiLife_C2B_*/HiLife_PROC_* | 18 |
| **OK OKMart** | OK_B2C_PROC_*/OK_PROC_* | 10 |
| **CVS ?梢?* | F01~F10/F17/F26/F44/F72 DC/CVS | 15 |
| **CAT 暺?** | CAT_SOD/CAT_EOD/CAT_EODv2/CAT_MedEOD/CAT_STS_OL/getCAT | 6 |
| **HCT ?啁姘** | HCT_TXT/HCT_TXT2/HCT_update/HCT_multi_package | 4 |
| **PELICAN 摰乩噶** | PELICAN_STS/STS0/STS309/STS_OL/TXT | 6 |
| **KTJ 憭扳旨** | KTJ_upload/KTJ_update | 2 |
| **POST ?萄?** | getPOST | 1 |
| **ACS** | Orders_toACS/Update_FromACS | 2 |
| **Goodmaji** | Orders_toGoodmaji | 1 |
| **SMS 蝪∟?** | SMS_PRC/PRC1/PRC2/do/msg/Insert_one | 6 |
| **撣喳?** | Acc_load_sync/F20_F21 | 2 |
| **DC ?** | F01_DC/F03_DC/P01_DC/F01_DCAP/f03_dc2cvs | 5 |
| **?嗡?** | overdue_order/alert_mail/Seq500Data/SSL_F04/DistShipStatus | 5+ |

---

## 5. 憭 API ??嚗c/service/嚗?
### ??LifeERPv2 ????
| 蝡舫? | ? |
|------|------|
| `httporder2.php` | **銝餉?閮 API**嚗dd/Chk/Update/Cancel嚗?|
| `httporderquery.php` | 閮?亥岷嚗????拇?嚗?|
| `backorder.php` | ?鞎刻???|
| `backorder_f12.php` | F12 ?鞎?|
| `backorder_ibon.php` | ibon ?鞎?|
| `receive.php` | ?嗉疏蝣箄? |
| `SetStore.php` | ?撣身摰?|
| `findorder.php` | ?亥岷閮 |
| `findstore.php` | ?亥岷?撣?|
| `printlabel.php` | ?璅惜 |
| `csgetproduct_update.php` | CS ???郊 |
| `csreturn_update.php` | CS ?鞎典?甇?|
| `sftracking_update.php` | SF ?拇?餈質馱 |
| `add3plorder.php` | 銝?拇?閮 |
| `t_3plpdf.php` | 銝?拇? PDF |

### ?寞??游?

| 蝡舫? | ? |
|------|------|
| `httporder_batch_avon.php` / `_v2` | Avon ?寞活閮 |
| `httporder_batch_sfl.php` | SFL ?寞活閮 |
| `orderstatus_batch_avon.php` / `_v2` | Avon ?寞活???|
| `orderstatus_batch_zw.php` | 撅?寞活???|
| `storeinfo_batch_avon.php` / `_v2` | Avon ?撣?閮?|
| `fmgetproduct_update.php` | FM ???湔 |
| `fmintostore_update.php` | FM ?亙澈?湔 |

---

## 6. MCVS 頞??詨??啣?

```mermaid
sequenceDiagram
    participant User as 瘨祥??    participant Shop as ?餃?撟喳
    participant TMS as TMS
    participant MCVS as MCVS ?啣???

    User->>Shop: ?豢?頞??疏
    Shop->>TMS: ?澆 cvsemapbridge.php
    TMS->>MCVS: 撠? MCVS ?啣??詨?
    MCVS->>User: 憿舐內?啣??詨?
    User->>MCVS: ?豢??撣?    MCVS->>TMS: callback嚗?撣誨蝣潦?蝔晞?嚗?    TMS->>Shop: ??撣?閮?```

**?瑼?嚗?*
- `ec/webservice/cvsemap.php` ??MCVS ?啣??亙嚗??嚗?- `ec/mcvs/cvsemapbridge.php` ??璈撅歹?頧?詨?隢?嚗?- `ec/mcvs/mcvsemap.php` ???詨??啣???- `ec/mcvs/receive.php` / `receive2.php` ??callback ?交

---

## 7. 璅惜?嚗cap/嚗?
| PDF 憿?| ?拇???| 隤芣? |
|--------|--------|------|
| `CatPackPDF1d.php` | 暺? | 暺??ㄨ璅惜 |
| `HctPackPDF1d.php` | ?啁姘 | ?啁姘?ㄨ璅惜 |
| `BirdPackPDF1d.php` | 摰乩噶 | 摰乩噶璅惜 |
| `PCSCPackPDF1d.php` | 7-11 | 7-11 璅惜 |
| `HilifeLTLPackPDF1d.php` | ?撖?LTL | 憭抒隞嗆?蝐?|
| `HilifeB2CPackPDF1d.php` | ?撖?B2C | 銝?祆?蝐?|
| `StorePackPDF1d.php` | ?撣?| ?撣???蝐?|
| `StorePackDPF14/15/16.php` | ?撣?| ????|
| `StoreToStorePDF1d.php` | 摨摨?| 摨摨?蝐?|
| `3plorderPDF1d.php` | 銝?拇? | 銝?拇?璅惜 |
| `PackLabel2.php` | ? | ??ㄨ璅惜 |

雿輻 `fpdf.php` ?? PDF ?Ｙ?嚗? dompdf/Laravel嚗?
---

## 8. 蝞∠?蝡舀芋蝯?adm/嚗?
| 璅∠? | ? |
|------|------|
| **ship/** | ?箄疏蝞∠?嚗hipping/ShipOutRp/ReShipPDF/Return/SelectStore嚗?|
| **Orders/** | 閮?交嚗ploadOrder/NewReceive/setStore嚗?|
| **Deliver/** | ?蕭頩歹?DeliverSuccess/DeliverFailed/RePost嚗?|
| **InOut/** | ?脣鞎剁?InOut/Distribute/StationCollect/Delivery/ISPacket嚗?|
| **Product/** | ??蝞∠?嚗dd/Edit/Delete/Select/Manage嚗?|
| **Accounting/** | 撣喳?蝯?嚗?蝞銵剁? |
| **Acc/** | 撣喳??脤?嚗ontractCustAcc/LogisticsPay/StationAward嚗?|
| **cars/** | 頠?蝞∠?嚗?頛??豢?/頞活/?潛巨/璇Ⅳ嚗?|
| **manage/** | ??蝞∠?嚗撣??祥/CRM/蝪∟?/?撣暹?嚗?|
| **invoice/** | ?潛巨蝞∠?嚗撓???/隞餃?嚗?|
| **Query/** | ?亥岷?梯” |
| **User/** | ?冽蝞∠? |
| **Role/** | 閫甈? |
| **Accept/** | 撽嚗鞎典?瑼ｇ? |
| **TrailShip/** | 閰血鞎?|
| **Utility/** | 撌亙 |
| **getgoods/** | ?疏 |

---

## 9. 摰Ｘ蝡舐畾芋蝯?ec/嚗?
| 璅∠? | ? |
|------|------|
| **Dist/** | ?蝞∠?嚗eliveryOK/DeliveryErr/ReDelivery/TransPost嚗?|
| **Accept/** | 撽嚗ccept/MQuality/WQuality/ReAcceptItem嚗?|
| **edi/** | EDI ?餃?鞈?鈭斗?嚗20/f21 撣喳?嚗?|
| **Accounting/** | 撣喳? |
| **dcap_1/** | 璅惜??遢??|
| **cbrte/** | 蝣唾楝?梧??航撌脫??剁? |

---

## 10. 頠?蝞∠?嚗ars/嚗?
| 瑼? | ? |
|------|------|
| `cars_add.php` | ?啣?頠? |
| `cars_edit.php` | 蝺刻摩頠? |
| `cars_list.php` | 頠??” |
| `cars_view.php` | 頠?閰單? |
| `cars_barcode.php` | 頠?璇Ⅳ |
| `cars_cycle_list.php` | 頞活?” |
| `cars_print.php` / `cars_print_pdf.php` | 頠??梯”? |
| `chauffeur_add/edit/list/view/data.php` | ?豢?蝞∠? |
| `invoice_list.php` | 頠??潛巨 |

---

## 11. ??LifeERPv2 ??靽?
```mermaid
graph LR
    subgraph "LifeERPv2嚗lackDog嚗?
        BD1[TMSApi.php]
        BD2[TMSApiBizWms.php]
        BD3[TMSApiSFL.php]
        BD4[TMSApiClient.php]
        BD5[TMSCustomerClient.php]
    end

    subgraph "TMS嚗ldmcvs嚗?
        TMS1[ec/service/httporder2.php<br/>閮API]
        TMS2[ec/service/httporderquery.php<br/>?亥岷API]
        TMS3[ec/service/backorder.php<br/>?鞎杗PI]
        TMS4[ec/webservice/cvsemap.php<br/>?撣摨
        TMS5[scheduler/pjob/*<br/>?拇???]
    end

    subgraph "?拇???
        L1[7-11 PCSC FTP]
        L2[?典振 REYI API]
        L3[?撖?HiLife API]
        L4[OKMart OK API]
        L5[暺? TCat API]
        L6[?啁姘 HCT FTP]
        L7[摰乩噶 Pelican FTP]
        L8[?萄? POST API]
    end

    BD1 & BD2 & BD3 --> TMS1 & TMS2 & TMS3
    BD4 --> TMS4
    TMS5 --> L1 & L2 & L3 & L4 & L5 & L6 & L7 & L8
```

**?游??孵?嚗?*
- BlackDog ??`TMSApi*.php` ?? HTTP POST ?澆 TMS ??`ec/service/httporder2.php`
- 閮??嚗dd嚗遣?殷??hk嚗炎?伐??pdate嚗?堆??ancel嚗?瘨?
- TMS 鞎痊?拇???API/FTP ??嚗lackDog 鞎痊 OMS 璆剖??摩

---

## 12. 撌脩?寞?
| ? | 隤芣? |
|------|------|
| **?⊥???* | ?? PHP嚗 Laravel/Symfony |
| **Windows ?函蔡** | IIS + Windows Task Scheduler |
| **FTP ?箔蜓** | 憭頞??拇?韏?FTP 瑼?鈭斗? |
| **Big5/UTF-8 瘛瑕?** | ??big5_func 頧Ⅳ璅∠? |
| **FPDF** | PDF ?Ｙ??典???fpdf.php |
| **phpseclib** | SFTP ??phpseclib 1.0.18 |
| **NuSOAP** | SOAP ??nusoap.php |
| **蝖祉楊蝣潸楝敺?* | `D:\web\wwwadm\ecstore\`?D:\service_log\` |
| **憭??砍?隞?* | 憭折? `_20YYMMDD.php` ?遢瑼?|

---

## 13. 鞈?摨恬?mcvs嚗?
銝餉? Table嚗?蝔?蝣潭撠?嚗?
| Table | ?券?|
|-------|------|
| `scheduler` | ??隞餃?雿? |
| `orders` | 閮銝餉” |
| `order_detail` | 閮?敦 |
| `ship_data` | ?箄疏鞈? |
| `cvs_store` | 頞??撣?|
| `cars` | 頠? |
| `chauffeur` | ?豢? |
| `invoice` | ?潛巨 |
| `sms_queue` | 蝪∟?雿? |
| `acc_*` | 撣喳??賊? |

---

## 14. FTP ?唾撓嚗瘚?瑼?鈭斗?嚗?
| ?拇???| ?唾撓?孵? | 璅∠? |
|--------|----------|------|
| 7-11 PCSC | FTP | `ftp.php` / `ftp_cvs.php` |
| ?典振 REYI | SFTP + API | `sshftp.php` / `sslftp.php` + `reyi2/` |
| ?撖?HiLife | API | ?湔 HTTP |
| OKMart | API | ?湔 HTTP |
| 暺? | API | `CAT.php` / `CATv2.php` |
| ?啁姘 | FTP嚗XT 瑼?嚗?| `HCT.php` + `ftp.php` |
| 摰乩噶 | FTP嚗XT 瑼?嚗?| `PELICAN.php` + `ftp.php` |
| ?萄? | API | `POST_ADD.php` |
| 憭扳旨 | API | `ktjapi.php` |
| ACS | XML 瑼? | `ACS_XML.php` |
| ?? | SSL | `SSL.php` / `sf.php` |

---

## Notion ???

敺遣蝡??舐 upload ?單銝嚗?
