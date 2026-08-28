import fs from 'fs';
import path from 'path';
import { DatabaseSync } from 'node:sqlite';
import config from '../config/index.js';

let db = null;

export function getDb() {
  if (!db) {
    const dir = path.dirname(config.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    db = new DatabaseSync(config.dbPath);
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA foreign_keys = ON');
  }
  return db;
}

export function runInTransaction(fn) {
  const database = getDb();
  database.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    database.exec('COMMIT');
    return result;
  } catch (err) {
    database.exec('ROLLBACK');
    throw err;
  }
}

export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}
