const ADMIN_PASSWORD = 'woodreach';
const SUBMISSIONS_SHEET = 'Submissions';
const PHOTO_FOLDER = 'Route 66 Proof Photos';

const HEADERS = [
  'ID',
  'Username',
  'StopID',
  'StopTitle',
  'Day',
  'Hotel',
  'Score',
  'Bonus',
  'Status',
  'SubmittedAt',
  'UpdatedAt',
  'ApprovedAt',
  'ApprovedBy',
  'ProofName',
  'ProofImage',
  'Activity'
];

function doGet() {
  return json_(state_());
}

function doPost(e) {
  const body = JSON.parse((e.postData && e.postData.contents) || '{}');
  if (body.action === 'submit') submit_(body.submission || {});
  if (body.action === 'approve') approve_(body);
  if (body.action === 'reject') reject_(body);
  return json_(state_());
}

function json_(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function state_() {
  const sheet = sheet_();
  const values = sheet.getDataRange().getValues();
  const rows = values.slice(1).filter(row => row[0]);
  return {
    ok: true,
    updatedAt: new Date().toISOString(),
    submissions: rows.map(rowToSubmission_)
  };
}

function submit_(submission) {
  if (!submission.id || !submission.username || !submission.stopId) {
    throw new Error('Missing submission fields.');
  }

  const sheet = sheet_();
  const rowNumber = findPendingRow_(submission.username, submission.stopId);
  const proofImage = savePhoto_(submission);
  const row = [
    submission.id,
    submission.username,
    submission.stopId,
    submission.stopTitle || '',
    submission.day || '',
    submission.hotel || '',
    Number(submission.score || 100),
    Number(submission.bonus || 0),
    'pending',
    submission.submittedAt || new Date().toISOString(),
    new Date().toISOString(),
    '',
    '',
    submission.proofName || '',
    proofImage,
    submission.activity || ''
  ];

  if (rowNumber) sheet.getRange(rowNumber, 1, 1, HEADERS.length).setValues([row]);
  else sheet.appendRow(row);
}

function approve_(body) {
  requireAdmin_(body.adminKey);
  const rowNumber = findRowById_(body.id);
  if (!rowNumber) throw new Error('Submission not found.');

  const sheet = sheet_();
  sheet.getRange(rowNumber, col_('Bonus')).setValue(Number(body.bonus || 0));
  sheet.getRange(rowNumber, col_('Status')).setValue('approved');
  sheet.getRange(rowNumber, col_('ApprovedAt')).setValue(new Date().toISOString());
  sheet.getRange(rowNumber, col_('ApprovedBy')).setValue(body.approvedBy || 'admin');
  sheet.getRange(rowNumber, col_('UpdatedAt')).setValue(new Date().toISOString());
}

function reject_(body) {
  requireAdmin_(body.adminKey);
  const rowNumber = findRowById_(body.id);
  if (!rowNumber) throw new Error('Submission not found.');

  const sheet = sheet_();
  sheet.getRange(rowNumber, col_('Status')).setValue('rejected');
  sheet.getRange(rowNumber, col_('ApprovedBy')).setValue(body.approvedBy || 'admin');
  sheet.getRange(rowNumber, col_('UpdatedAt')).setValue(new Date().toISOString());
}

function requireAdmin_(key) {
  if (String(key || '') !== ADMIN_PASSWORD) throw new Error('Bad admin key.');
}

function sheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SUBMISSIONS_SHEET) || ss.insertSheet(SUBMISSIONS_SHEET);
  ensureHeaders_(sheet);
  return sheet;
}

function ensureHeaders_(sheet) {
  const width = HEADERS.length;
  const current = sheet.getRange(1, 1, 1, width).getValues()[0];
  if (current.join('') !== HEADERS.join('')) {
    sheet.getRange(1, 1, 1, width).setValues([HEADERS]);
    sheet.setFrozenRows(1);
  }
}

function findRowById_(id) {
  const sheet = sheet_();
  const values = sheet.getRange(2, 1, Math.max(sheet.getLastRow() - 1, 0), 1).getValues();
  for (let index = 0; index < values.length; index++) {
    if (String(values[index][0]) === String(id)) return index + 2;
  }
  return 0;
}

function findPendingRow_(username, stopId) {
  const sheet = sheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  const values = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
  for (let index = 0; index < values.length; index++) {
    const row = values[index];
    if (String(row[1]) === String(username) && String(row[2]) === String(stopId) && String(row[8]).toLowerCase() === 'pending') {
      return index + 2;
    }
  }
  return 0;
}

function savePhoto_(submission) {
  const dataUrl = String(submission.proofImage || '');
  const match = dataUrl.match(/^data:(.*?);base64,(.*)$/);
  if (!match) return dataUrl;

  const mimeType = match[1] || 'image/jpeg';
  const ext = mimeType.indexOf('png') > -1 ? 'png' : 'jpg';
  const name = [submission.username, submission.stopId, Date.now()].join('-') + '.' + ext;
  const bytes = Utilities.base64Decode(match[2]);
  const blob = Utilities.newBlob(bytes, mimeType, name);
  const file = photoFolder_().createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return file.getUrl();
}

function photoFolder_() {
  const folders = DriveApp.getFoldersByName(PHOTO_FOLDER);
  return folders.hasNext() ? folders.next() : DriveApp.createFolder(PHOTO_FOLDER);
}

function rowToSubmission_(row) {
  return {
    id: String(row[0] || ''),
    username: String(row[1] || ''),
    stopId: String(row[2] || ''),
    stopTitle: String(row[3] || ''),
    day: String(row[4] || ''),
    hotel: String(row[5] || ''),
    score: Number(row[6] || 100),
    bonus: Number(row[7] || 0),
    status: String(row[8] || 'pending').toLowerCase(),
    submittedAt: String(row[9] || ''),
    updatedAt: String(row[10] || ''),
    approvedAt: String(row[11] || ''),
    approvedBy: String(row[12] || ''),
    proofName: String(row[13] || ''),
    proofImage: String(row[14] || ''),
    activity: String(row[15] || '')
  };
}

function col_(header) {
  return HEADERS.indexOf(header) + 1;
}
