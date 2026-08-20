/**
 * Bound to the Ideas spreadsheet. Deploy → Web app:
 *   Execute as: Me
 *   Who has access: Anyone  (FastAPI is not a Google user)
 *
 * Paste the /exec URL into IDEAS_WEBHOOK_URL (local .env and Render). Never commit it.
 *
 * Apps Script does NOT receive X-Webhook-Secret. If you set IDEAS_WEBHOOK_SECRET,
 * check e.postData JSON field `secret` instead.
 * Web app doPost has no active spreadsheet. Sheet ID is the long id in:
 * https://docs.google.com/spreadsheets/d/THIS_ID/edit
 */
function doPost(e) {
  const EXPECTED_SECRET = ''; // optional: same value as IDEAS_WEBHOOK_SECRET
  const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  if (EXPECTED_SECRET && body.secret !== EXPECTED_SECRET) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: 'bad secret' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const ss = SpreadsheetApp.openById('12EGLHb1ZLMHPfJ1jzpWnbFL7CpcYb2aWxGc_AxbZnSg');
  const sheet = ss.getSheetByName('Ideas') || ss.insertSheet('Ideas');
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['at', 'portfolio_id', 'source', 'symbol', 'thesis', 'catalyst', 'risk', 'confidence', 'price']);
  }

  const rows = Array.isArray(body.rows) ? body.rows : [];
  rows.forEach(function (r) {
    sheet.appendRow([
      r.at || '',
      r.portfolio_id || '',
      r.source || '',
      r.symbol || '',
      r.thesis || '',
      r.catalyst || '',
      r.risk || '',
      r.confidence == null ? '' : r.confidence,
      r.price == null ? '' : r.price,
    ]);
  });

  return ContentService.createTextOutput(JSON.stringify({ ok: true, n: rows.length }))
    .setMimeType(ContentService.MimeType.JSON);
}
