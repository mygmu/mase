/*************************************************************************************************
 * MASE EXHIBITION — GOOGLE SITES EDITION  (single web app, password + access-code login)
 * Gulf Medical University
 *
 * ONE Apps Script project, ONE deployment, embeddable in Google Sites.
 *   - Admin console  → opened with the ADMIN password.
 *   - Dashboard      → opened with the ADMIN or the (optional) DASHBOARD password.
 *   - Judge app      → opened with the judge's emailed ACCESS CODE.
 *
 * Authentication is token-based: a login returns a signed token (role baked in); the token is
 * sent with every server call and validated server-side. No Google account or domain needed.
 *
 * DO NOT combine this file with the hybrid Code.gs / Api.gs — keep it in its own clean project.
 *
 * FIRST-RUN (from the Sheet's "MASE Platform" menu, or the editor):
 *   1. Set up database      2. Set admin password      3. (optional) Set dashboard password
 *   Then deploy: Execute as Me, Who has access: Anyone.  Embed the /exec URL in Google Sites.
 *************************************************************************************************/

var APP_NAME = 'MASE Exhibition Platform';

/* =====================================================  RUBRIC  =============================== */
var RUBRIC = {
  id: 'RUB-MASE-V1', version: 1, name: 'MASE Standard Rubric', maxTotal: 40,
  criteria: [
    { id:'C1', name:'Theme / Topic / Concept', max:10, bands:[
      {label:'0-2',min:0,max:2,desc:'Shows limited understanding of scientific principles; lacks clarity and depth.'},
      {label:'3-4',min:3,max:4,desc:'Shows basic scientific understanding; minimal exploration or real-world connection.'},
      {label:'5-6',min:5,max:6,desc:'Demonstrates good understanding with reasonable scientific depth for this age group.'},
      {label:'7-8',min:7,max:8,desc:'Reflects strong scientific understanding, thoughtful exploration and logical reasoning.'},
      {label:'9-10',min:9,max:10,desc:'Demonstrates exceptional scientific insight, depth and originality; advanced grasp of the subject.'}]},
    { id:'C2', name:'Knowledge about the Exhibit', max:10, bands:[
      {label:'0-2',min:0,max:2,desc:'Shows minimal understanding; explanations mostly unclear or incorrect.'},
      {label:'3-4',min:3,max:4,desc:'Demonstrates partial understanding but lacks confidence or clarity.'},
      {label:'5-6',min:5,max:6,desc:'Shows good understanding with generally accurate explanations.'},
      {label:'7-8',min:7,max:8,desc:'Demonstrates solid knowledge and is able to explain concepts clearly.'},
      {label:'9-10',min:9,max:10,desc:'Shows excellent command of the subject, explaining concepts confidently and in depth.'}]},
    { id:'C3', name:'Presentation Skills', max:10, bands:[
      {label:'0-2',min:0,max:2,desc:'Presentation is disorganised and difficult to follow; lacks engagement.'},
      {label:'3-4',min:3,max:4,desc:'Presentation is somewhat clear but lacks structure or confidence.'},
      {label:'5-6',min:5,max:6,desc:'Presentation is organised and easy to follow; moderate engagement.'},
      {label:'7-8',min:7,max:8,desc:'Presentation is clear, confident and well-paced with good audience engagement.'},
      {label:'9-10',min:9,max:10,desc:'Presentation is highly engaging, confident and professional with exceptional clarity and delivery.'}]},
    { id:'C4', name:'Creativity / Innovation', max:10, bands:[
      {label:'0-2',min:0,max:2,desc:'Shows little to no originality; mostly replicates existing ideas.'},
      {label:'3-4',min:3,max:4,desc:'Shows some creative elements but lacks novelty or unique thinking.'},
      {label:'5-6',min:5,max:6,desc:'Demonstrates moderate creativity with a few innovative aspects.'},
      {label:'7-8',min:7,max:8,desc:'Shows strong creativity and originality in approach or design.'},
      {label:'9-10',min:9,max:10,desc:'Exceptionally creative and innovative; out-of-the-box thinking and fresh idea.'}]}
  ]
};

/* =====================================================  SCHEMA  =============================== */
var SCHEMA = {
  Settings:            ['Key','Value'],
  Schools:             ['SchoolID','Name','Code','Type','RepName','RepContact','RepEmail','Address','Status','Notes','CreatedAt','UpdatedAt','Emirate'],
  Categories:          ['CategoryID','Name','Code','Description','ParentCategory','Status','RubricVersion','MaxScore','JudgesRequired','MultiJudge','RankingScope','SchoolRanking','Prize','TieBreak','OpenAt','CloseAt'],
  Participants:        ['ParticipantID','RegNo','SchoolID','SchoolName','Title','Description','Category','Subcategory','ParticipantType','EntryType','LeadName','TeamMembers','StudentId','Grade','Contact','Email','Supervisor','SupervisorContact','TableID','TableName','RegStatus','ProjectStatus','Notes','CreatedAt','UpdatedAt','Emirate'],
  Tables:              ['TableID','TableName','Location','Floor','Status','Notes','UpdatedAt'],
  TableAssignments:    ['AssignmentID','TableID','TableName','ParticipantID','SchoolName','Category','Active','PrevTableID','User','Timestamp','Reason'],
  Judges:              ['JudgeID','Name','Title','Institution','Email','Contact','Categories','Status','Role','Notes'],
  JudgeAuth:           ['JudgeID','AccessCode','CodeIssuedAt','LastLoginAt'],
  JudgeAssignments:    ['AssignmentID','JudgeID','JudgeName','ParticipantID','ProjectTitle','SchoolName','Category','TableName','Status','CreatedAt'],
  Evaluations:         ['EvaluationID','ParticipantID','SchoolID','CategoryID','TableID','JudgeID','JudgeName','RubricID','RubricVersion','C1','C2','C3','C4','TimePenalty','Total','MaxTotal','Percentage','Comments','Status','CreatedAt','SubmittedAt','UpdatedAt','CorrectionReason'],
  EvaluationResponses: ['EvaluationID','CriterionID','CriterionName','BandLabel','Points'],
  Awards:              ['AwardID','Name','Scope','Rule','WinnerParticipantID','SchoolID','Status','ConfirmedAt','Notes'],
  AuditLog:            ['Timestamp','User','Action','Entity','RefID','Details'],
  RegistrationRequests:['RequestID','Source','SourceKey','SchoolName','Title','Category','Names','TableName','Status','CreatedAt','ReviewNote'],
  ImportErrors:        ['Timestamp','Entity','RowNum','Error','RawData']
};
var ENTITY = {
  schools:      { sheet:'Schools',      prefix:'SCH', required:['Name'],                         dupKeys:['Name'] },
  categories:   { sheet:'Categories',   prefix:'CAT', required:['Name'],                         dupKeys:['Name'] },
  participants: { sheet:'Participants', prefix:'PRT', required:['Title','SchoolID','Category'],  dupKeys:['RegNo'] },
  tables:       { sheet:'Tables',       prefix:'TBL', required:['TableName'],                    dupKeys:['TableName'] },
  judges:       { sheet:'Judges',       prefix:'JDG', required:['Name','Email'],                 dupKeys:['Email'] }
};

/* =====================================================  WEB APP ROUTER  ======================= */
function doGet(e) {
  var page = (e && e.parameter && e.parameter.page) ? String(e.parameter.page).toLowerCase() : 'judge';
  var file = page === 'admin' ? 'Admin' : (page === 'dashboard' ? 'Dashboard' : 'Judge');
  var t = HtmlService.createTemplateFromFile(file);
  t.appName = APP_NAME; t.userEmail = 'Organiser'; t.role = page;
  return t.evaluate()
    .setTitle(APP_NAME)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
function include(name) { return HtmlService.createHtmlOutputFromFile(name).getContent(); }

/* =====================================================  JSON API (for GitHub front end)  ====== */
// A static front end (GitHub Pages) posts {action, args:[...]} here. The credential/token travels
// as the first element of args, exactly as the server functions already expect, so this reuses
// 100% of the existing logic. requireCtx_ inside each function enforces access on every call.
function doPost(e) {
  try {
    var req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var fn = apiMap_()[req.action];
    if (!fn) throw new Error('Unknown action: ' + req.action);
    var result = fn.apply(null, req.args || []);
    return jsonOut_({ ok: true, data: result });
  } catch (err) {
    return jsonOut_({ ok: false, error: (err && err.message) || String(err) });
  }
}
function jsonOut_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function apiMap_() {
  return {
    // public (no credential)
    login: login, loginJudge: loginJudge,
    // admin console
    bootstrapAdmin: bootstrapAdmin, getContext: getContext, apiList: apiList, apiSave: apiSave, apiArchive: apiArchive,
    assignTable: assignTable, getOverview: getOverview, getJudgeMonitor: getJudgeMonitor, getJudgeCodes: getJudgeCodes,
    getModeration: getModeration, getTablesBoard: getTablesBoard, listJudgeAssignments: listJudgeAssignments,
    assignJudge: assignJudge, removeJudgeAssignment: removeJudgeAssignment, autoAssignJudges: autoAssignJudges,
    getAuditLog: getAuditLog, getRegistrationSampleCsv: getRegistrationSampleCsv, importGoogleForm: importGoogleForm,
    importCsv: importCsv, previewRegistrationCsv: previewRegistrationCsv, importRegistrations: importRegistrations,
    getImportTemplate: getImportTemplate, exportReport: exportReport, exportEntityCsv: exportEntityCsv,
    getRankings: getRankings, getDashboardData: getDashboardData, setSetting: setSetting, changePassword: changePassword,
    issueAccessCode: issueAccessCode, regenerateAccessCode: regenerateAccessCode, listRegistrationRequests: listRegistrationRequests,
    adminLoadSample: adminLoadSample, adminClearSample: adminClearSample,
    // judge app
    jvContext: jvContext, jvFindTable: jvFindTable, jvSearch: jvSearch, jvSubmit: jvSubmit, jvMyEvals: jvMyEvals,
    jvReassignTable: jvReassignTable, jvAddRequest: jvAddRequest
  };
}

/* =====================================================  AUTH: TOKENS & PASSWORDS  ============= */
function getAppSecret_() {
  var p = PropertiesService.getScriptProperties(), s = p.getProperty('APP_SECRET');
  if (s) return s;
  var lock = LockService.getScriptLock();
  try { lock.waitLock(10000); } catch (e) {}
  s = p.getProperty('APP_SECRET');               // re-check inside the lock
  if (!s) { s = Utilities.getUuid() + Utilities.getUuid(); p.setProperty('APP_SECRET', s); }
  try { lock.releaseLock(); } catch (e) {}
  return s;
}
function sign_(data) { return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(data, getAppSecret_())).replace(/=+$/, ''); }
function hashPw_(pw) { return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(String(pw), getAppSecret_())); }

// STATELESS credentials. The client holds a credential and sends it with every call; the server
// re-validates it against permanently stored data (Script Properties for passwords, the JudgeAuth
// sheet for judges) on each call. Nothing is kept between calls, so there is no session that can
// expire or fail to propagate — the login loop is structurally impossible.
//   Admin credential  = 'A:' + <stored admin password hash>
//   Viewer credential = 'V:' + <stored dashboard password hash>
//   Judge credential  = 'J:' + <access code>
function verifyToken_(token) {
  if (!token) return null;
  var t = String(token), i = t.indexOf(':');
  if (i < 0) return null;
  var kind = t.substring(0, i), val = t.substring(i + 1);
  var props = PropertiesService.getScriptProperties();
  if (kind === 'A') { var a = props.getProperty('ADMIN_PASSWORD_HASH');     return (a && val === a) ? { role: 'admin',  subject: 'organiser' } : null; }
  if (kind === 'V') { var d = props.getProperty('DASHBOARD_PASSWORD_HASH'); return (d && val === d) ? { role: 'viewer', subject: 'dashboard' } : null; }
  if (kind === 'J') {
    var code = String(val || '').toUpperCase(), auth;
    try { auth = readSheet_('JudgeAuth').rows; } catch (e) { return null; }
    var row = auth.filter(function(r){ return String(r.AccessCode || '').toUpperCase() === code; })[0];
    if (!row) return null;
    var judge = readSheet_('Judges').rows.filter(function(r){ return r.JudgeID === row.JudgeID; })[0];
    if (!judge || String(judge.Status || 'Active').toLowerCase() === 'inactive') return null;
    return { role: 'judge', subject: judge.JudgeID };
  }
  return null;
}
function requireCtx_(token, roles) {
  var ctx = verifyToken_(token);
  if (!ctx) throw new Error('Your session has ended. Please sign in again. [AUTH]');
  if (roles && roles.indexOf(ctx.role) === -1) throw new Error('This login does not have access to that action. [AUTH]');
  return ctx;
}

// Server-side only (menu/editor). Never exposed as a bare client call.
function setPw_(key, pw) {
  if (!pw || String(pw).length < 4) throw new Error('Password must be at least 4 characters.');
  PropertiesService.getScriptProperties().setProperty(key, hashPw_(pw));
}

// CLIENT-CALLABLE: login with a password. Role is decided by which password matched.
function login(password) {
  loginThrottle_();
  var props = PropertiesService.getScriptProperties();
  var adminH = props.getProperty('ADMIN_PASSWORD_HASH');
  var dashH  = props.getProperty('DASHBOARD_PASSWORD_HASH');
  if (!adminH) throw new Error('No admin password has been set yet. The owner must run "Set admin password".');
  var h = hashPw_(password || '');
  if (h === adminH) return { token: 'A:' + adminH, role: 'admin' };
  if (dashH && h === dashH) return { token: 'V:' + dashH, role: 'viewer' };
  loginFail_(); Utilities.sleep(400);
  throw new Error('Incorrect password.');
}

// CLIENT-CALLABLE: admin changes passwords from the UI.
function changePassword(token, which, newPw) {
  requireCtx_(token, ['admin']);
  setPw_(which === 'dashboard' ? 'DASHBOARD_PASSWORD_HASH' : 'ADMIN_PASSWORD_HASH', newPw);
  audit_('SET_PASSWORD', 'Security', which, '');
  return { ok: true };
}

function loginThrottle_() {
  var n = Number(CacheService.getScriptCache().get('login_fails') || '0');
  if (n > 80) throw new Error('Too many sign-in attempts. Please wait a minute and try again.');
}
function loginFail_() {
  var c = CacheService.getScriptCache(); var n = Number(c.get('login_fails') || '0');
  c.put('login_fails', String(n + 1), 120);
}

/* =====================================================  JUDGE LOGIN (ACCESS CODE)  =========== */
function generateAccessCode_() {
  var chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789', s = '';
  for (var i = 0; i < 8; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
  return s;
}
function loginJudge(code) {
  loginThrottle_();
  code = String(code || '').trim().toUpperCase();
  if (!code) throw new Error('Enter your access code.');
  var auth;
  try { auth = readSheet_('JudgeAuth').rows; } catch (e) { throw new Error('Judge access is not set up yet. Ask the administrator to run setup.'); }
  var row = auth.filter(function(r){ return String(r.AccessCode || '').toUpperCase() === code; })[0];
  if (!row) { loginFail_(); Utilities.sleep(400); throw new Error('Invalid access code.'); }
  var judge = readSheet_('Judges').rows.filter(function(r){ return r.JudgeID === row.JudgeID; })[0];
  if (!judge || String(judge.Status || 'Active').toLowerCase() === 'inactive') throw new Error('This judge account is inactive.');
  row.LastLoginAt = now_(); updateRowByObj_('JudgeAuth', row);
  return { token: 'J:' + code, judge: { id: judge.JudgeID, name: judge.Name }, rubric: RUBRIC, settings: publicSettings_(), myEvals: myEvals_(judge.JudgeID) };
}
function publicSettings_() { var s = getSettingsMap_(); return { ExhibitionName: s.ExhibitionName || 'MASE Exhibition' }; }

/* =====================================================  SHEET HELPERS  ======================== */
function getSS_() {
  var props = PropertiesService.getScriptProperties(), id = props.getProperty('SPREADSHEET_ID');
  if (id) return SpreadsheetApp.openById(id);
  var active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) { props.setProperty('SPREADSHEET_ID', active.getId()); return active; }
  throw new Error('No spreadsheet configured. Open the container Sheet and run setupDatabase().');
}
function getSheet_(name) { var sh = getSS_().getSheetByName(name); if (!sh) throw new Error('Sheet "' + name + '" not found. Run setupDatabase() first.'); return sh; }
function readSheet_(name) {
  var sh = getSheet_(name), values = sh.getDataRange().getValues();
  var headers = values.length ? values[0] : (SCHEMA[name] || []), rows = [];
  for (var r = 1; r < values.length; r++) { var o = {}; for (var c = 0; c < headers.length; c++) o[headers[c]] = values[r][c]; o.__row = r + 1; rows.push(o); }
  return { headers: headers, rows: rows, sheet: sh };
}
function objToRow_(obj, headers) { return headers.map(function(h){ return (obj[h] === undefined || obj[h] === null) ? '' : obj[h]; }); }
function appendRow_(name, obj) { var sh = getSheet_(name), headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0]; sh.appendRow(objToRow_(obj, headers)); }
function updateRowByObj_(name, obj) { var d = readSheet_(name); if (!obj.__row) throw new Error('Missing row reference.'); d.sheet.getRange(obj.__row, 1, 1, d.headers.length).setValues([objToRow_(obj, d.headers)]); }
function nextId_(prefix, sheetName, idField) {
  var max = 0; readSheet_(sheetName).rows.forEach(function(r){ var m = String(r[idField] || '').match(/(\d+)\s*$/); if (m) max = Math.max(max, parseInt(m[1], 10)); });
  return prefix + '-' + pad_(max + 1, 4);
}
function pad_(n, w) { var s = String(n); while (s.length < w) s = '0' + s; return s; }
function now_() { return new Date(); }
function audit_(action, entity, refId, details) {
  try { appendRow_('AuditLog', { Timestamp: now_(), User: 'organiser', Action: action, Entity: entity, RefID: refId, Details: details || '' }); } catch (e) {}
}
function getSettingsMap_() { var m = {}; try { readSheet_('Settings').rows.forEach(function(r){ if (r.Key) m[r.Key] = r.Value; }); } catch (e) {} return m; }

/* =====================================================  SETUP + MENU  ========================= */
function onOpen() {
  try {
    SpreadsheetApp.getUi().createMenu('MASE Platform')
      .addItem('1. Set up / repair database', 'setupDatabase')
      .addItem('2. Set admin password', 'menuSetAdminPassword')
      .addItem('3. Set dashboard password (optional)', 'menuSetDashboardPassword')
      .addSeparator()
      .addItem('Email codes to all judges', 'issueCodesForAllJudges_menu')
      .addItem('Load sample data (demo)', 'loadSampleData')
      .addToUi();
  } catch (e) {}
}
function setupDatabase() {
  var ss = getSS_();
  Object.keys(SCHEMA).forEach(function(name){
    var sh = ss.getSheetByName(name) || ss.insertSheet(name), headers = SCHEMA[name];
    var cur = sh.getLastColumn() ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0] : [];
    if (cur.join('|') !== headers.join('|')) sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#0B6E4F').setFontColor('#FFFFFF');
    sh.setFrozenRows(1);
  });
  seedRubric_(); seedDefaultSettings_(); getAppSecret_();
  var junk = ss.getSheetByName('Sheet1'); if (junk && junk.getLastRow() <= 1 && !SCHEMA['Sheet1']) { try { ss.deleteSheet(junk); } catch (e) {} }
  SpreadsheetApp.flush();
  try { SpreadsheetApp.getUi().alert('Database ready. Next: set the admin password, then deploy the web app (Anyone).'); } catch (e) {}
}
function seedRubric_() {
  // Rubric authoritative in code; sheets kept for reference only in this edition.
}
function seedDefaultSettings_() {
  var defaults = { ExhibitionName:'MASE Exhibition ' + new Date().getFullYear(), JudgeAppUrl:'',
    ScoringAggregation:'average', SchoolRankingMethod:'avgEligible', OverallRankMethod:'percentage',
    RankingsPublished:'true', ResultsFinal:'false', AllowJudgeCorrect:'true' };
  var ex = getSettingsMap_();
  Object.keys(defaults).forEach(function(k){ if (ex[k] === undefined) appendRow_('Settings', { Key: k, Value: defaults[k] }); });
}
function menuSetAdminPassword() {
  var ui = SpreadsheetApp.getUi();
  var r = ui.prompt('Set administrator password', 'Enter a new admin password (min 4 characters):', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  setPw_('ADMIN_PASSWORD_HASH', r.getResponseText()); ui.alert('Admin password set.');
}
function menuSetDashboardPassword() {
  var ui = SpreadsheetApp.getUi();
  var r = ui.prompt('Set dashboard password', 'Enter a view-only dashboard password (blank to disable):', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  var pw = r.getResponseText();
  if (!pw) { PropertiesService.getScriptProperties().deleteProperty('DASHBOARD_PASSWORD_HASH'); ui.alert('Dashboard password cleared (admin password still opens it).'); return; }
  setPw_('DASHBOARD_PASSWORD_HASH', pw); ui.alert('Dashboard password set.');
}

/* =====================================================  ACCESS CODES (ADMIN)  ================ */
// Permanent code: if the judge already has one, reuse and re-send it. The code never changes
// unless the admin explicitly regenerates it, so a judge can use the same code all event long.
function issueAccessCode(token, judgeId, send) {
  requireCtx_(token, ['admin']);
  var judge = readSheet_('Judges').rows.filter(function(r){ return r.JudgeID === judgeId; })[0];
  if (!judge) throw new Error('Judge not found.');
  if (!judge.Email) throw new Error('This judge has no email address on file.');
  var auth = readSheet_('JudgeAuth'), row = auth.rows.filter(function(r){ return r.JudgeID === judgeId; })[0];
  var code;
  if (row && row.AccessCode) { code = row.AccessCode; }          // reuse existing — permanent
  else {
    code = generateAccessCode_();
    if (row) { row.AccessCode = code; row.CodeIssuedAt = now_(); updateRowByObj_('JudgeAuth', row); }
    else appendRow_('JudgeAuth', { JudgeID: judgeId, AccessCode: code, CodeIssuedAt: now_(), LastLoginAt: '' });
  }
  var emailed = false;
  if (send !== false) { emailAccessCode_(judge, code); emailed = true; }
  audit_('ISSUE_CODE', 'JudgeAuth', judgeId, emailed ? 'emailed' : 'reused');
  return { ok: true, code: code, emailed: emailed };
}

// Deliberate rotation (invalidates the old code).
function regenerateAccessCode(token, judgeId) {
  requireCtx_(token, ['admin']);
  var judge = readSheet_('Judges').rows.filter(function(r){ return r.JudgeID === judgeId; })[0];
  if (!judge) throw new Error('Judge not found.');
  if (!judge.Email) throw new Error('This judge has no email address on file.');
  var code = generateAccessCode_();
  var auth = readSheet_('JudgeAuth'), row = auth.rows.filter(function(r){ return r.JudgeID === judgeId; })[0];
  if (row) { row.AccessCode = code; row.CodeIssuedAt = now_(); updateRowByObj_('JudgeAuth', row); }
  else appendRow_('JudgeAuth', { JudgeID: judgeId, AccessCode: code, CodeIssuedAt: now_(), LastLoginAt: '' });
  emailAccessCode_(judge, code);
  audit_('REGEN_CODE', 'JudgeAuth', judgeId, 'rotated');
  return { ok: true, code: code, emailed: true };
}
function emailAccessCode_(judge, code) {
  var s = getSettingsMap_(), ex = s.ExhibitionName || 'MASE Exhibition', url = s.JudgeAppUrl || '';
  var body = 'Dear ' + (judge.Name || 'Judge') + ',\n\n'
    + 'You have been registered as a judge for ' + ex + '.\n\n'
    + 'Your personal access code is:\n\n        ' + code + '\n\n'
    + (url ? ('Open the judge evaluation page and sign in with this code:\n' + url + '\n\n') : '')
    + 'Please keep this code private — it is linked to your name and your submitted evaluations.\n\n'
    + 'Thank you,\n' + ex + ' Organising Team';
  MailApp.sendEmail(judge.Email, ex + ' — Your Judge Access Code', body);
}
function issueCodesForAllJudges_menu() {
  var judges = readSheet_('Judges').rows.filter(function(j){ return j.Email && String(j.Status || 'Active').toLowerCase() !== 'inactive'; });
  judges.forEach(function(j){
    var code = generateAccessCode_(), auth = readSheet_('JudgeAuth'), row = auth.rows.filter(function(r){ return r.JudgeID === j.JudgeID; })[0];
    if (row) { row.AccessCode = code; row.CodeIssuedAt = now_(); updateRowByObj_('JudgeAuth', row); }
    else appendRow_('JudgeAuth', { JudgeID: j.JudgeID, AccessCode: code, CodeIssuedAt: now_(), LastLoginAt: '' });
    emailAccessCode_(j, code);
  });
  try { SpreadsheetApp.getUi().alert('Access codes emailed to ' + judges.length + ' judge(s).'); } catch (e) {}
}

/* =====================================================  CONTEXT  ============================== */
function getContext(token) {
  requireCtx_(token, ['admin']);
  return { role: 'admin', settings: getSettingsMap_(), rubric: RUBRIC };
}
// One round-trip that loads everything the console needs on open (speed).
function bootstrapAdmin(token) {
  requireCtx_(token, ['admin']);
  return {
    settings: getSettingsMap_(), rubric: RUBRIC,
    schools: readSheet_('Schools').rows,
    categories: readSheet_('Categories').rows,
    dashboard: dashboardData_()
  };
}

/* =====================================================  ADMIN CRUD  =========================== */
function apiList(token, entity) {
  requireCtx_(token, ['admin']);
  var cfg = ENTITY[entity]; if (!cfg) throw new Error('Unknown entity: ' + entity);
  return readSheet_(cfg.sheet).rows;
}
function apiSave(token, entity, record) {
  requireCtx_(token, ['admin']);
  var cfg = ENTITY[entity]; if (!cfg) throw new Error('Unknown entity: ' + entity);
  cfg.required.forEach(function(f){ if (!record[f] && record[f] !== 0) throw new Error('Required field missing: ' + f); });
  var data = readSheet_(cfg.sheet), idField = SCHEMA[cfg.sheet][0], isNew = !record[idField];
  if (isNew && cfg.dupKeys) cfg.dupKeys.forEach(function(k){
    if (!record[k]) return;
    if (data.rows.some(function(r){ return String(r[k] || '').trim().toLowerCase() === String(record[k]).trim().toLowerCase(); }))
      throw new Error('A ' + entity + ' with ' + k + ' "' + record[k] + '" already exists.');
  });
  if (entity === 'participants' && record.SchoolID) {
    var sch = readSheet_('Schools').rows.filter(function(r){ return r.SchoolID === record.SchoolID; })[0];
    if (sch) { record.SchoolName = sch.Name; if (sch.Emirate) record.Emirate = sch.Emirate; }
  }
  var lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    if (isNew) {
      record[idField] = nextId_(cfg.prefix, cfg.sheet, idField);
      if (SCHEMA[cfg.sheet].indexOf('Status') !== -1 && !record.Status) record.Status = 'Active';
      if (SCHEMA[cfg.sheet].indexOf('CreatedAt') !== -1) record.CreatedAt = now_();
      if (SCHEMA[cfg.sheet].indexOf('UpdatedAt') !== -1) record.UpdatedAt = now_();
      appendRow_(cfg.sheet, record); audit_('CREATE', cfg.sheet, record[idField], '');
    } else {
      var target = data.rows.filter(function(r){ return r[idField] === record[idField]; })[0];
      if (!target) throw new Error(entity + ' not found: ' + record[idField]);
      SCHEMA[cfg.sheet].forEach(function(h){ if (record[h] !== undefined) target[h] = record[h]; });
      if (SCHEMA[cfg.sheet].indexOf('UpdatedAt') !== -1) target.UpdatedAt = now_();
      updateRowByObj_(cfg.sheet, target); audit_('UPDATE', cfg.sheet, record[idField], '');
    }
  } finally { lock.releaseLock(); }
  return { ok: true, id: record[idField] };
}

/* =====================================================  TABLE ASSIGNMENT  ===================== */
// Admin assignment: strict — refuses to overwrite an occupied table.
function assignTable(token, participantId, tableId, reason) {
  requireCtx_(token, ['admin']);
  var lock = LockService.getScriptLock(); lock.waitLock(10000);
  try { return doAssign_(participantId, tableId, 'organiser', reason, false); }
  finally { lock.releaseLock(); }
}

// Judge reassignment by table NAME: the judge is physically at a table; they pick the correct
// participant and assign them here. The table is created if it doesn't exist; a previous occupant
// (who has moved) is displaced and reported back so the judge sees what happened.
function jvReassignTable(token, participantId, tableName, reason) {
  var ctx = requireCtx_(token, ['judge', 'admin']);
  var lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    var key = String(tableName || '').trim();
    if (!key) throw new Error('Enter the table number.');
    var t = readSheet_('Tables').rows.filter(function(r){ return String(r.TableName || '').trim().toLowerCase() === key.toLowerCase(); })[0];
    if (!t) { // create the physical table on the fly
      var tid = nextId_('TBL', 'Tables', 'TableID');
      appendRow_('Tables', { TableID: tid, TableName: key, Location: '', Floor: '', Status: 'Active', Notes: 'Created during judging', UpdatedAt: now_() });
      t = { TableID: tid, TableName: key };
    }
    var who = ctx.role === 'judge' ? ('judge:' + ctx.subject) : 'organiser';
    return doAssign_(participantId, t.TableID, who, reason || 'Reassigned at table by judge', true);
  } finally { lock.releaseLock(); }
}

// Shared assignment engine. force=false → throw on conflict; force=true → displace the old occupant.
function doAssign_(participantId, tableId, user, reason, force) {
  var parts = readSheet_('Participants');
  var p = parts.rows.filter(function(r){ return r.ParticipantID === participantId; })[0];
  var t = readSheet_('Tables').rows.filter(function(r){ return r.TableID === tableId; })[0];
  if (!p) throw new Error('Participant not found.');
  if (!t) throw new Error('Table not found.');

  var assigns = readSheet_('TableAssignments');
  var displaced = null;
  var occ = assigns.rows.filter(function(r){ return r.TableID === tableId && String(r.Active) === 'true' && r.ParticipantID !== participantId; })[0];
  if (occ) {
    if (!force) throw new Error('Table ' + t.TableName + ' is already assigned to another project. Resolve the conflict first.');
    occ.Active = false; updateRowByObj_('TableAssignments', occ);
    var dp = parts.rows.filter(function(r){ return r.ParticipantID === occ.ParticipantID; })[0];
    if (dp) { dp.TableID = ''; dp.TableName = ''; dp.UpdatedAt = now_(); updateRowByObj_('Participants', dp); displaced = dp.Title || dp.ParticipantID; }
  }
  var prev = '';
  assigns.rows.forEach(function(r){ if (r.ParticipantID === participantId && String(r.Active) === 'true') { prev = r.TableID; r.Active = false; updateRowByObj_('TableAssignments', r); } });
  appendRow_('TableAssignments', { AssignmentID: nextId_('ASG', 'TableAssignments', 'AssignmentID'), TableID: tableId, TableName: t.TableName, ParticipantID: participantId, SchoolName: p.SchoolName, Category: p.Category, Active: true, PrevTableID: prev, User: user, Timestamp: now_(), Reason: reason || '' });
  p.TableID = tableId; p.TableName = t.TableName; p.UpdatedAt = now_(); updateRowByObj_('Participants', p);
  audit_('ASSIGN_TABLE', 'TableAssignments', participantId, tableId + (displaced ? (' | displaced ' + displaced) : '') + (reason ? (' | ' + reason) : ''));
  return { ok: true, displaced: displaced, tableName: t.TableName };
}

/* =====================================================  JUDGE LOOKUPS + SUBMIT  ============== */
function buildProjectCard_(p, tableName) {
  return { participantId: p.ParticipantID, regNo: p.RegNo, title: p.Title, schoolName: p.SchoolName,
    category: p.Category, entryType: p.EntryType || 'Project', leadName: p.LeadName, teamMembers: p.TeamMembers,
    grade: p.Grade, supervisor: p.Supervisor, tableName: tableName || p.TableName,
    timeLimit: (String(p.EntryType || '').toLowerCase() === 'poster') ? '3 minutes (Poster)' : '5 minutes (Project)' };
}
function jvContext(token) {
  var ctx = requireCtx_(token, ['judge']);
  var judge = readSheet_('Judges').rows.filter(function(r){ return r.JudgeID === ctx.subject; })[0];
  if (!judge) throw new Error('Judge account not found.');
  return { judge: { id: judge.JudgeID, name: judge.Name }, rubric: RUBRIC, settings: publicSettings_(), myEvals: myEvals_(judge.JudgeID) };
}
function jvFindTable(token, tableName) {
  requireCtx_(token, ['judge', 'admin']);
  var key = String(tableName || '').trim().toLowerCase(); if (!key) return null;
  var table = readSheet_('Tables').rows.filter(function(r){ return String(r.TableName || '').trim().toLowerCase() === key; })[0];
  if (!table) return { notFound: true, message: 'No table named "' + tableName + '" exists.' };
  var active = readSheet_('TableAssignments').rows.filter(function(r){ return r.TableID === table.TableID && String(r.Active) === 'true'; })[0];
  if (!active) return { vacant: true, tableName: table.TableName, message: 'Table ' + table.TableName + ' has no participant assigned.' };
  var p = readSheet_('Participants').rows.filter(function(r){ return r.ParticipantID === active.ParticipantID; })[0];
  if (!p) return { vacant: true, tableName: table.TableName, message: 'Assigned participant record is missing.' };
  return buildProjectCard_(p, table.TableName);
}
function jvSearch(token, query) {
  requireCtx_(token, ['judge', 'admin']);
  var q = String(query || '').trim().toLowerCase(); if (q.length < 2) return [];
  return readSheet_('Participants').rows.filter(function(p){
    return [p.Title, p.SchoolName, p.Category, p.LeadName, p.RegNo, p.ParticipantID, p.TableName].some(function(v){ return String(v || '').toLowerCase().indexOf(q) !== -1; });
  }).slice(0, 25).map(function(p){ return buildProjectCard_(p, p.TableName); });
}
function jvSubmit(token, payload) {
  var ctx = requireCtx_(token, ['judge', 'admin']);
  var settings = getSettingsMap_();
  var judge = ctx.role === 'judge'
    ? readSheet_('Judges').rows.filter(function(r){ return r.JudgeID === ctx.subject; })[0]
    : readSheet_('Judges').rows.filter(function(r){ return r.JudgeID === payload.judgeId; })[0];
  if (!judge) throw new Error('Judge account not found.');
  var p = readSheet_('Participants').rows.filter(function(r){ return r.ParticipantID === payload.participantId; })[0];
  if (!p) throw new Error('Project not found.');
  var cat = readSheet_('Categories').rows.filter(function(r){ return r.Name === p.Category || r.CategoryID === p.Category; })[0];
  var scores = [payload.c1, payload.c2, payload.c3, payload.c4].map(Number);
  scores.forEach(function(s, i){ if (isNaN(s) || s < 0 || s > 10) throw new Error('Score for "' + RUBRIC.criteria[i].name + '" must be between 0 and 10.'); });
  var raw = scores[0] + scores[1] + scores[2] + scores[3], penalty = payload.overTime ? 1 : 0;
  var total = Math.max(0, raw - penalty), pct = Math.round((total / RUBRIC.maxTotal) * 1000) / 10;
  var lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    var existing = readSheet_('Evaluations').rows.filter(function(r){ return r.ParticipantID === payload.participantId && r.JudgeID === judge.JudgeID && String(r.Status) === 'Submitted'; })[0];
    if (existing && !payload.correctionOf) throw new Error('You have already evaluated this project (ref ' + existing.EvaluationID + '). Use "Correct my evaluation" to revise it.');
    if (existing && payload.correctionOf) {
      if (String(settings.AllowJudgeCorrect) !== 'true') throw new Error('Corrections are disabled by the administrator.');
      existing.Status = 'Corrected'; existing.UpdatedAt = now_(); updateRowByObj_('Evaluations', existing);
    }
    var evalId = nextId_('EVL', 'Evaluations', 'EvaluationID');
    appendRow_('Evaluations', { EvaluationID: evalId, ParticipantID: p.ParticipantID, SchoolID: p.SchoolID, CategoryID: cat ? cat.CategoryID : p.Category, TableID: p.TableID, JudgeID: judge.JudgeID, JudgeName: judge.Name, RubricID: RUBRIC.id, RubricVersion: RUBRIC.version, C1: scores[0], C2: scores[1], C3: scores[2], C4: scores[3], TimePenalty: penalty, Total: total, MaxTotal: RUBRIC.maxTotal, Percentage: pct, Comments: payload.comments || '', Status: 'Submitted', CreatedAt: now_(), SubmittedAt: now_(), UpdatedAt: now_(), CorrectionReason: payload.correctionReason || '' });
    RUBRIC.criteria.forEach(function(c, i){ appendRow_('EvaluationResponses', { EvaluationID: evalId, CriterionID: c.id, CriterionName: c.name, BandLabel: bandFor_(scores[i]), Points: scores[i] }); });
    audit_('SUBMIT_EVAL', 'Evaluations', evalId, 'Participant ' + p.ParticipantID + ' total ' + total);
    return { evaluationId: evalId, total: total, percentage: pct };
  } finally { lock.releaseLock(); }
}
function bandFor_(s) { if (s <= 2) return '0-2'; if (s <= 4) return '3-4'; if (s <= 6) return '5-6'; if (s <= 8) return '7-8'; return '9-10'; }
function jvMyEvals(token) { var ctx = requireCtx_(token, ['judge', 'admin']); return myEvals_(ctx.subject); }
function myEvals_(judgeId) {
  return readSheet_('Evaluations').rows.filter(function(r){ return String(r.Status) === 'Submitted' && r.JudgeID === judgeId; })
    .map(function(r){ return { evaluationId: r.EvaluationID, participantId: r.ParticipantID, total: r.Total, percentage: r.Percentage, submittedAt: r.SubmittedAt }; })
    .sort(function(a, b){ return new Date(b.submittedAt) - new Date(a.submittedAt); });
}
function jvAddRequest(token, payload) {
  var ctx = requireCtx_(token, ['judge', 'admin']);
  appendRow_('RegistrationRequests', { RequestID: nextId_('REQ', 'RegistrationRequests', 'RequestID'), Source: 'Judge:' + ctx.subject, SourceKey: '', SchoolName: payload.schoolName || '', Title: payload.title || '', Category: payload.category || '', Names: payload.names || '', TableName: payload.tableName || '', Status: 'Pending', CreatedAt: now_(), ReviewNote: '' });
  return { pending: true };
}
function listRegistrationRequests(token) { requireCtx_(token, ['admin']); return readSheet_('RegistrationRequests').rows.filter(function(r){ return String(r.Status) === 'Pending'; }); }

/* =====================================================  SCORING + RANKINGS  ================== */
function aggregate_(totals, method) {
  if (!totals.length) return 0;
  if (method === 'sum') return round2_(totals.reduce(function(a,b){ return a+b; }, 0));
  if (method === 'median') { var s = totals.slice().sort(function(a,b){ return a-b; }), m = Math.floor(s.length/2); return round2_(s.length % 2 ? s[m] : (s[m-1]+s[m])/2); }
  return round2_(totals.reduce(function(a,b){ return a+b; }, 0) / totals.length);
}
function round2_(n) { return Math.round(n * 100) / 100; }
function computeProjectResults_() {
  var settings = getSettingsMap_(), method = settings.ScoringAggregation || 'average';
  var participants = readSheet_('Participants').rows, categories = readSheet_('Categories').rows;
  var schoolEmirate = {}; readSheet_('Schools').rows.forEach(function(s){ schoolEmirate[s.SchoolID] = s.Emirate || ''; });
  var evals = readSheet_('Evaluations').rows.filter(function(r){ return String(r.Status) === 'Submitted'; });
  var byP = {}; evals.forEach(function(e){ (byP[e.ParticipantID] = byP[e.ParticipantID] || []).push(Number(e.Total)); });
  return participants.map(function(p){
    var cat = categories.filter(function(c){ return c.Name === p.Category || c.CategoryID === p.Category; })[0];
    var req = cat && cat.JudgesRequired ? Number(cat.JudgesRequired) : 1, totals = byP[p.ParticipantID] || [];
    var fs = aggregate_(totals, method);
    return { participantId: p.ParticipantID, title: p.Title, schoolId: p.SchoolID, schoolName: p.SchoolName,
      emirate: p.Emirate || schoolEmirate[p.SchoolID] || 'Unspecified',
      category: p.Category, tableName: p.TableName, leadName: p.LeadName, judgeCount: totals.length, required: req,
      finalScore: fs, maxScore: RUBRIC.maxTotal, percentage: round2_((fs / RUBRIC.maxTotal) * 100),
      eligible: totals.length >= req && String(p.RegStatus || 'Registered').toLowerCase() !== 'pending' };
  });
}
function getRankings(token) {
  requireCtx_(token, ['admin', 'viewer']);
  var settings = getSettingsMap_(), results = computeProjectResults_(), eligible = results.filter(function(r){ return r.eligible; });
  var byCat = {}; eligible.forEach(function(r){ (byCat[r.category] = byCat[r.category] || []).push(r); });
  var categoryRankings = Object.keys(byCat).sort().map(function(cat){ var list = byCat[cat].sort(function(a,b){ return b.finalScore - a.finalScore; }); list.forEach(function(r, i){ r.rank = i + 1; }); return { category: cat, projects: list }; });
  var rankKey = (settings.OverallRankMethod === 'raw') ? 'finalScore' : 'percentage';
  var top10 = eligible.slice().sort(function(a,b){ return b[rankKey] - a[rankKey]; }).slice(0, 10); top10.forEach(function(r, i){ r.overallRank = i + 1; });
  var schoolMethod = settings.SchoolRankingMethod || 'avgEligible', bySchool = {};
  results.forEach(function(r){ var s = (bySchool[r.schoolName] = bySchool[r.schoolName] || { school: r.schoolName, projects: 0, eligible: 0, totalPoints: 0, scores: [] }); s.projects++; if (r.eligible) { s.eligible++; s.totalPoints += r.finalScore; s.scores.push(r.finalScore); } });
  var schoolRankings = Object.keys(bySchool).map(function(k){ var s = bySchool[k]; s.metric = schoolMethod === 'totalPoints' ? round2_(s.totalPoints) : (s.scores.length ? round2_(s.totalPoints / s.scores.length) : 0); return s; }).sort(function(a,b){ return b.metric - a.metric; });
  schoolRankings.forEach(function(s, i){ s.rank = i + 1; });

  // Emirate-wise: fair method = MEAN of eligible project percentage scores (not volume), with the
  // count of top-3 category placements as a transparent tie-breaker. Both figures are shown.
  var placements = {};
  categoryRankings.forEach(function(c){ c.projects.slice(0, 3).forEach(function(r){ var e = r.emirate || 'Unspecified'; placements[e] = (placements[e] || 0) + 1; }); });
  var byEmirate = {};
  results.forEach(function(r){
    var e = r.emirate || 'Unspecified';
    var s = (byEmirate[e] = byEmirate[e] || { emirate: e, schools: {}, projects: 0, eligible: 0, pctSum: 0, topProject: null, schoolScores: {}, projectList: [] });
    s.projects++; if (r.schoolName) s.schools[r.schoolName] = true;
    if (r.eligible) {
      s.eligible++; s.pctSum += r.percentage;
      s.projectList.push({ title: r.title, school: r.schoolName, category: r.category, table: r.tableName, pct: r.percentage, score: r.finalScore, leadName: r.leadName });
      if (!s.topProject || r.percentage > s.topProject.percentage) s.topProject = { title: r.title, schoolName: r.schoolName, percentage: r.percentage, finalScore: r.finalScore };
      var ss = (s.schoolScores[r.schoolName] = s.schoolScores[r.schoolName] || { sum: 0, n: 0 });
      ss.sum += r.percentage; ss.n++;
    }
  });
  var emirateRankings = Object.keys(byEmirate).map(function(k){
    var s = byEmirate[k];
    s.schoolCount = Object.keys(s.schools).length; delete s.schools;
    s.avgPct = s.eligible ? round2_(s.pctSum / s.eligible) : 0; delete s.pctSum;
    s.placements = placements[k] || 0;
    s.topSchool = null;
    s.schoolList = Object.keys(s.schoolScores).map(function(name){ var x = s.schoolScores[name]; var a = round2_(x.sum / x.n); if (!s.topSchool || a > s.topSchool.avgPct) s.topSchool = { school: name, avgPct: a }; return { school: name, avgPct: a, projects: x.n }; }).sort(function(a, b){ return b.avgPct - a.avgPct; });
    delete s.schoolScores;
    s.projects_list = s.projectList.sort(function(a, b){ return b.pct - a.pct; }); delete s.projectList;
    return s;
  }).sort(function(a, b){ return (b.avgPct - a.avgPct) || (b.placements - a.placements); });
  emirateRankings.forEach(function(s, i){ s.rank = i + 1; });

  return { published: true, final: String(settings.ResultsFinal) === 'true',
    method: { overall: rankKey, school: schoolMethod, aggregation: settings.ScoringAggregation || 'average', emirate: 'Average of eligible project % (tie-break: top-3 placements)' },
    categoryRankings: categoryRankings, overallTop10: top10, schoolRankings: schoolRankings, emirateRankings: emirateRankings, generatedAt: now_() };
}

/* =====================================================  DASHBOARD  ============================ */
function getDashboardData(token) {
  requireCtx_(token, ['admin', 'viewer']);
  return dashboardData_();
}
function dashboardData_() {
  var settings = getSettingsMap_();
  var schools = readSheet_('Schools').rows, participants = readSheet_('Participants').rows, categories = readSheet_('Categories').rows,
      judges = readSheet_('Judges').rows, tables = readSheet_('Tables').rows,
      evals = readSheet_('Evaluations').rows.filter(function(r){ return String(r.Status) === 'Submitted'; }), results = computeProjectResults_();
  var expected = participants.reduce(function(sum, p){ var c = categories.filter(function(x){ return x.Name === p.Category; })[0]; return sum + (c && c.JudgesRequired ? Number(c.JudgesRequired) : 1); }, 0);
  var completed = evals.length, fullyEvaluated = results.filter(function(r){ return r.eligible; }).length;
  var catScore = {}; results.forEach(function(r){ if (r.judgeCount) { catScore[r.category] = catScore[r.category] || { sum: 0, n: 0 }; catScore[r.category].sum += r.finalScore; catScore[r.category].n++; } });
  var avgByCategory = Object.keys(catScore).map(function(c){ return [c, round2_(catScore[c].sum / catScore[c].n)]; });
  var schoolPart = {}; participants.forEach(function(p){ schoolPart[p.SchoolName] = (schoolPart[p.SchoolName] || 0) + 1; });
  var schoolParticipation = Object.keys(schoolPart).map(function(s){ return [s, schoolPart[s]]; });
  var dist = [0,0,0,0]; results.filter(function(r){ return r.judgeCount; }).forEach(function(r){ dist[Math.min(3, Math.floor(r.finalScore / 10))]++; });
  var activeAssign = readSheet_('TableAssignments').rows.filter(function(r){ return String(r.Active) === 'true'; });
  var occ = {}, conflicts = 0; activeAssign.forEach(function(a){ if (occ[a.TableID]) conflicts++; occ[a.TableID] = true; });
  var unassigned = participants.filter(function(p){ return !p.TableID; }).length;
  return {
    settings: settings,
    cards: { schools: schools.filter(function(s){ return String(s.Status || 'Active') !== 'Inactive'; }).length, participants: participants.length, categories: categories.length, judges: judges.filter(function(j){ return String(j.Status || 'Active') !== 'Inactive'; }).length, tables: tables.length, expected: expected, completed: completed, pending: Math.max(0, expected - completed), percentComplete: expected ? Math.round((completed / expected) * 100) : 0, fullyEvaluated: fullyEvaluated, incomplete: participants.length - fullyEvaluated, conflicts: conflicts, unassigned: unassigned, avgScore: evals.length ? round2_(avg_(evals.map(function(e){ return Number(e.Total); }))) : 0 },
    charts: { avgByCategory: avgByCategory, schoolParticipation: schoolParticipation, scoreDistribution: [['0-10', dist[0]], ['10-20', dist[1]], ['20-30', dist[2]], ['30-40', dist[3]]] },
    recent: evals.slice(-8).reverse().map(function(e){ return { ref: e.EvaluationID, judge: e.JudgeName, total: e.Total, at: e.SubmittedAt }; }),
    refreshedAt: now_()
  };
}

/* =====================================================  SETTINGS  ============================= */
function setSetting(token, key, value) {
  requireCtx_(token, ['admin']);
  var data = readSheet_('Settings'), found = null;
  data.rows.forEach(function(r){ if (r.Key === key) found = r; });
  if (found) { found.Value = value; updateRowByObj_('Settings', found); } else appendRow_('Settings', { Key: key, Value: value });
  audit_('SET_SETTING', 'Settings', key, String(value)); return { ok: true };
}

/* =====================================================  CSV IMPORT / EXPORT  ================= */
function getImportTemplate(token, entity) {
  requireCtx_(token, ['admin']);
  var cfg = ENTITY[entity]; if (!cfg) throw new Error('Unknown entity');
  var omit = { SchoolID: (entity !== 'participants'), CreatedAt: true, UpdatedAt: true, Status: true, SchoolName: true };
  var cols = SCHEMA[cfg.sheet].filter(function(h){ return h !== SCHEMA[cfg.sheet][0] && !omit[h]; });
  if (entity === 'participants') cols.unshift('SchoolName');
  return cols.join(',') + '\n';
}
function importCsv(token, entity, csvText) {
  requireCtx_(token, ['admin']);
  var cfg = ENTITY[entity]; if (!cfg) throw new Error('Import not supported for: ' + entity);
  var rows = Utilities.parseCsv(csvText); if (rows.length < 2) throw new Error('The CSV has no data rows.');
  var headers = rows[0].map(function(h){ return String(h).trim(); });
  var existing = readSheet_(cfg.sheet).rows, schools = readSheet_('Schools').rows, added = 0, skipped = 0, errors = [];
  for (var i = 1; i < rows.length; i++) {
    var rec = {}; headers.forEach(function(h, c){ rec[h] = rows[i][c]; });
    if (Object.keys(rec).every(function(k){ return !String(rec[k]).trim(); })) continue;
    try {
      cfg.required.forEach(function(f){ if (!rec[f] && rec[f] !== 0) throw new Error('Missing ' + f); });
      if (entity === 'participants' && !rec.SchoolID && rec.SchoolName) { var sm = schools.filter(function(s){ return String(s.Name).trim().toLowerCase() === String(rec.SchoolName).trim().toLowerCase(); })[0]; if (sm) rec.SchoolID = sm.SchoolID; else throw new Error('School not found: ' + rec.SchoolName); }
      if (entity === 'participants' && rec.SchoolID) { var sx = schools.filter(function(s){ return s.SchoolID === rec.SchoolID; })[0]; if (sx) rec.SchoolName = sx.Name; }
      if (cfg.dupKeys.some(function(k){ return rec[k] && existing.some(function(r){ return String(r[k]||'').trim().toLowerCase() === String(rec[k]).trim().toLowerCase(); }); })) { skipped++; continue; }
      var idField = SCHEMA[cfg.sheet][0]; rec[idField] = nextId_(cfg.prefix, cfg.sheet, idField);
      if (SCHEMA[cfg.sheet].indexOf('Status') !== -1 && !rec.Status) rec.Status = 'Active';
      if (SCHEMA[cfg.sheet].indexOf('CreatedAt') !== -1) rec.CreatedAt = now_();
      if (SCHEMA[cfg.sheet].indexOf('UpdatedAt') !== -1) rec.UpdatedAt = now_();
      appendRow_(cfg.sheet, rec); existing.push(rec); added++;
    } catch (err) { errors.push({ row: i + 1, error: err.message }); appendRow_('ImportErrors', { Timestamp: now_(), Entity: entity, RowNum: i + 1, Error: err.message, RawData: rows[i].join(' | ') }); }
  }
  audit_('IMPORT', cfg.sheet, entity, 'added ' + added + ' skipped ' + skipped); return { added: added, skipped: skipped, errorCount: errors.length, errors: errors.slice(0, 50) };
}
function exportReport(token, reportKey) {
  requireCtx_(token, ['admin', 'viewer']);
  var r = getRankings(token), csv, filename, yr = new Date().getFullYear();
  if (reportKey === 'overallTop10') { csv = toCsv_([['Rank','Project','School','Category','Final Score','Max','Percentage','Judges']].concat(r.overallTop10.map(function(x){ return [x.overallRank, x.title, x.schoolName, x.category, x.finalScore, x.maxScore, x.percentage + '%', x.judgeCount]; }))); filename = 'MASE_OverallTop10_' + yr + '.csv'; }
  else if (reportKey === 'schools') { csv = toCsv_([['Rank','School','Projects','Eligible','Metric']].concat(r.schoolRankings.map(function(x){ return [x.rank, x.school, x.projects, x.eligible, x.metric]; }))); filename = 'MASE_SchoolPerformance_' + yr + '.csv'; }
  else { var flat = [['Category','Rank','Project','School','Final Score','Percentage','Judges']]; r.categoryRankings.forEach(function(c){ c.projects.forEach(function(x){ flat.push([c.category, x.rank, x.title, x.schoolName, x.finalScore, x.percentage + '%', x.judgeCount]); }); }); csv = toCsv_(flat); filename = 'MASE_CategoryResults_' + yr + '.csv'; }
  return { filename: filename, csv: csv };
}
function exportEntityCsv(token, entity) {
  requireCtx_(token, ['admin']);
  var cfg = ENTITY[entity], data = readSheet_(cfg.sheet);
  var rows = [data.headers].concat(data.rows.map(function(r){ return data.headers.map(function(h){ return r[h]; }); }));
  return { filename: 'MASE_' + cfg.sheet + '_' + new Date().getFullYear() + '.csv', csv: toCsv_(rows) };
}
function toCsv_(rows) { return rows.map(function(r){ return r.map(function(v){ v = (v === undefined || v === null) ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(','); }).join('\n'); }

/* =====================================================  REGISTRATION IMPORT (mapped)  ======== */
// The admin uploads ONE registration CSV, maps its columns to fields, and imports everything:
// schools and categories are auto-created from the file, participants are created, and any table
// numbers present are wired up so judges can search them immediately. Writes are batched for speed.

var REG_FIELDS = ['Title','SchoolName','Emirate','Category','EntryType','LeadName','TeamMembers','Grade','RegNo','Email','Contact','Supervisor','TableName'];

function previewRegistrationCsv(token, csvText) {
  requireCtx_(token, ['admin']);
  var rows = Utilities.parseCsv(csvText);
  if (!rows.length) throw new Error('The file is empty.');
  return { headers: rows[0].map(function(h){ return String(h).trim(); }), sample: rows.slice(1, 4), total: Math.max(0, rows.length - 1), fields: REG_FIELDS };
}

function maxIdNum_(rows, idField) { var m = 0; rows.forEach(function(r){ var x = String(r[idField] || '').match(/(\d+)\s*$/); if (x) m = Math.max(m, parseInt(x[1], 10)); }); return m; }
function batchAppend_(name, objs) {
  if (!objs.length) return;
  var sh = getSheet_(name), headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var out = objs.map(function(o){ return objToRow_(o, headers); });
  sh.getRange(sh.getLastRow() + 1, 1, out.length, headers.length).setValues(out);
}

function importRegistrations(token, csvText, mapping) {
  requireCtx_(token, ['admin']);
  if (!mapping || !mapping.Title) throw new Error('Please map the Project Title column at minimum.');
  var rows = Utilities.parseCsv(csvText);
  if (rows.length < 2) throw new Error('The file has no data rows.');
  var headers = rows[0].map(function(h){ return String(h).trim(); });
  var idx = {}; headers.forEach(function(h, i){ idx[h] = i; });
  function val(row, field) { var col = mapping[field]; if (!col) return ''; var i = idx[col]; return (i == null) ? '' : String(row[i] == null ? '' : row[i]).trim(); }

  var schools = readSheet_('Schools').rows, cats = readSheet_('Categories').rows,
      tables = readSheet_('Tables').rows, parts = readSheet_('Participants').rows,
      aAll = readSheet_('TableAssignments').rows;
  var sBy = {}; schools.forEach(function(s){ sBy[String(s.Name).trim().toLowerCase()] = s; });
  var cBy = {}; cats.forEach(function(c){ cBy[String(c.Name).trim().toLowerCase()] = c; });
  var tBy = {}; tables.forEach(function(t){ tBy[String(t.TableName).trim().toLowerCase()] = t; });
  var regNos = {}; parts.forEach(function(p){ if (p.RegNo) regNos[String(p.RegNo).trim().toLowerCase()] = true; });
  var occTable = {}; aAll.forEach(function(a){ if (String(a.Active) === 'true') occTable[a.TableID] = true; });

  var sSeq = maxIdNum_(schools, 'SchoolID'), cSeq = maxIdNum_(cats, 'CategoryID'),
      tSeq = maxIdNum_(tables, 'TableID'), pSeq = maxIdNum_(parts, 'ParticipantID'), aSeq = maxIdNum_(aAll, 'AssignmentID');
  var newSchools = [], newCats = [], newTables = [], newParts = [], newAssigns = [];
  var added = 0, skipped = 0, errors = [];

  var lock = LockService.getScriptLock(); lock.waitLock(25000);
  try {
    for (var i = 1; i < rows.length; i++) {
      var row = rows[i];
      if (row.every(function(v){ return !String(v).trim(); })) continue;
      try {
        var title = val(row, 'Title');
        if (!title) throw new Error('Missing project title');
        var schoolName = val(row, 'SchoolName'), catName = val(row, 'Category'), emirate = val(row, 'Emirate');

        var school = null;
        if (schoolName) {
          school = sBy[schoolName.toLowerCase()];
          if (!school) { school = { SchoolID: 'SCH-' + pad_(++sSeq, 4), Name: schoolName, Emirate: emirate, Status: 'Active', CreatedAt: now_(), UpdatedAt: now_() }; sBy[schoolName.toLowerCase()] = school; newSchools.push(school); }
        }
        var cat = null;
        if (catName) {
          cat = cBy[catName.toLowerCase()];
          if (!cat) { cat = { CategoryID: 'CAT-' + pad_(++cSeq, 4), Name: catName, JudgesRequired: 1, Status: 'Active' }; cBy[catName.toLowerCase()] = cat; newCats.push(cat); }
        }
        var regNo = val(row, 'RegNo');
        if (regNo && regNos[regNo.toLowerCase()]) { skipped++; continue; }

        var tableName = val(row, 'TableName'), assignTableId = '', tbl = null;
        if (tableName) {
          tbl = tBy[tableName.toLowerCase()];
          if (!tbl) { tbl = { TableID: 'TBL-' + pad_(++tSeq, 4), TableName: tableName, Status: 'Active', UpdatedAt: now_() }; tBy[tableName.toLowerCase()] = tbl; newTables.push(tbl); }
          if (!occTable[tbl.TableID]) { assignTableId = tbl.TableID; occTable[tbl.TableID] = true; }
        }

        var pid = 'PRT-' + pad_(++pSeq, 4);
        newParts.push({ ParticipantID: pid, RegNo: regNo, SchoolID: school ? school.SchoolID : '', SchoolName: school ? school.Name : schoolName,
          Title: title, Category: cat ? cat.Name : catName, EntryType: val(row, 'EntryType') || 'Project',
          LeadName: val(row, 'LeadName'), TeamMembers: val(row, 'TeamMembers'), Grade: val(row, 'Grade'),
          Contact: val(row, 'Contact'), Email: val(row, 'Email'), Supervisor: val(row, 'Supervisor'),
          TableID: assignTableId, TableName: tbl ? tbl.TableName : tableName, Emirate: school ? (school.Emirate || emirate) : emirate,
          RegStatus: 'Registered', ProjectStatus: 'Active', CreatedAt: now_(), UpdatedAt: now_() });
        if (assignTableId) newAssigns.push({ AssignmentID: 'ASG-' + pad_(++aSeq, 4), TableID: assignTableId, TableName: tbl.TableName, ParticipantID: pid, SchoolName: school ? school.Name : schoolName, Category: cat ? cat.Name : catName, Active: true, PrevTableID: '', User: 'import', Timestamp: now_(), Reason: 'Imported' });
        if (regNo) regNos[regNo.toLowerCase()] = true;
        added++;
      } catch (err) {
        errors.push({ row: i + 1, error: err.message });
        newParts.length; // no-op to keep loop structure clear
        appendRow_('ImportErrors', { Timestamp: now_(), Entity: 'registrations', RowNum: i + 1, Error: err.message, RawData: rows[i].join(' | ') });
      }
    }
    batchAppend_('Schools', newSchools);
    batchAppend_('Categories', newCats);
    batchAppend_('Tables', newTables);
    batchAppend_('Participants', newParts);
    batchAppend_('TableAssignments', newAssigns);
  } finally { lock.releaseLock(); }
  audit_('IMPORT_REG', 'Participants', 'registrations', 'added ' + added + ' schools ' + newSchools.length + ' cats ' + newCats.length);
  return { added: added, skipped: skipped, newSchools: newSchools.length, newCats: newCats.length, errorCount: errors.length, errors: errors.slice(0, 50) };
}

/* =====================================================  JUDGE ACTIVITY MONITOR  ============== */
function getJudgeActivity(token) {
  requireCtx_(token, ['admin']);
  var judges = readSheet_('Judges').rows;
  var auth = {}; readSheet_('JudgeAuth').rows.forEach(function(a){ auth[a.JudgeID] = a; });
  var evals = readSheet_('Evaluations').rows.filter(function(r){ return String(r.Status) === 'Submitted'; });
  var byJudge = {}; evals.forEach(function(e){ (byJudge[e.JudgeID] = byJudge[e.JudgeID] || []).push(e); });
  return judges.map(function(j){
    var mine = byJudge[j.JudgeID] || [];
    var last = 0; mine.forEach(function(e){ var t = new Date(e.SubmittedAt).getTime(); if (t > last) last = t; });
    var a = auth[j.JudgeID];
    return { judgeId: j.JudgeID, name: j.Name, email: j.Email, categories: j.Categories || '', status: j.Status || 'Active',
      submitted: mine.length, lastAt: last ? new Date(last) : '', hasCode: !!(a && a.AccessCode), lastLogin: a ? a.LastLoginAt : '' };
  }).sort(function(a, b){ return b.submitted - a.submitted; });
}

/* =====================================================  AWARDS  =============================== */
function getAwardSuggestions(token) {
  requireCtx_(token, ['admin']);
  var r = getRankings(token);
  var places = ['1st Place', '2nd Place', '3rd Place'], out = [];
  r.categoryRankings.forEach(function(c){
    c.projects.slice(0, 3).forEach(function(p, i){
      out.push({ Name: c.category + ' — ' + places[i], Scope: 'Category', Rule: c.category + ' rank ' + (i + 1), WinnerParticipantID: p.participantId, Title: p.title, SchoolID: p.schoolId, SchoolName: p.schoolName, Category: c.category, Score: p.finalScore, Percentage: p.percentage });
    });
  });
  r.overallTop10.slice(0, 3).forEach(function(p, i){
    out.push({ Name: 'Overall ' + places[i], Scope: 'Overall', Rule: 'Overall rank ' + (i + 1), WinnerParticipantID: p.participantId, Title: p.title, SchoolID: p.schoolId, SchoolName: p.schoolName, Category: p.category, Score: p.finalScore, Percentage: p.percentage });
  });
  return out;
}
function autoGenerateAwards(token) {
  requireCtx_(token, ['admin']);
  var sugg = getAwardSuggestions(token);
  var have = {}; readSheet_('Awards').rows.forEach(function(a){ have[a.Name + '|' + a.WinnerParticipantID] = true; });
  var added = 0;
  sugg.forEach(function(s){
    if (have[s.Name + '|' + s.WinnerParticipantID]) return;
    appendRow_('Awards', { AwardID: nextId_('AWD', 'Awards', 'AwardID'), Name: s.Name, Scope: s.Scope, Rule: s.Rule, WinnerParticipantID: s.WinnerParticipantID, SchoolID: s.SchoolID, Status: 'Confirmed', ConfirmedAt: now_(), Notes: s.Title + ' (' + s.SchoolName + ')' });
    added++;
  });
  audit_('AWARDS_AUTO', 'Awards', '', 'added ' + added);
  return { added: added };
}
function listAwards(token) {
  requireCtx_(token, ['admin', 'viewer']);
  var pById = {}; readSheet_('Participants').rows.forEach(function(p){ pById[p.ParticipantID] = p; });
  return readSheet_('Awards').rows.filter(function(a){ return String(a.Status) !== 'Removed'; }).map(function(a){
    var p = pById[a.WinnerParticipantID] || {};
    return { awardId: a.AwardID, name: a.Name, scope: a.Scope, rule: a.Rule, winnerId: a.WinnerParticipantID,
      title: p.Title || '', schoolName: p.SchoolName || '', category: p.Category || '', leadName: p.LeadName || '', emirate: p.Emirate || '', confirmedAt: a.ConfirmedAt };
  });
}
function removeAward(token, awardId) {
  requireCtx_(token, ['admin']);
  var data = readSheet_('Awards'), t = data.rows.filter(function(a){ return a.AwardID === awardId; })[0];
  if (!t) throw new Error('Award not found.');
  t.Status = 'Removed'; updateRowByObj_('Awards', t);
  audit_('AWARD_REMOVE', 'Awards', awardId, ''); return { ok: true };
}
function clearAwards(token) {
  requireCtx_(token, ['admin']);
  var data = readSheet_('Awards'); data.rows.forEach(function(a){ if (String(a.Status) !== 'Removed') { a.Status = 'Removed'; updateRowByObj_('Awards', a); } });
  return { ok: true };
}

/* =====================================================  V2 CONSOLE DATA  ===================== */
function avg_(a){ return a.length ? a.reduce(function(x,y){return x+y;},0)/a.length : 0; }
function stdev_(a){ if(a.length<2) return 0; var m=avg_(a); return Math.sqrt(a.reduce(function(s,x){return s+Math.pow(x-m,2);},0)/a.length); }

// Control-centre overview (Overview screen).
function getOverview(token){
  requireCtx_(token, ['admin','viewer']);
  var s = getSettingsMap_();
  var d = dashboardData_();
  var results = computeProjectResults_();
  var parts = readSheet_('Participants').rows; var pById = {}; parts.forEach(function(p){ pById[p.ParticipantID]=p; });
  var evals = readSheet_('Evaluations').rows.filter(function(r){ return String(r.Status)==='Submitted'; });

  var unscored = results.filter(function(r){ return r.judgeCount < r.required; })
    .sort(function(a,b){ return a.judgeCount-b.judgeCount; }).slice(0,10)
    .map(function(r){ return { title:r.title, school:r.schoolName, category:r.category, table:r.tableName, status: r.judgeCount>0?'In progress':'Pending' }; });

  var latest = evals.slice(-6).reverse().map(function(e){ var p=pById[e.ParticipantID]||{};
    return { title:p.Title||e.ParticipantID, judge:e.JudgeName, score:e.Total, max:e.MaxTotal, pct:e.Percentage, ref:e.EvaluationID }; });

  var stateOrder = ['Setup','Judging Open','Judging Closed','Under Review','Results Final','Published'];
  var current = s.CompetitionState || 'Judging Open';

  return {
    exhibitionName: s.ExhibitionName || 'MASE Exhibition',
    stateOrder: stateOrder, currentState: current,
    cards: d.cards,
    progress: { recorded: evals.length, expected: d.cards.expected, pct: d.cards.percentComplete },
    needsModeration: getModerationList_().length,
    pendingApprovals: readSheet_('RegistrationRequests').rows.filter(function(r){ return String(r.Status)==='Pending'; }).length,
    unscored: unscored, latest: latest, refreshedAt: now_()
  };
}

// Judge workload monitor (Judge Monitor screen).
function getJudgeMonitor(token){
  requireCtx_(token, ['admin']);
  var judges = readSheet_('Judges').rows;
  var auth = {}; readSheet_('JudgeAuth').rows.forEach(function(a){ auth[a.JudgeID]=a; });
  var evals = readSheet_('Evaluations').rows.filter(function(r){ return String(r.Status)==='Submitted'; });
  var parts = readSheet_('Participants').rows;
  var assigns = readSheet_('JudgeAssignments').rows;
  var globalAvg = avg_(evals.map(function(e){ return Number(e.Total); }));

  var rows = judges.map(function(j){
    var mine = evals.filter(function(e){ return e.JudgeID===j.JudgeID; });
    var scored = mine.length;
    var asg = assigns.filter(function(a){ return a.JudgeID===j.JudgeID; });
    var quota;
    if (asg.length) quota = asg.length;
    else {
      var cats = String(j.Categories||'').split(',').map(function(x){ return x.trim().toLowerCase(); }).filter(Boolean);
      quota = cats.length ? parts.filter(function(p){ return cats.indexOf(String(p.Category).toLowerCase())>-1; }).length : parts.length;
    }
    var avgGiven = scored ? round2_(avg_(mine.map(function(e){ return Number(e.Total); }))) : 0;
    var tendency = scored ? (avgGiven > globalAvg+2 ? 'Generous' : (avgGiven < globalAvg-2 ? 'Strict' : 'Balanced')) : '—';
    var last = 0; mine.forEach(function(e){ var t=new Date(e.SubmittedAt).getTime(); if(t>last) last=t; });
    var pct = quota ? Math.round(scored/quota*100) : 0;
    var status = scored===0 ? 'Idle' : (scored>=quota ? 'Completed' : 'In Progress');
    return { judgeId:j.JudgeID, name:j.Name, title:j.Title||'', institution:j.Institution||'', categories:j.Categories||'',
      scored:scored, quota:quota, pct:Math.min(100,pct), avgGiven:avgGiven, tendency:tendency,
      lastAt: last?new Date(last):'', status:status, hasCode: !!(auth[j.JudgeID]&&auth[j.JudgeID].AccessCode) };
  }).sort(function(a,b){ return b.scored-a.scored; });

  return { judges: rows,
    totals: { evaluations: evals.length, completed: rows.filter(function(r){return r.status==='Completed';}).length,
      inProgress: rows.filter(function(r){return r.status==='In Progress';}).length, idle: rows.filter(function(r){return r.status==='Idle';}).length } };
}

// Halls & tables board (Tables & Hall screen).
function getTablesBoard(token){
  requireCtx_(token, ['admin','viewer']);
  var tables = readSheet_('Tables').rows;
  var parts = readSheet_('Participants').rows; var byTable = {}; parts.forEach(function(p){ if(p.TableID) byTable[p.TableID]=p; });
  var cats = readSheet_('Categories').rows;
  var cnt = {}; readSheet_('Evaluations').rows.filter(function(r){ return String(r.Status)==='Submitted'; }).forEach(function(e){ cnt[e.ParticipantID]=(cnt[e.ParticipantID]||0)+1; });
  return tables.map(function(t){
    var p = byTable[t.TableID], status='Empty', project=null;
    if (p){
      var cat = cats.filter(function(c){ return c.Name===p.Category; })[0];
      var req = cat&&cat.JudgesRequired ? Number(cat.JudgesRequired) : 1;
      var n = cnt[p.ParticipantID]||0;
      status = n===0 ? 'Assigned' : (n>=req ? 'Fully Scored' : 'Being Judged');
      project = { title:p.Title, school:p.SchoolName, category:p.Category };
    }
    return { tableId:t.TableID, tableName:t.TableName, location:t.Location||'', floor:t.Floor||'', status:status, project:project };
  });
}

// Moderation (high-variance evaluations).
function getModerationList_(){
  var evals = readSheet_('Evaluations').rows.filter(function(r){ return String(r.Status)==='Submitted'; });
  var byP = {}; evals.forEach(function(e){ (byP[e.ParticipantID]=byP[e.ParticipantID]||[]).push(Number(e.Total)); });
  var parts = readSheet_('Participants').rows; var pById={}; parts.forEach(function(p){ pById[p.ParticipantID]=p; });
  var out = [];
  Object.keys(byP).forEach(function(pid){
    var arr = byP[pid]; if (arr.length<2) return;
    var sd = stdev_(arr); var spread = Math.max.apply(null,arr)-Math.min.apply(null,arr);
    if (spread >= 8 || sd >= 5){ var p=pById[pid]||{};
      out.push({ participantId:pid, title:p.Title, school:p.SchoolName, category:p.Category, judges:arr.length,
        min:round2_(Math.min.apply(null,arr)), max:round2_(Math.max.apply(null,arr)), spread:round2_(spread), stdev:round2_(sd) }); }
  });
  return out.sort(function(a,b){ return b.spread-a.spread; });
}
function getModeration(token){ requireCtx_(token,['admin']); return getModerationList_(); }

// Assignments engine.
function listJudgeAssignments(token){
  requireCtx_(token, ['admin']);
  var scored = {}; readSheet_('Evaluations').rows.filter(function(r){ return String(r.Status)==='Submitted'; }).forEach(function(e){ scored[e.JudgeID+'|'+e.ParticipantID]=true; });
  return readSheet_('JudgeAssignments').rows.map(function(a){ return {
    assignmentId:a.AssignmentID, judgeId:a.JudgeID, judgeName:a.JudgeName, participantId:a.ParticipantID,
    projectTitle:a.ProjectTitle, schoolName:a.SchoolName, category:a.Category, tableName:a.TableName,
    status: scored[a.JudgeID+'|'+a.ParticipantID] ? 'Scored' : 'Pending' }; });
}
function assignJudge(token, judgeId, participantId){
  requireCtx_(token, ['admin']);
  var j = readSheet_('Judges').rows.filter(function(x){ return x.JudgeID===judgeId; })[0]; if(!j) throw new Error('Judge not found.');
  var p = readSheet_('Participants').rows.filter(function(x){ return x.ParticipantID===participantId; })[0]; if(!p) throw new Error('Project not found.');
  if (readSheet_('JudgeAssignments').rows.some(function(a){ return a.JudgeID===judgeId && a.ParticipantID===participantId; })) throw new Error('That judge is already assigned to this project.');
  appendRow_('JudgeAssignments', { AssignmentID: nextId_('JAS','JudgeAssignments','AssignmentID'), JudgeID:judgeId, JudgeName:j.Name, ParticipantID:participantId, ProjectTitle:p.Title, SchoolName:p.SchoolName, Category:p.Category, TableName:p.TableName, Status:'Pending', CreatedAt:now_() });
  audit_('ASSIGN_JUDGE','JudgeAssignments',judgeId,participantId);
  return { ok:true };
}
function removeJudgeAssignment(token, id){
  requireCtx_(token, ['admin']);
  var d = readSheet_('JudgeAssignments'); var t = d.rows.filter(function(a){ return a.AssignmentID===id; })[0];
  if(!t) throw new Error('Assignment not found.'); d.sheet.deleteRow(t.__row);
  audit_('UNASSIGN_JUDGE','JudgeAssignments',id,''); return { ok:true };
}
function autoAssignJudges(token){
  requireCtx_(token, ['admin']);
  var judges = readSheet_('Judges').rows.filter(function(j){ return String(j.Status||'Active')!=='Inactive'; });
  var parts = readSheet_('Participants').rows, cats = readSheet_('Categories').rows;
  var existing = readSheet_('JudgeAssignments').rows; var have={}; existing.forEach(function(a){ have[a.JudgeID+'|'+a.ParticipantID]=true; });
  var byCat = {}; judges.forEach(function(j){ String(j.Categories||'').split(',').map(function(x){return x.trim();}).filter(Boolean).forEach(function(c){ (byCat[c.toLowerCase()]=byCat[c.toLowerCase()]||[]).push(j); }); });
  var load = {}; judges.forEach(function(j){ load[j.JudgeID]=existing.filter(function(a){return a.JudgeID===j.JudgeID;}).length; });
  var seq = maxIdNum_(existing,'AssignmentID'); var added=0; var rows=[];
  parts.forEach(function(p){
    var cat = cats.filter(function(c){ return c.Name===p.Category; })[0];
    var req = cat&&cat.JudgesRequired ? Number(cat.JudgesRequired) : 1;
    var pool = (byCat[String(p.Category).toLowerCase()] || judges).slice().sort(function(a,b){ return (load[a.JudgeID]||0)-(load[b.JudgeID]||0); });
    var placed = 0;
    for (var i=0; i<pool.length && placed<req; i++){
      var j = pool[i]; if (have[j.JudgeID+'|'+p.ParticipantID]) continue;
      rows.push({ AssignmentID:'JAS-'+pad_(++seq,4), JudgeID:j.JudgeID, JudgeName:j.Name, ParticipantID:p.ParticipantID, ProjectTitle:p.Title, SchoolName:p.SchoolName, Category:p.Category, TableName:p.TableName, Status:'Pending', CreatedAt:now_() });
      have[j.JudgeID+'|'+p.ParticipantID]=true; load[j.JudgeID]=(load[j.JudgeID]||0)+1; placed++; added++;
    }
  });
  batchAppend_('JudgeAssignments', rows);
  audit_('AUTO_ASSIGN','JudgeAssignments','','added '+added);
  return { added:added };
}

function getAuditLog(token){ requireCtx_(token,['admin']); return readSheet_('AuditLog').rows.slice(-150).reverse(); }

function getJudgeCodes(token){ requireCtx_(token,['admin']); var m={}; readSheet_('JudgeAuth').rows.forEach(function(a){ m[a.JudgeID]=a.AccessCode; }); return m; }

function getRegistrationSampleCsv(token){
  requireCtx_(token, ['admin']);
  var headers = ['Project Title','School Name','Emirate','Category','Entry Type','Lead Participant','Team Members','Grade','Registration No','Email','Contact','Supervisor','Table Number'];
  var sample = [
    ['Solar Water Purifier','Al Noor International School','Sharjah','Scientific Research','Project','Aisha Khan','Omar Rahman','Grade 11','MASE-26-101','aisha@example.com','0501234567','Ms. Fatima','A01'],
    ['Campus Recycling App','GEMS Modern Academy','Dubai','Business Innovation','Business','Omar Rahman','','Grade 12','MASE-26-102','omar@example.com','0557654321','Mr. John','A02'],
    ['Air Quality Poster','Ras Al Khaimah Academy','Ras Al Khaimah','Poster Presentation','Poster','Meera Ali','Sara K','Grade 10','MASE-26-103','meera@example.com','0509998877','Dr. Hassan','B01']
  ];
  return { filename:'MASE_registration_sample.csv', csv: toCsv_([headers].concat(sample)) };
}

/* =====================================================  GOOGLE FORM IMPORT  ================== */
// Understands the raw Google Form export: "Category Name" = project title, "Category" = type,
// "Group Name" = lead, "Group Name1..4" = team members. Re-uploading the whole sheet only adds
// new submissions (idempotent on School + Title).
function importGoogleForm(token, csvText){
  requireCtx_(token, ['admin']);
  var rows = Utilities.parseCsv(csvText);
  if (rows.length < 2) throw new Error('The file has no data rows.');
  var headers = rows[0].map(function(h){ return String(h).trim(); });
  function col(){ var names=[].slice.call(arguments).map(function(n){return n.toLowerCase();}); for(var i=0;i<headers.length;i++){ if(names.indexOf(headers[i].toLowerCase())>-1) return i; } return -1; }
  var iTitle = col('category name','project title','title','project / poster title','name of project');
  var iType = -1; for (var h=0;h<headers.length;h++){ if (headers[h].toLowerCase()==='category'){ iType=h; break; } }
  var iLead = col('group name','lead participant','lead student');
  var teamCols = []; for (var t=0;t<headers.length;t++){ if (/^group name\s*\d+$/i.test(headers[t].trim())) teamCols.push(t); }
  var iGrade=col('grade'), iSchool=col('school name','school'), iEmirate=col('emirate'),
      iPhone=col('phone','contact','mobile'), iEmail=col('email','e-mail'),
      iTeacher=col('teacher name','supervisor','teacher'), iTeacherEmail=col('teacher email'), iTeacherPhone=col('teacher phone'),
      iSummary=col('summary','description','abstract'), iWebsite=col('website');
  if (iTitle < 0) throw new Error('Could not find a project title column ("Category Name" or "Title").');

  var schools=readSheet_('Schools').rows, cats=readSheet_('Categories').rows, parts=readSheet_('Participants').rows;
  var sBy={}; schools.forEach(function(s){ sBy[String(s.Name).trim().toLowerCase()]=s; });
  var cBy={}; cats.forEach(function(c){ cBy[String(c.Name).trim().toLowerCase()]=c; });
  var seen={}; parts.forEach(function(p){ seen[(String(p.SchoolName)+'||'+String(p.Title)).trim().toLowerCase()]=true; });
  var sSeq=maxIdNum_(schools,'SchoolID'), cSeq=maxIdNum_(cats,'CategoryID'), pSeq=maxIdNum_(parts,'ParticipantID');
  var newSchools=[], newCats=[], newParts=[], added=0, skipped=0, errors=[];
  function val(row,i){ return (i>=0 && i<row.length) ? String(row[i]==null?'':row[i]).replace(/_x000D_/g,' ').trim() : ''; }
  function normType(x){ x=String(x||'').toLowerCase(); if(x.indexOf('business')>-1)return 'Business'; if(x.indexOf('poster')>-1)return 'Poster'; if(x.indexOf('project')>-1)return 'Project'; return x?x:'Project'; }

  var lock=LockService.getScriptLock(); lock.waitLock(25000);
  try {
    for (var r=1;r<rows.length;r++){
      var row=rows[r];
      if (row.every(function(v){ return !String(v).trim(); })) continue;
      try {
        var title=val(row,iTitle); if(!title){ skipped++; continue; }
        var schoolName=val(row,iSchool);
        var key=(schoolName+'||'+title).toLowerCase();
        if (seen[key]){ skipped++; continue; }
        var emirate=val(row,iEmirate);
        var typeRaw=val(row,iType), entryType=normType(typeRaw), categoryName=typeRaw||entryType;
        var lead=val(row,iLead);
        var team=teamCols.map(function(c){ return val(row,c); }).filter(Boolean).join(', ');
        var school=null;
        if (schoolName){ school=sBy[schoolName.toLowerCase()];
          if(!school){ school={SchoolID:'SCH-'+pad_(++sSeq,4),Name:schoolName,Emirate:emirate,Status:'Active',CreatedAt:now_(),UpdatedAt:now_()}; sBy[schoolName.toLowerCase()]=school; newSchools.push(school); }
          else if(emirate && !school.Emirate){ school.Emirate=emirate; updateRowByObj_('Schools',school); } }
        var cat=null;
        if (categoryName){ cat=cBy[categoryName.toLowerCase()]; if(!cat){ cat={CategoryID:'CAT-'+pad_(++cSeq,4),Name:categoryName,JudgesRequired:1,Status:'Active'}; cBy[categoryName.toLowerCase()]=cat; newCats.push(cat); } }
        var supContact=[val(row,iTeacherEmail),val(row,iTeacherPhone)].filter(Boolean).join(' · ');
        var pid='PRT-'+pad_(++pSeq,4);
        newParts.push({ ParticipantID:pid, RegNo:'', SchoolID:school?school.SchoolID:'', SchoolName:school?school.Name:schoolName,
          Title:title, Description:val(row,iSummary), Category:cat?cat.Name:categoryName, EntryType:entryType,
          ParticipantType: team?'Team':'Individual', LeadName:lead, TeamMembers:team, Grade:val(row,iGrade),
          Contact:val(row,iPhone), Email:val(row,iEmail), Supervisor:val(row,iTeacher), SupervisorContact:supContact,
          Notes: iWebsite>=0?val(row,iWebsite):'', Emirate: school?(school.Emirate||emirate):emirate,
          RegStatus:'Registered', ProjectStatus:'Active', CreatedAt:now_(), UpdatedAt:now_() });
        seen[key]=true; added++;
      } catch(err){ errors.push({ row:r+1, error:err.message }); }
    }
    batchAppend_('Schools', newSchools);
    batchAppend_('Categories', newCats);
    batchAppend_('Participants', newParts);
  } finally { lock.releaseLock(); }
  audit_('IMPORT_GFORM','Participants','','added '+added+' skipped '+skipped);
  return { added:added, skipped:skipped, newSchools:newSchools.length, newCats:newCats.length, errorCount:errors.length, errors:errors.slice(0,50) };
}

/* =====================================================  SAMPLE DATA (admin, testing)  ======= */
var DEMO_TAG = '[DEMO]';
function rewriteSheet_(name, keepFn){
  var d=readSheet_(name), sh=d.sheet, headers=d.headers;
  var kept=d.rows.filter(keepFn);
  if (sh.getLastRow()>1) sh.getRange(2,1,sh.getLastRow()-1,headers.length).clearContent();
  if (kept.length){ var out=kept.map(function(r){ return objToRow_(r,headers); }); sh.getRange(2,1,out.length,headers.length).setValues(out); }
}
function adminLoadSample(token){
  requireCtx_(token, ['admin']);
  var sSeq=maxIdNum_(readSheet_('Schools').rows,'SchoolID'), cSeq=maxIdNum_(readSheet_('Categories').rows,'CategoryID'),
      tSeq=maxIdNum_(readSheet_('Tables').rows,'TableID'), pSeq=maxIdNum_(readSheet_('Participants').rows,'ParticipantID'),
      jSeq=maxIdNum_(readSheet_('Judges').rows,'JudgeID');
  var schools=[['Al Noor International School','Sharjah'],['GEMS Modern Academy','Dubai'],['Ajman Academy','Ajman'],['Emirates National Schools','Abu Dhabi']]
    .map(function(s){ return {SchoolID:'SCH-'+pad_(++sSeq,4),Name:'[DEMO] '+s[0],Emirate:s[1],Status:'Active',Notes:DEMO_TAG,CreatedAt:now_(),UpdatedAt:now_()}; });
  var cats=['Project','Poster','Business Idea'].map(function(n){ return {CategoryID:'CAT-'+pad_(++cSeq,4),Name:'[DEMO] '+n,JudgesRequired:1,Status:'Active',Prize:'Gold Trophy',Notes:DEMO_TAG}; });
  var tables=['Z01','Z02','Z03','Z04'].map(function(n){ return {TableID:'TBL-'+pad_(++tSeq,4),TableName:n,Location:'Demo Hall',Floor:'Ground',Status:'Active',Notes:DEMO_TAG,UpdatedAt:now_()}; });
  var email=''; try{ email=Session.getEffectiveUser().getEmail(); }catch(e){}
  var judges=[{JudgeID:'JDG-'+pad_(++jSeq,4),Name:'[DEMO] Judge',Title:'Reviewer',Institution:'GMU',Email:email,Categories:'[DEMO] Project, [DEMO] Poster, [DEMO] Business Idea',Status:'Active',Notes:DEMO_TAG}];
  var seed=[['Solar Water Purifier',0,'Project','Aisha Khan','Grade 11'],['Campus Recycling App',1,'Business Idea','Omar Rahman','Grade 12'],['Air Quality Poster',2,'Poster','Meera Ali','Grade 10'],['Smart Cane for the Blind',3,'Project','Yousef A.','Grade 12']];
  var parts=seed.map(function(p,i){ var sc=schools[p[1]]; return {ParticipantID:'PRT-'+pad_(++pSeq,4),SchoolID:sc.SchoolID,SchoolName:sc.Name,Emirate:sc.Emirate,Title:p[0],Category:'[DEMO] '+p[2],EntryType:p[2]==='Business Idea'?'Business':p[2],LeadName:p[3],Grade:p[4],TableID:tables[i].TableID,TableName:tables[i].TableName,RegStatus:'Registered',ProjectStatus:'Active',Notes:DEMO_TAG,CreatedAt:now_(),UpdatedAt:now_()}; });
  batchAppend_('Schools',schools); batchAppend_('Categories',cats); batchAppend_('Tables',tables); batchAppend_('Judges',judges); batchAppend_('Participants',parts);
  var aSeq=maxIdNum_(readSheet_('TableAssignments').rows,'AssignmentID');
  batchAppend_('TableAssignments', parts.map(function(p){ return {AssignmentID:'ASG-'+pad_(++aSeq,4),TableID:p.TableID,TableName:p.TableName,ParticipantID:p.ParticipantID,SchoolName:p.SchoolName,Category:p.Category,Active:true,PrevTableID:'',User:'demo',Timestamp:now_(),Reason:DEMO_TAG}; }));
  appendRow_('JudgeAuth', {JudgeID:judges[0].JudgeID, AccessCode:generateAccessCode_(), CodeIssuedAt:now_(), LastLoginAt:''});
  audit_('LOAD_SAMPLE','','','demo loaded');
  return { ok:true };
}
function adminClearSample(token){
  requireCtx_(token, ['admin']);
  var isDemo=function(r){ return String(r.Notes||'').indexOf(DEMO_TAG)>-1; };
  var demoP={}; readSheet_('Participants').rows.forEach(function(p){ if(isDemo(p)) demoP[p.ParticipantID]=true; });
  var demoJ={}; readSheet_('Judges').rows.forEach(function(j){ if(isDemo(j)) demoJ[j.JudgeID]=true; });
  rewriteSheet_('Participants', function(r){ return !isDemo(r); });
  rewriteSheet_('Schools', function(r){ return !isDemo(r); });
  rewriteSheet_('Categories', function(r){ return !isDemo(r); });
  rewriteSheet_('Tables', function(r){ return !isDemo(r); });
  rewriteSheet_('Judges', function(r){ return !isDemo(r); });
  rewriteSheet_('TableAssignments', function(r){ return String(r.Reason||'').indexOf(DEMO_TAG)===-1 && !demoP[r.ParticipantID]; });
  rewriteSheet_('Evaluations', function(r){ return !demoP[r.ParticipantID] && !demoJ[r.JudgeID]; });
  rewriteSheet_('JudgeAuth', function(r){ return !demoJ[r.JudgeID]; });
  rewriteSheet_('JudgeAssignments', function(r){ return !demoP[r.ParticipantID] && !demoJ[r.JudgeID]; });
  audit_('CLEAR_SAMPLE','','','demo cleared');
  return { ok:true };
}

/* =====================================================  DEMO DATA  ============================ */
function loadSampleData() {
  var adminH = PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD_HASH');
  if (!adminH) { try { SpreadsheetApp.getUi().alert('Please set the admin password first (menu item 2), then load sample data.'); } catch (e) {} return; }
  var tk = 'A:' + adminH;
  var s1 = apiSave(tk, 'schools', { Name: 'Al Noor International School' }).id;
  var s2 = apiSave(tk, 'schools', { Name: 'GEMS Modern Academy' }).id;
  apiSave(tk, 'categories', { Name: 'Scientific Research', JudgesRequired: 1 });
  apiSave(tk, 'categories', { Name: 'Business Innovation', JudgesRequired: 1 });
  var t1 = apiSave(tk, 'tables', { TableName: 'A01' }).id;
  var t2 = apiSave(tk, 'tables', { TableName: 'A02' }).id;
  var jid = apiSave(tk, 'judges', { Name: 'Dr. Sample Judge', Email: Session.getEffectiveUser().getEmail() }).id;
  issueAccessCode(tk, jid, false); // generate a code without emailing (check JudgeAuth sheet)
  var p1 = apiSave(tk, 'participants', { Title: 'Solar Water Purifier', SchoolID: s1, Category: 'Scientific Research', EntryType: 'Project', LeadName: 'Aisha K', Grade: 'Grade 11' }).id;
  var p2 = apiSave(tk, 'participants', { Title: 'Campus Recycling App', SchoolID: s2, Category: 'Business Innovation', EntryType: 'Business', LeadName: 'Omar R', Grade: 'Grade 12' }).id;
  assignTable(tk, p1, t1, 'Demo'); assignTable(tk, p2, t2, 'Demo');
  try { SpreadsheetApp.getUi().alert('Sample data loaded. The demo judge code is in the JudgeAuth sheet.'); } catch (e) {}
}
