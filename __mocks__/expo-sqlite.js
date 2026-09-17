// Mock expo-sqlite for testing
const initSqlJs = require('sql.js');

const databases = {};

class MockSQLiteDatabase {
  constructor(db) {
    this.db = db;
  }

  async execAsync(sql) {
    // Split SQL by semicolon but handle incomplete statements
    try {
      // First try to run the whole batch
      this.db.run(sql);
    } catch (error) {
      // If that fails, try individual statements
      if (error.message.includes('incomplete input')) {
        const statements = sql.split(';').filter(s => s.trim());
        for (const statement of statements) {
          if (statement.trim()) {
            try {
              this.db.run(statement + ';');
            } catch (err) {
              // Ignore FTS5 related errors in mock
              if (!err.message.includes('fts5') && !err.message.includes('no such module')) {
                throw err;
              }
            }
          }
        }
      } else if (error.message.includes('fts5') || error.message.includes('no such module')) {
        // Ignore FTS5 errors
      } else {
        throw error;
      }
    }
  }

  async runAsync(sql, ...params) {
    const stmt = this.db.prepare(sql);
    stmt.bind(params);
    stmt.step();
    stmt.free();
  }

  async getFirstAsync(sql, ...params) {
    const stmt = this.db.prepare(sql);
    stmt.bind(params);
    let result = null;
    if (stmt.step()) {
      const columns = stmt.getColumnNames();
      result = {};
      for (let i = 0; i < columns.length; i++) {
        result[columns[i]] = stmt.get()[i];
      }
    }
    stmt.free();
    return result;
  }

  async getAllAsync(sql, ...params) {
    const stmt = this.db.prepare(sql);
    stmt.bind(params);
    const results = [];
    const columns = stmt.getColumnNames();
    while (stmt.step()) {
      const row = stmt.get();
      const result = {};
      for (let i = 0; i < columns.length; i++) {
        result[columns[i]] = row[i];
      }
      results.push(result);
    }
    stmt.free();
    return results;
  }

  close() {
    if (this.db) {
      this.db.close();
    }
  }
}

async function openDatabaseAsync(dbName) {
  if (!databases[dbName]) {
    const SQL = await initSqlJs();
    const db = new SQL.Database();
    databases[dbName] = new MockSQLiteDatabase(db);
  }
  return databases[dbName];
}

module.exports = {
  openDatabaseAsync,
  SQLiteDatabase: MockSQLiteDatabase,
};
