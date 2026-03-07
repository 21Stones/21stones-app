const Database = require('better-sqlite3');
const path = require('path');

const DB_DIR = process.env.DB_PATH || path.join(__dirname);
const DB_FILE = path.join(DB_DIR, '21stones.db');

let db;

function getDB() {
  if (db) return db;
  db = new Database(DB_FILE);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  initSchema();
  seedIfEmpty();
  return db;
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS employees (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, code TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL, department TEXT NOT NULL DEFAULT 'Accounting',
      level TEXT NOT NULL DEFAULT 'employee' CHECK(level IN ('employee','manager','partner')),
      email TEXT, password TEXT NOT NULL DEFAULT 'changeme',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS clients (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, code TEXT NOT NULL UNIQUE,
      industry TEXT, contact TEXT, email TEXT, active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS time_entries (
      id TEXT PRIMARY KEY, employee_id TEXT NOT NULL REFERENCES employees(id),
      client_id TEXT NOT NULL REFERENCES clients(id), date TEXT NOT NULL,
      hours REAL NOT NULL, description TEXT NOT NULL,
      billable TEXT NOT NULL DEFAULT 'yes' CHECK(billable IN ('yes','no')),
      status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','pending','approved','rejected','transferred')),
      manager_approval_status TEXT, manager_approval_by TEXT, manager_approval_at TEXT, manager_approval_comment TEXT,
      partner_approval_status TEXT, partner_approval_by TEXT, partner_approval_at TEXT, partner_approval_comment TEXT,
      submitted_at TEXT, transferred_at TEXT, transferred_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS transfer_log (
      id TEXT PRIMARY KEY, transferred_at TEXT NOT NULL, transferred_by TEXT NOT NULL,
      entry_count INTEGER NOT NULL, total_hours REAL NOT NULL, period_label TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

function seedIfEmpty() {
  const count = db.prepare('SELECT COUNT(*) as c FROM employees').get().c;
  if (count > 0) return;
  const uid = () => 'id_' + Date.now().toString(36) + Math.random().toString(36).slice(2,6);
  const insertEmp = db.prepare('INSERT INTO employees (id,name,code,role,department,level,email,password) VALUES (?,?,?,?,?,?,?,?)');
  [
    [uid(),'Alexandra Rivera','EMP-001','Senior Accountant','Accounting','employee','a.rivera@21stones.com','emp001'],
    [uid(),'Michael Torres','EMP-002','Tax Specialist','Tax','employee','m.torres@21stones.com','emp002'],
    [uid(),'David Okafor','EMP-003','Junior Auditor','Audit','employee','d.okafor@21stones.com','emp003'],
    [uid(),'Sandra Lee','MGR-001','Accounting Manager','Accounting','manager','s.lee@21stones.com','mgr001'],
    [uid(),'James Whitfield','MGR-002','Tax Manager','Tax','manager','j.whitfield@21stones.com','mgr002'],
    [uid(),'Patricia Monroe','PTR-001','Managing Partner','Management','partner','p.monroe@21stones.com','ptr001'],
  ].forEach(e => insertEmp.run(...e));
  const insertCli = db.prepare('INSERT INTO clients (id,name,code,industry,contact,email) VALUES (?,?,?,?,?,?)');
  [
    [uid(),'Sunrise Properties LLC','CLT-001','Real Estate','Robert Sunrise','r@sunrise.com'],
    [uid(),'MedCore Health Group','CLT-002','Healthcare','Linda Hart','l@medcore.com'],
    [uid(),'TechForward Inc.','CLT-003','Technology','Alan Cho','a@techforward.com'],
    [uid(),'Golden Retail Partners','CLT-004','Retail','Maria Gold','m@golden.com'],
    [uid(),'Internal / Admin','INT-000','Other','21 Stones','admin@21stones.com'],
  ].forEach(c => insertCli.run(...c));
  console.log('✓ Database seeded with default data');
}

module.exports = { getDB };
