/**
 * Database client wrapper for better-sqlite3
 */

import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class DatabaseClient {
  private db: Database.Database;
  private isInitialized = false;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.configure();
  }

  /**
   * Configure database settings
   */
  private configure(): void {
    // Enable WAL mode for better concurrency
    this.db.pragma('journal_mode = WAL');

    // Enable foreign keys
    this.db.pragma('foreign_keys = ON');

    // Set synchronous mode for performance
    this.db.pragma('synchronous = NORMAL');

    // Set busy timeout to 30 seconds to prevent premature timeouts
    this.db.pragma('busy_timeout = 30000');
    
    // Set WAL autocheckpoint to prevent WAL from growing too large
    this.db.pragma('wal_autocheckpoint = 1000');
  }

  /**
   * Initialize database schema
   */
  initialize(): void {
    if (this.isInitialized) {
      return;
    }

    const schemaPath = join(__dirname, 'schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');

    // Remove comment lines and split into individual statements
    const cleanedSchema = schema
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n');

    const statements = cleanedSchema
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    for (const statement of statements) {
      this.db.exec(statement);
    }

    this.isInitialized = true;
  }

  /**
   * Execute a query and return multiple rows
   */
  query<T = unknown>(sql: string, params?: unknown[]): T[] {
    try {
      const stmt = this.db.prepare(sql);
      const result = (params ? stmt.all(...params) : stmt.all()) as T[];
      return result;
    } catch (error) {
      throw new Error(`Query failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Execute a query and return a single row
   */
  queryOne<T = unknown>(sql: string, params?: unknown[]): T | null {
    try {
      const stmt = this.db.prepare(sql);
      const result = params ? stmt.get(...params) : stmt.get();
      return (result as T) || null;
    } catch (error) {
      throw new Error(`QueryOne failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Execute a write operation (INSERT, UPDATE, DELETE)
   */
  execute(sql: string, params?: unknown[]): Database.RunResult {
    try {
      const stmt = this.db.prepare(sql);
      const result = params ? stmt.run(...params) : stmt.run();
      return result;
    } catch (error) {
      throw new Error(`Execute failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Execute multiple operations in a transaction
   */
  transaction<T>(callback: () => T): T {
    const txn = this.db.transaction(callback);
    return txn();
  }

  /**
   * Get the underlying database instance (for advanced usage)
   */
  getDatabase(): Database.Database {
    return this.db;
  }

  /**
   * Close the database connection
   */
  close(): void {
    this.db.close();
  }

  /**
   * Check if database is open
   */
  isOpen(): boolean {
    return this.db.open;
  }
}
