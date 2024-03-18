function doGet(request)
{
  if (request.parameter['hub.verify_token'] == 'need to add verification token') {
    return ContentService.createTextOutput(request.parameter['hub.challenge']);
  }
}



function doPost(request)

{
  SpreadsheetApp.getActiveSpreadsheet().getSheetByName('webhook_request').appendRow([JSON.stringify(request)])
  
  
  var returned_json = request.postData.getDataAsString();
  var returned_data = JSON.parse(returned_json);
  var entries = returned_data.entry;
  var leadProcessor = new LeadgenProcessor();
  for( var i = 0; i < entries.length; i++ ) {
    var entity = entries[i];
    leadProcessor.processEntity(entity)
  }
}



class Base {

  constructor() {
    this.currentSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    this.logger = this.currentSpreadsheet.getSheetByName('Logs');
    this._responseSheetGroups = this._groupResponseSheetInfo();
  }

  /**
   * Logging errors in sheet `Logs`
   * 
   * {message}: string Error message 
   */
  logError(message) {
    this.logger.appendRow(['Error', message]);
  }

  /**
   * Logging INFO in sheet `Logs`
   * 
   * {message}: string message
   */
  logMessage(message) {
    this.logger.appendRow(['INFO', message]);
  }

  /**
   * Identifying output sheet based on facebook page id and form id
   * 
   * {page_id}: string Facebook page id
   * {form_id}: string Facebook form id
   */
  getResponseSheet(page_id, form_id) {
    let key = this._responseSheetGroups[`${page_id}-${form_id}`];
    if (!key) {
      this.logError(`Spreadsheet is not assigned to Page Id: ${page_id}; Form Id: ${form_id} }`)
      return null;
    }
    let ssid = key['Spreadsheet Id'],
      sheetName = key['Sheet Name'];
    let sheet = null
    try {
      let ss = SpreadsheetApp.openById(ssid);
      sheet = ss.getSheetByName(sheetName);
      if (sheet == null) {
        this.logMessage(`Inserting sheet: ${sheetName} in Spreadsheet: ${ssid}`)
        ss.insertSheet(sheetName);
        sheet = ss.getSheetByName(sheetName);
      }
    } catch (e) {
      this.logError(`${e}; SSID: ${key['Spreadsheet Id']}`)
    }
    return sheet;
  }

  // Internal use only
  _groupResponseSheetInfo() {
    let sheetData = this.currentSpreadsheet.getSheetByName('Main').getDataRange().getDisplayValues();
    let headers = sheetData.shift();
    let idxPageID = headers.indexOf('Page Id'),
      idxFormId = headers.indexOf('Form Id'),
      idxSSID = headers.indexOf('Spreadsheet Id'),
      idxSheetName = headers.indexOf('Sheet Name');

    let res = new Object;
    sheetData.forEach((row) => {
      res[`${row[idxPageID]}-${row[idxFormId]}`] = {
        'Spreadsheet Id': row[idxSSID],
        'Sheet Name': row[idxSheetName],
      }
    })
    return res;
  }
}

// let ss = SpreadsheetApp.getActiveSheet();
// ss.getRange(1, 1, 1, headers.length).setValues()



class LeadgenProcessor extends Base {
  constructor() {
    super();
    this.pageAccessToken = this.currentSpreadsheet.getSheetByName('Secrets').getRange('B1').getValue();
  }

  /**
   * Fetching lead info
   * 
   * {lead_id}: string Facebook lead id
   */
  getLeadInfo(lead_id) {

    var endpoint = 'https://graph.facebook.com/' + lead_id + '?access_token=' + this.pageAccessToken;
    var response = UrlFetchApp.fetch(endpoint, {'method': 'get'});
    var lead_info = JSON.parse(response);
    var field_data = lead_info.field_data;
    var result = new Object();

    field_data.forEach((r) => {
      result[r['name']] = r.values[0]
    });
    return result;
  }

  /**
   * Writing lead info into the sheet
   * 
   * {sheet}: Object Spreadsheet sheet object
   * {lead_info}: Object Lead info
   */
  writeToSheet(sheet, lead_info)
  {
    var sheetData = sheet.getDataRange().getDisplayValues();
    var headers = sheetData.shift();
    if (sheetData.length == 0) {
      headers = Object.keys(lead_info);
      sheet.getRange(1, 1, 1, headers.length).setValues([headers])
    }
    var response = [];
    headers.forEach((header) => {
      response.push(lead_info[header] || "")
    })
    sheet.appendRow(response)
  }

  /**
   * Processing an webhook entry
   * 
   * {entity}: Object Webhook entry
   */
  processEntity(entity)
  {
    // var submitted_epoch_timestamp = entry.time;
    var st = new Date(entity.time * 1000 );
    var submited_at = st.getFullYear() + '-' + (st.getMonth() + 1) + '-' + st.getDate() + ' ' + st.getHours() + ':' + st.getMinutes() + ':' + st.getSeconds();
    
    // Get lead identifier
    for (var i = 0; i < entity.changes.length; i++) {
      var lead_data = entity.changes[i].value;
      var lead_id = lead_data.leadgen_id,
        page_id = lead_data.page_id,
        form_id = lead_data.form_id,
        created_time = lead_data.created_time;
      
      var ct = new Date(created_time * 1000 );
      var created_at = ct.getFullYear() + '-' + (ct.getMonth() + 1) + '-' + ct.getDate() + ' ' + ct.getHours() + ':' + ct.getMinutes() + ':' + ct.getSeconds();
      var lead_info = this.getLeadInfo(lead_id);

      lead_info['submitted_time'] = submited_at
      lead_info['created_time'] = created_at

      var sheet = this.getResponseSheet(page_id, form_id);
      if (sheet !== null) {
        this.writeToSheet(sheet, lead_info)
      }
    }
  }
}

