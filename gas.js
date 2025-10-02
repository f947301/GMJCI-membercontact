// ====================================================================
// Google Apps Script (GAS) Code.gs - 最終手動 JSONP 穩定版
// 徹底避免 setCallback 方法，手動構造 JSONP 字串。
// ====================================================================

// --------------------------------------------------------------------
// 處理 GET 請求 (JSONP 核心)
// --------------------------------------------------------------------
function doGet(e) {
  let result;
  const params = e.parameter; 
  const callbackName = params.callback; 
  
  if (!callbackName) {
      // 如果沒有 callback 參數，則回傳純 JSON 錯誤
      return ContentService.createTextOutput(JSON.stringify({success: false, msg: "Error: Callback parameter required."}))
             .setMimeType(ContentService.MimeType.JSON);
  }
  
  try {
    const action = params.action;

    if (action === "login") {
      const phone = params.phone;
      const birthday = params.birthday;
      
      result = checkMemberLogin(phone, birthday);
      if (result.success) {
        result.token = generateToken(result.name);
        delete result.name; 
      }
    } else if (action === "getList") {
      const token = params.token;
      const tokenCheck = validateToken(token);

      if (tokenCheck.success) {
        result = getMemberList(); 
      } else {
        result = { success: false, msg: tokenCheck.msg || "未授權訪問" };
      }
    } else {
      result = { success:false, msg:"未知請求" };
    }
  } catch(err) {
    result = { success:false, msg:"伺服器處理請求異常: " + err.message };
  }

  // 🔹 最終修正：手動構造 JSONP 字串，完全避免 setCallback
  const jsonString = JSON.stringify(result);
  const jsonpOutputString = `${callbackName}(${jsonString})`; // 格式：handleLoginResponse({...})
  
  // 🔹 我們只呼叫 createTextOutput 和 setMimeType
  let output = ContentService.createTextOutput(jsonpOutputString);
  output = output.setMimeType(ContentService.MimeType.JSONP); // 這裡不再連鎖呼叫

  return output; 
}

// --------------------------------------------------------------------
// (以下 doPost 及輔助函式保持不變，略過以維持排版清晰)
// --------------------------------------------------------------------
// 處理 POST 請求 (API 核心)
function doPost(e) {
    // 由於採用 JSONP/GET 模式，doPost 應被忽略或回傳錯誤訊息
    let output = ContentService.createTextOutput(JSON.stringify({success: false, msg: "請使用 GET 請求 (JSONP 模式)。"}));
    return output.setMimeType(ContentService.MimeType.JSON);
}

// 輔助函式... (checkMemberLogin, generateToken, validateToken, getMemberList) ...
// 為了簡潔，這裡省略了輔助函式。請確保您專案中保留了這些函式的完整定義。
// --------------------------------------------------------------------
// 輔助函式與核心業務邏輯 (保持不變)
// --------------------------------------------------------------------

function generateToken(memberName) {
  const timestamp = new Date().getTime();
  const rawString = `${memberName}:${timestamp}:${Math.random()}`;
  return Utilities.base64Encode(rawString);
}

function validateToken(token) {
  if (!token) return { success: false, msg: "Token 缺失，請重新登入" };
  try {
    const decoded = Utilities.base64Decode(token, Utilities.Charset.UTF_8);
    if (decoded.length > 0) return { success: true };
  } catch (e) {
    return { success: false, msg: "Token 無效，請重新登入" };
  }
  return { success: true };
}

function checkMemberLogin(phone, birthday) {
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
  const fields = ["姓名","服務單位","行動電話-帳","通訊地址","E-mail","LINE"];
  const idxs = fields.map(f=>header.indexOf(f));
  
  const members = [];
  const phoneIdx = header.indexOf("行動電話-帳");
  const pwdIdx = header.indexOf("生日-密"); 

  for(let i=1;i<data.length;i++){
    const phoneVal = (data[i][phoneIdx]||"").toString().trim();
    const pwdVal = (data[i][pwdIdx]||"").toString().trim();
    
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