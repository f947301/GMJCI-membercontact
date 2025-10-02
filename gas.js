// ====================================================================
// Google Apps Script (GAS) Code.gs - 最終 Fetch API/JSONP 穩定版
// 支援 login, getList, getDetail 三種動作
// ====================================================================

// --------------------------------------------------------------------
// 核心處理邏輯：處理 GET 請求
// --------------------------------------------------------------------
function doGet(e) {
  let result;
  const params = e.parameter; 
  const callbackName = params.callback; // 用來判斷是否為 JSONP 請求
  
  try {
    const action = params.action;

    if (action === "login") {
      const phone = params.phone;
      const birthday = params.birthday;
      
      // 執行登入邏輯
      result = checkMemberLogin(phone, birthday);
      if (result.success) {
        // 成功後產生 Token
        result.token = generateToken(result.name);
        delete result.name; 
      }
    } else if (action === "getList") {
      const token = params.token;
      const tokenCheck = validateToken(token);

      if (tokenCheck.success) {
        // 如果 Token 有效，執行獲取列表邏輯
        result = getMemberList(); 
      } else {
        // Token 無效，回傳未授權
        result = { success: false, msg: tokenCheck.msg || "未授權訪問" };
      }
    } else if (action === "getDetail") { // 🎯 新增的詳情查詢動作
      const phone = params.phone; // 從前端 URL 傳入的電話號碼
      const token = params.token;
      const tokenCheck = validateToken(token); // 檢查 Token

      if (tokenCheck.success) {
        // 執行獲取單一會員詳情的邏輯
        result = getMemberDetail(phone); 
      } else {
        // Token 無效，回傳未授權
        result = { success: false, msg: tokenCheck.msg || "未授權訪問" };
      }
    } else {
      result = { success:false, msg:"未知請求或 action 參數遺失" };
    }
  } catch(err) {
    // 捕獲任何伺服器端錯誤
    result = { success:false, msg:"伺服器處理請求異常: " + err.message };
  }

  // --------------------------------------------------------------------
  // 輸出判斷：處理 JSONP 或 純 JSON 輸出
  // --------------------------------------------------------------------
  if (callbackName) {
      // JSONP 模式 
      const jsonString = JSON.stringify(result);
      const jsonpOutputString = `${callbackName}(${jsonString})`;
      
      let output = ContentService.createTextOutput(jsonpOutputString);
      return output.setMimeType(ContentService.MimeType.JSONP); 

  } else {
      // 純 JSON 模式 (Fetch API 使用，最穩定)
      let output = ContentService.createTextOutput(JSON.stringify(result));
      return output.setMimeType(ContentService.MimeType.JSON);
  }
}

// --------------------------------------------------------------------
// 處理 POST 請求 (API 核心，僅保留)
// --------------------------------------------------------------------
function doPost(e) {
    let output = ContentService.createTextOutput(JSON.stringify({success: false, msg: "請使用 GET 請求 (Fetch API 模式)。"}));
    return output.setMimeType(ContentService.MimeType.JSON);
}


// ====================================================================
// 輔助函式：業務邏輯
// ====================================================================

function generateToken(memberName) {
  const timestamp = new Date().getTime();
  const rawString = `${memberName}:${timestamp}:${Math.random()}`;
  return Utilities.base64Encode(rawString);
}

// 替換您 Code.gs 中現有的 validateToken 函式
function validateToken(token) {
    if (!token) return { success: false, msg: "Token 缺失，請重新登入" };

    // 🎯 關鍵修正：確保 Token 格式符合 URL 安全標準，以便 Base64 正確解碼
    // 1. 替換 Base64 URL Safe 變體: - 變為 +, _ 變為 /
    // 2. 移除所有空格 (有時 URL 傳遞會產生空格)
    // 3. 處理填充字元 = (Base64 解碼通常需要正確的填充)
    const safeToken = token.replace(/-/g, '+').replace(/_/g, '/').replace(/\s/g, '');
    
    // 處理 Base64 填充
    while (safeToken.length % 4 !== 0) {
        safeToken += '=';
    }

    try {
        // 嘗試解碼
        const decodedBytes = Utilities.base64Decode(safeToken, Utilities.Charset.UTF_8);
        const decoded = Utilities.newBlob(decodedBytes).getDataAsString(); // 更穩定的字串轉換
        
        const parts = decoded.split(':');
        
        if (parts.length !== 3) { 
             // 如果解碼成功，但結構不符，也視為錯誤
             throw new Error("格式錯誤");
        }
        
        const timestamp = parseInt(parts[1], 10);
        // 檢查 Token 是否過期 (30 天)
        if (Date.now() - timestamp > 30 * 24 * 60 * 60 * 1000) {
            return { success: false, msg: "Token 已過期，請重新登入" };
        }
        
        return { success: true, user: parts[0] };
    } catch(e) {
        // 捕獲所有解碼失敗、格式錯誤或時間戳解析錯誤
        // Logger.log("Token 驗證失敗: " + e.message + " - 原始Token: " + token); // 您可以在測試時啟用這行
        return { success: false, msg: "無效的 Token" };
    }
}


function checkMemberLogin(phone, birthday) {
    // ⚠️ 請在這裡實現您的 Google Sheets 登入檢查邏輯
    // 由於您沒有提供完整的 G-Sheets 程式碼，這裡使用模擬資料，請替換成您的實際邏輯
    
    // 假設您已經定義了 G-Sheets 邏輯，並回傳以下結構:
    // return { success:true, msg:"登入成功", name: memberName };
    // return { success:false, msg: "帳號或密碼錯誤" };
    
    // 以下是您的實際 G-Sheets 程式碼，我將其納入：
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const memberSheet = ss.getSheetByName("會員資料");
    const paymentSheet = ss.getSheetByName("繳費紀錄");
    if (!memberSheet || !paymentSheet) return { success:false, msg: "找不到工作表" };

    const memberData = memberSheet.getDataRange().getValues();
    if (memberData.length < 2) return { success:false, msg: "會員表無資料" };
    const header = memberData[0];

    const phoneIdx = header.indexOf("行動電話-帳");
    const pwdIdx = header.indexOf("生日-密");
    const nameIdx = header.indexOf("姓名");
    if (phoneIdx === -1 || pwdIdx === -1 || nameIdx === -1) {
        return { success:false, msg: "欄位名稱找不到" };
    }

    let member = null;
    for (let i=1;i<memberData.length;i++){
        const phoneVal = (memberData[i][phoneIdx]||"").toString().trim();
        const pwdVal = (memberData[i][pwdIdx]||"").toString().trim();
        if (!phoneVal || pwdVal === "000000") continue;
        if (phoneVal === phone && pwdVal === birthday) { member = memberData[i]; break; }
    }
    if (!member) return { success:false, msg: "帳號或密碼錯誤" };

    const memberName = member[nameIdx];
    const paymentData = paymentSheet.getDataRange().getValues();
    const payHeader = paymentData[0];
    let payRow = null;
    for (let i=1;i<paymentData.length;i++){
        if ((paymentData[i][0]||"") === memberName) { payRow = paymentData[i]; break; }
    }
    if (!payRow) return { success:false, msg: "找不到繳費紀錄" };

    const yearNow = new Date().getFullYear();
    const yearPrev = yearNow - 1;
    let ok = false;
    for (let j=1;j<payRow.length;j++){
        const yearHdr = parseInt(payHeader[j]);
        const v = payRow[j];
        if ((yearHdr===yearNow||yearHdr===yearPrev) && v && String(v).trim()!=="") { ok = true; break; }
    }
    if(!ok) return { success:false, msg: "未繳納當前年度或前一年度會費，無法登入" };

    return { success:true, msg:"登入成功", name: memberName };
}

function getMemberList() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const memberSheet = ss.getSheetByName("會員資料");
    if (!memberSheet) return { success: false, msg: "找不到會員資料工作表" };

    const data = memberSheet.getDataRange().getValues();
    if (data.length<2) return { success: false, list: [] };
    
    const header = data[0];
    // 請確保這裡包含 "歿" 欄位，以便 list.html 進行檢查
    const fields = ["姓名","服務單位","行動電話-帳","通訊地址","E-mail","LINE", "歿"]; 
    const idxs = fields.map(f=>header.indexOf(f));
    
    const members = [];
    const phoneIdx = header.indexOf("行動電話-帳");
    const pwdIdx = header.indexOf("生日-密"); 

    for(let i=1;i<data.length;i++){
        const phoneVal = (data[i][phoneIdx]||"").toString().trim();
        const pwdVal = (data[i][pwdIdx]||"").toString().trim();
        
        // 排除沒有電話或密碼是 000000 的成員
        if(!phoneVal || pwdVal==="000000") continue; 

        const item = {};
        fields.forEach((f,k)=>{ 
            const id = idxs[k]; 
            let value = id > -1 ? (data[i][id]||"") : "";
            item[f] = value;
        });
        members.push(item);
    }
    
    return { success: true, list: members };
}


// --------------------------------------------------------------------
// 🎯 新增輔助函式：獲取單一會員詳情 (personal.html 使用)
// --------------------------------------------------------------------
// 替換您 Code.gs 中現有的 getMemberDetail 函式 (最簡化，適用外部圖床)
function getMemberDetail(phone) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const memberSheet = ss.getSheetByName("會員資料");
    if (!memberSheet) return { success: false, msg: "找不到會員資料工作表" };

    const data = memberSheet.getDataRange().getValues();
    if (data.length < 2) return { success: false, msg: "會員表無資料" };
    
    const header = data[0];
    const phoneIdx = header.indexOf("行動電話-帳");
    
    if (phoneIdx === -1) return { success: false, msg: "找不到行動電話欄位" };

    let memberData = null;
    for (let i = 1; i < data.length; i++) {
        const phoneVal = (data[i][phoneIdx] || "").toString().trim();
        if (phoneVal === phone) {
            memberData = data[i];
            break;
        }
    }
    if (!memberData) return { success: false, msg: "找不到該會員資料" };

    const fieldsToReturn = [
        "姓名", "生日", "生日-密", "服務單位", "行動電話-帳", "住家電話", 
        "通訊地址", "E-mail", "LINE", "經歷", "歿", "照片連結" // 這裡我們只回傳原始連結
    ];
    
    const detail = {};
    fieldsToReturn.forEach(field => {
        const idx = header.indexOf(field);
        detail[field] = idx > -1 ? (memberData[idx] || "") : "";
    });

    // 🚀 核心修正：直接使用原始連結，並重命名為前端所需的鍵值
    detail["照片URL"] = detail["照片連結"] || ""; 
    delete detail["照片連結"];

    return { success: true, detail: detail };
}