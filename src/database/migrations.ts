import { Database } from './connection';

export async function runMigrations(db: Database): Promise<void> {
  // Create Config table
  await db.run(`
    CREATE TABLE IF NOT EXISTS config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      imap_host TEXT NOT NULL,
      imap_port INTEGER NOT NULL,
      smtp_host TEXT NOT NULL,
      smtp_port INTEGER NOT NULL,
      username TEXT NOT NULL,
      password TEXT NOT NULL,
      keywords_enabled INTEGER NOT NULL DEFAULT 0,
      keywords TEXT NOT NULL DEFAULT '[]',
      excluded_domains TEXT NOT NULL DEFAULT '[]',
      manual_confirmation INTEGER NOT NULL DEFAULT 0,
      reply_template TEXT NOT NULL,
      check_interval INTEGER NOT NULL DEFAULT 10,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create ActivityLog table
  await db.run(`
    CREATE TABLE IF NOT EXISTS activity_log (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      type TEXT NOT NULL,
      email_id TEXT NOT NULL,
      reply_id TEXT,
      details TEXT NOT NULL,
      metadata TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create Reply table
  await db.run(`
    CREATE TABLE IF NOT EXISTS reply (
      id TEXT PRIMARY KEY,
      original_email_id TEXT NOT NULL,
      to_address TEXT NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      status TEXT NOT NULL,
      sent_at TEXT,
      approved_by TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create indexes for common queries
  await db.run(`
    CREATE INDEX IF NOT EXISTS idx_activity_log_timestamp 
    ON activity_log(timestamp DESC)
  `);

  await db.run(`
    CREATE INDEX IF NOT EXISTS idx_activity_log_email_id 
    ON activity_log(email_id)
  `);

  await db.run(`
    CREATE INDEX IF NOT EXISTS idx_reply_status 
    ON reply(status)
  `);

  await db.run(`
    CREATE INDEX IF NOT EXISTS idx_reply_original_email_id 
    ON reply(original_email_id)
  `);
}
