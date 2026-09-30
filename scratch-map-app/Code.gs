/**
 * Scratch Map - Google Apps Script backend
 * Lives inside your Google Sheet. The phone app reads and writes the "Visited" tab through this script.
 *
 * The app sends the full list of rows each time it saves. Before every save, the previous
 * contents are copied to a tab called "Backup", so one bad save can always be undone.
 */

var SHEET_NAME = 'Visited';
var BACKUP_NAME = 'Backup';
var HEADERS = ['Type', 'Country', 'State/Province', 'City', 'Trip Date', 'Notes'];
var MAX_ROWS = 5000;

function getVisitedSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) sh = ss.insertSheet(SHEET_NAME);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  // Keep Trip Date as plain text so "2019-04" is never turned into a date by Sheets.
  sh.getRange(1, 5, sh.getMaxRows(), 1).setNumberFormat('@');
  return sh;
}

function cellText_(v) {
  if (v === null || v === undefined) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM');
  }
  return String(v).trim();
}

function readRows_() {
  var sh = getVisitedSheet_();
  var last = sh.getLastRow();
  if (last < 2) return [];
  var values = sh.getRange(2, 1, last - 1, HEADERS.length).getValues();
  var rows = [];
  for (var i = 0; i < values.length; i++) {
    var r = [];
    for (var c = 0; c < HEADERS.length; c++) r.push(cellText_(values[i][c]));
    if (r.join('') !== '') rows.push(r);
  }
  return rows;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// Opening the web app link in a browser shows your rows as JSON. That is a quick way to check it works.
function doGet(e) {
  try {
    var rows = readRows_();
    return json_({ ok: true, count: rows.length, rows: rows });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    var body = JSON.parse(e.postData.contents);
    var rows = body.rows;
    if (!Array.isArray(rows)) return json_({ ok: false, error: 'rows must be a list' });
    if (rows.length > MAX_ROWS) return json_({ ok: false, error: 'too many rows' });

    var clean = [];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (!Array.isArray(r)) return json_({ ok: false, error: 'bad row ' + i });
      var out = [];
      for (var c = 0; c < HEADERS.length; c++) out.push(r[c] === undefined || r[c] === null ? '' : String(r[c]));
      clean.push(out);
    }

    var sh = getVisitedSheet_();
    var existing = readRows_();
    if (clean.length === 0 && existing.length > 0 && body.allowEmpty !== true) {
      return json_({ ok: false, error: 'refused to empty the sheet' });
    }

    // Back up whatever is there now.
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var bk = ss.getSheetByName(BACKUP_NAME) || ss.insertSheet(BACKUP_NAME);
    bk.clearContents();
    bk.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
    if (existing.length) bk.getRange(2, 1, existing.length, HEADERS.length).setValues(existing);
    bk.getRange(1, HEADERS.length + 2).setValue('Backup taken ' + new Date());

    // Write the new list.
    var oldLast = sh.getLastRow();
    if (oldLast > 1) sh.getRange(2, 1, oldLast - 1, HEADERS.length).clearContent();
    if (clean.length) {
      sh.getRange(2, 5, clean.length, 1).setNumberFormat('@');
      sh.getRange(2, 1, clean.length, HEADERS.length).setValues(clean);
    }
    return json_({ ok: true, count: clean.length });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
}
