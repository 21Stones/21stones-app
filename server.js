// server.js — 21 Stones Accounting LLC Time Management System
'use strict';

const express = require('express');
const cors    = require('cors');
const path    = require('path');
const { getDB } = require('./db/database');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const uid = () => 'id_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const now = () => new Date().toISOString();

const computeStatus = (entry) => {
  if (['draft', 'rejected', 'transferred'].includes(entry.status)) return entry.status;
  if (entry.emp_level === 'partner') {
    return entry.partner_approval_status === 'approved' ? 'approved' : 'pending';
  }
  if (entry.emp_level === 'manager') {
    if (entry.partner_approval_status === 'rejected') return 'rejected';
    if (entry.partner_approval_status === 'approved') return 'approved';
    return 'pending';
  }
  if (entry.manager_approval_status === 'rejected' || entry.partner_approval_status === 'rejected') return 'rejected';
  if (entry.manager_approval_status === 'approved' && entry.partner_approval_status === 'approved') return 'approved';
  return 'pending';
};

const formatEntry = (row) => ({
  id: row.id, employeeId: row.employee_id, clientId: row.client_id,
  date: row.date, hours: row.hours, description: row.description,
  billable: row.billable, status: computeStatus(row),
  managerApproval: row.manager_approval_status ? { status: row.manager_approval_status, by: row.manager_approval_by, at: row.manager_approval_at, comment: row.manager_approval_comment } : null,
  partnerApproval: row.partner_approval_status ? { status: row.partner_approval_status, by: row.partner_approval_by, at: row.partner_approval_at, comment: row.partner_approval_comment } : null,
  submittedAt: row.submitted_at, transferredAt: row.transferred_at, transferredBy: row.transferred_by, createdAt: row.created_at,
});

const wrap = fn => (req, res, next) => { try { fn(req, res, next); } catch (err) { console.error(err.message); res.status(500).json({ error: err.message }); } };

const ENTRY_SELECT = `SELECT e.*, emp.level AS emp_level FROM time_entries e JOIN employees emp ON emp.id = e.employee_id`;

app.get('/api/employees', wrap((req, res) => { const db = getDB(); res.json(db.prepare('SELECT * FROM employees ORDER BY level DESC, name ASC').all().map(e => ({ id: e.id, name: e.name, code: e.code, role: e.role, department: e.department, level: e.level, email: e.email, createdAt: e.created_at }))); }));

app.post('/api/employees', wrap((req, res) => {
  const db = getDB(); const { name, code, role, department, level, email, password } = req.body;
  if (!name || !code || !role || !level) return res.status(400).json({ error: 'name, code, role and level are required' });
  const uCode = code.toUpperCase().trim();
  if (db.prepare('SELECT id FROM employees WHERE code = ?').get(uCode)) return res.status(409).json({ error: 'Employee code already exists' });
  const id = uid();
  db.prepare('INSERT INTO employees (id, name, code, role, department, level, email, password) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(id, name.trim(), uCode, role.trim(), department || 'Accounting', level, email || '', password || 'changeme');
  const emp = db.prepare('SELECT * FROM employees WHERE id = ?').get(id);
  res.status(201).json({ id: emp.id, name: emp.name, code: emp.code, role: emp.role, department: emp.department, level: emp.level, email: emp.email });
}));

app.put('/api/employees/:id', wrap((req, res) => {
  const db = getDB(); const { name, code, role, department, level, email } = req.body;
  if (!name || !code || !role || !level) return res.status(400).json({ error: 'name, code, role and level are required' });
  const uCode = code.toUpperCase().trim();
  if (db.prepare('SELECT id FROM employees WHERE code = ? AND id != ?').get(uCode, req.params.id)) return res.status(409).json({ error: 'Employee code already exists' });
  const info = db.prepare('UPDATE employees SET name=?, code=?, role=?, department=?, level=?, email=? WHERE id=?').run(name.trim(), uCode, role.trim(), department || 'Accounting', level, email || '', req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Employee not found' });
  res.json({ success: true });
}));

app.delete('/api/employees/:id', wrap((req, res) => { getDB().prepare('DELETE FROM employees WHERE id = ?').run(req.params.id); res.json({ success: true }); }));

app.post('/api/employees/login', wrap((req, res) => {
  const db = getDB(); const { code, password } = req.body;
  const emp = db.prepare('SELECT * FROM employees WHERE code = ? AND password = ?').get((code || '').toUpperCase().trim(), password || '');
  if (!emp) return res.status(401).json({ error: 'Invalid code or password' });
  res.json({ id: emp.id, name: emp.name, code: emp.code, role: emp.role, department: emp.department, level: emp.level, email: emp.email });
}));

app.get('/api/clients', wrap((req, res) => { res.json(getDB().prepare('SELECT * FROM clients WHERE active=1 ORDER BY name ASC').all()); }));

app.post('/api/clients', wrap((req, res) => {
  const db = getDB(); const { name, code, industry, contact, email } = req.body;
  if (!name || !code) return res.status(400).json({ error: 'name and code are required' });
  const uCode = code.toUpperCase().trim();
  if (db.prepare('SELECT id FROM clients WHERE code = ?').get(uCode)) return res.status(409).json({ error: 'Client code already exists' });
  const id = uid();
  db.prepare('INSERT INTO clients (id,name,code,industry,contact,email) VALUES (?,?,?,?,?,?)').run(id, name.trim(), uCode, industry || 'Other', contact || '', email || '');
  res.status(201).json(db.prepare('SELECT * FROM clients WHERE id=?').get(id));
}));

app.put('/api/clients/:id', wrap((req, res) => {
  const db = getDB(); const { name, code, industry, contact, email } = req.body;
  if (!name || !code) return res.status(400).json({ error: 'name and code are required' });
  const uCode = code.toUpperCase().trim();
  if (db.prepare('SELECT id FROM clients WHERE code=? AND id!=?').get(uCode, req.params.id)) return res.status(409).json({ error: 'Client code already exists' });
  const info = db.prepare('UPDATE clients SET name=?,code=?,industry=?,contact=?,email=? WHERE id=?').run(name.trim(), uCode, industry || 'Other', contact || '', email || '', req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Client not found' });
  res.json({ success: true });
}));

app.delete('/api/clients/:id', wrap((req, res) => { getDB().prepare('UPDATE clients SET active=0 WHERE id=?').run(req.params.id); res.json({ success: true }); }));

app.get('/api/entries', wrap((req, res) => {
  const db = getDB(); let sql = ENTRY_SELECT + ' WHERE 1=1'; const params = [];
  if (req.query.employeeId) { sql += ' AND e.employee_id = ?'; params.push(req.query.employeeId); }
  if (req.query.clientId)   { sql += ' AND e.client_id = ?';   params.push(req.query.clientId); }
  if (req.query.status)     { sql += ' AND e.status = ?';      params.push(req.query.status); }
  if (req.query.from)       { sql += ' AND e.date >= ?';       params.push(req.query.from); }
  if (req.query.to)         { sql += ' AND e.date <= ?';       params.push(req.query.to); }
  sql += ' ORDER BY e.date DESC, e.created_at DESC';
  res.json(db.prepare(sql).all(...params).map(formatEntry));
}));

app.get('/api/entries/pending-approvals', wrap((req, res) => {
  const db = getDB(); const approver = db.prepare('SELECT * FROM employees WHERE id=?').get(req.query.approverId);
  if (!approver) return res.status(400).json({ error: 'approverId required' });
  let entries = [];
  if (approver.level === 'manager') {
    entries = db.prepare(`${ENTRY_SELECT} WHERE e.status='pending' AND emp.level='employee' AND (e.manager_approval_status IS NULL)`).all().map(formatEntry);
  } else if (approver.level === 'partner') {
    entries = db.prepare(`${ENTRY_SELECT} WHERE e.status='pending' AND ((emp.level='manager' AND (e.partner_approval_status IS NULL)) OR (emp.level='employee' AND e.manager_approval_status='approved' AND (e.partner_approval_status IS NULL)) OR (emp.level='partner' AND (e.partner_approval_status IS NULL)))`).all().map(formatEntry);
  }
  res.json(entries);
}));

app.post('/api/entries', wrap((req, res) => {
  const db = getDB(); const { employeeId, clientId, date, hours, description, billable, submit } = req.body;
  if (!employeeId || !clientId || !date || !hours || !description) return res.status(400).json({ error: 'employeeId, clientId, date, hours and description are required' });
  if (hours <= 0 || hours > 24) return res.status(400).json({ error: 'hours must be between 0.25 and 24' });
  const emp = db.prepare('SELECT * FROM employees WHERE id=?').get(employeeId);
  if (!emp) return res.status(404).json({ error: 'Employee not found' });
  const status = submit ? 'pending' : 'draft'; const id = uid(); const submittedAt = submit ? now() : null;
  let pApStatus = null, pApBy = null, pApAt = null, finalStatus = status;
  if (submit && emp.level === 'partner') { pApStatus = 'approved'; pApBy = employeeId; pApAt = now(); finalStatus = 'approved'; }
  db.prepare('INSERT INTO time_entries (id, employee_id, client_id, date, hours, description, billable, status, partner_approval_status, partner_approval_by, partner_approval_at, submitted_at, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id, employeeId, clientId, date, hours, description.trim(), billable || 'yes', finalStatus, pApStatus, pApBy, pApAt, submittedAt, now(), now());
  res.status(201).json(formatEntry(db.prepare(ENTRY_SELECT + ' WHERE e.id=?').get(id)));
}));

app.put('/api/entries/:id', wrap((req, res) => {
  const db = getDB(); const existing = db.prepare('SELECT * FROM time_entries WHERE id=?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Entry not found' });
  if (!['draft','rejected'].includes(existing.status)) return res.status(400).json({ error: 'Only draft or rejected entries can be edited' });
  const { clientId, date, hours, description, billable, submit } = req.body;
  if (hours && (hours <= 0 || hours > 24)) return res.status(400).json({ error: 'hours must be between 0.25 and 24' });
  const emp = db.prepare('SELECT * FROM employees WHERE id=?').get(existing.employee_id);
  const status = submit ? 'pending' : 'draft'; const submittedAt = submit ? now() : null;
  let pApStatus = null, pApBy = null, pApAt = null, finalStatus = status;
  if (submit && emp.level === 'partner') { pApStatus = 'approved'; pApBy = emp.id; pApAt = now(); finalStatus = 'approved'; }
  db.prepare('UPDATE time_entries SET client_id=?, date=?, hours=?, description=?, billable=?, status=?, manager_approval_status=NULL, manager_approval_by=NULL, manager_approval_at=NULL, manager_approval_comment=NULL, partner_approval_status=?, partner_approval_by=?, partner_approval_at=?, partner_approval_comment=NULL, submitted_at=?, updated_at=? WHERE id=?').run(clientId||existing.client_id, date||existing.date, hours||existing.hours, description?.trim()||existing.description, billable||existing.billable, finalStatus, pApStatus, pApBy, pApAt, submittedAt, now(), req.params.id);
  res.json(formatEntry(db.prepare(ENTRY_SELECT + ' WHERE e.id=?').get(req.params.id)));
}));

app.delete('/api/entries/:id', wrap((req, res) => {
  const db = getDB(); const row = db.prepare('SELECT status FROM time_entries WHERE id=?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Entry not found' });
  if (row.status !== 'draft') return res.status(400).json({ error: 'Only draft entries can be deleted' });
  db.prepare('DELETE FROM time_entries WHERE id=?').run(req.params.id); res.json({ success: true });
}));

app.post('/api/entries/:id/approve', wrap((req, res) => {
  const db = getDB(); const { approverId, action, comment } = req.body;
  if (!['approved','rejected'].includes(action)) return res.status(400).json({ error: 'action must be approved or rejected' });
  const row = db.prepare(ENTRY_SELECT + ' WHERE e.id=?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Entry not found' });
  const approver = db.prepare('SELECT * FROM employees WHERE id=?').get(approverId);
  if (!approver) return res.status(400).json({ error: 'Approver not found' });
  const ts = now();
  if (approver.level === 'manager') { db.prepare('UPDATE time_entries SET manager_approval_status=?, manager_approval_by=?, manager_approval_at=?, manager_approval_comment=?, updated_at=? WHERE id=?').run(action, approverId, ts, comment||'', ts, req.params.id); }
  else if (approver.level === 'partner') { db.prepare('UPDATE time_entries SET partner_approval_status=?, partner_approval_by=?, partner_approval_at=?, partner_approval_comment=?, updated_at=? WHERE id=?').run(action, approverId, ts, comment||'', ts, req.params.id); }
  else return res.status(403).json({ error: 'Insufficient approval authority' });
  const updated = db.prepare(ENTRY_SELECT + ' WHERE e.id=?').get(req.params.id);
  const newStatus = computeStatus(updated);
  db.prepare('UPDATE time_entries SET status=?, updated_at=? WHERE id=?').run(newStatus, ts, req.params.id);
  res.json(formatEntry(db.prepare(ENTRY_SELECT + ' WHERE e.id=?').get(req.params.id)));
}));

app.post('/api/entries/transfer', wrap((req, res) => {
  const db = getDB(); const { partnerId, period, clientId } = req.body;
  const partner = db.prepare('SELECT * FROM employees WHERE id=? AND level=?').get(partnerId, 'partner');
  if (!partner) return res.status(403).json({ error: 'Only partners can transfer entries' });
  const today = new Date().toISOString().slice(0,10); const d = new Date(); const day = d.getDay();
  const mon = new Date(d); mon.setDate(d.getDate()-day+(day===0?-6:1)); mon.setHours(0,0,0,0);
  const weekStart = mon.toISOString().slice(0,10); const monthStart = today.slice(0,7)+'-01';
  let sql = "SELECT e.*, emp.level AS emp_level FROM time_entries e JOIN employees emp ON emp.id=e.employee_id WHERE e.status='approved'"; const args = [];
  if (period==='week') { sql+=' AND e.date >= ?'; args.push(weekStart); }
  if (period==='month') { sql+=' AND e.date >= ?'; args.push(monthStart); }
  if (clientId) { sql+=' AND e.client_id = ?'; args.push(clientId); }
  const entries = db.prepare(sql).all(...args);
  if (!entries.length) return res.status(400).json({ error: 'No approved entries match the filter' });
  const ts = now(); const logId = uid(); const totalH = entries.reduce((a,e)=>a+e.hours,0);
  const updateEntry = db.prepare("UPDATE time_entries SET status='transferred', transferred_at=?, transferred_by=?, updated_at=? WHERE id=?");
  db.transaction(() => { entries.forEach(e=>updateEntry.run(ts,partnerId,ts,e.id)); db.prepare('INSERT INTO transfer_log (id,transferred_at,transferred_by,entry_count,total_hours,period_label) VALUES (?,?,?,?,?,?)').run(logId,ts,partnerId,entries.length,totalH,period||'custom'); })();
  res.json({ success:true, transferId:logId, entriesTransferred:entries.length, totalHours:totalH, transferredAt:ts, entries:entries.map(formatEntry) });
}));

app.get('/api/stats', wrap((req, res) => {
  const db = getDB(); const today = new Date().toISOString().slice(0,10);
  const d = new Date(); const day = d.getDay(); const mon = new Date(d); mon.setDate(d.getDate()-day+(day===0?-6:1)); mon.setHours(0,0,0,0);
  const weekStart = mon.toISOString().slice(0,10);
  const todayHours = db.prepare("SELECT COALESCE(SUM(hours),0) as h FROM time_entries WHERE date=?").get(today).h;
  const weekHours  = db.prepare("SELECT COALESCE(SUM(hours),0) as h FROM time_entries WHERE date>=?").get(weekStart).h;
  const pending    = db.prepare("SELECT COUNT(*) as c FROM time_entries WHERE status='pending'").get().c;
  const approved   = db.prepare("SELECT COUNT(*) as c FROM time_entries WHERE status='approved'").get().c;
  const transferred= db.prepare("SELECT COUNT(*) as c FROM time_entries WHERE status='transferred'").get().c;
  const teamToday  = db.prepare("SELECT e.id,e.name,e.code,e.role,e.department,e.level, COALESCE(SUM(CASE WHEN t.date=? THEN t.hours ELSE 0 END),0) as today_hours, COALESCE(SUM(CASE WHEN t.date>=? THEN t.hours ELSE 0 END),0) as week_hours FROM employees e LEFT JOIN time_entries t ON t.employee_id=e.id GROUP BY e.id ORDER BY e.level DESC, e.name ASC").all(today, weekStart);
  res.json({ todayHours, weekHours, pending, approved, transferred, teamToday });
}));

app.get('*', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'index.html')); });

app.listen(PORT, () => { console.log(`✓ 21 Stones Time Management running on port ${PORT}`); getDB(); });
