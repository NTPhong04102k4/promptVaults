// Mock expo-sqlite for testing
const Database = require('better-sqlite3')

const databases = {}

class MockSQLiteDatabase {
  constructor(db) {
    this.db = db
  }

  async execAsync(sql) {
    // better-sqlite3 executes multi-statement SQL directly
    this.db.exec(sql)
  }

  async runAsync(sql, ...params) {
    const stmt = this.db.prepare(sql)
    stmt.run(...params)
  }

  async getFirstAsync(sql, ...params) {
    const stmt = this.db.prepare(sql)
    return stmt.get(...params) || null
  }

  async getAllAsync(sql, ...params) {
    const stmt = this.db.prepare(sql)
    return stmt.all(...params)
  }

  close() {
    if (this.db) {
      this.db.close()
    }
  }
}

async function openDatabaseAsync(dbName) {
  // Use in-memory database; memoize by dbName to match db.ts's single-open-per-process pattern
  if (!databases[dbName]) {
    const sqliteDb = new Database(':memory:')
    databases[dbName] = new MockSQLiteDatabase(sqliteDb)
  }
  return databases[dbName]
}

module.exports = {
  openDatabaseAsync,
  SQLiteDatabase: MockSQLiteDatabase,
}
