// Mock expo-sqlite for testing
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Create a temporary directory for test databases
const testDbDir = path.join(__dirname, '..', '.test-db');
if (!fs.existsSync(testDbDir)) {
  fs.mkdirSync(testDbDir, { recursive: true });
}

const databases = {};

class MockSQLiteDatabase {
  constructor(db) {
    this.db = db;
  }

  async execAsync(sql) {
    // better-sqlite3 executes multi-statement SQL directly
    this.db.exec(sql);
  }

  async runAsync(sql, ...params) {
    const stmt = this.db.prepare(sql);
    stmt.run(...params);
  }

  async getFirstAsync(sql, ...params) {
    const stmt = this.db.prepare(sql);
    return stmt.get(...params) || null;
  }

  async getAllAsync(sql, ...params) {
    const stmt = this.db.prepare(sql);
    return stmt.all(...params);
  }

  close() {
    if (this.db) {
      this.db.close();
    }
  }
}

async function openDatabaseAsync(dbName) {
  if (!databases[dbName]) {
    const dbPath = path.join(testDbDir, dbName);
    const sqliteDb = new Database(dbPath);
    databases[dbName] = new MockSQLiteDatabase(sqliteDb);
  }
  return databases[dbName];
}

module.exports = {
  openDatabaseAsync,
  SQLiteDatabase: MockSQLiteDatabase,
};
