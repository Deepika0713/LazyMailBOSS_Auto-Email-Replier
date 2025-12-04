import { Database } from './connection';
import { ActivityLog, ActivityLogType } from '../models/ActivityLog';

interface ActivityLogRow {
  id: string;
  timestamp: string;
  type: ActivityLogType;
  email_id: string;
  reply_id?: string;
  details: string;
  metadata?: string;
  created_at: string;
}

export class ActivityLogRepository {
  constructor(private db: Database) {}

  async create(log: ActivityLog): Promise<void> {
    await this.db.run(
      `INSERT INTO activity_log (
        id, timestamp, type, email_id, reply_id, details, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        log.id,
        log.timestamp.toISOString(),
        log.type,
        log.emailId,
        log.replyId || null,
        log.details,
        log.metadata ? JSON.stringify(log.metadata) : null,
      ]
    );
  }

  async getById(id: string): Promise<ActivityLog | null> {
    const row = await this.db.get<ActivityLogRow>(
      'SELECT * FROM activity_log WHERE id = ?',
      [id]
    );

    if (!row) return null;

    return this.mapRowToLog(row);
  }

  async getAll(limit: number = 100, offset: number = 0): Promise<ActivityLog[]> {
    const rows = await this.db.all<ActivityLogRow>(
      'SELECT * FROM activity_log ORDER BY timestamp DESC LIMIT ? OFFSET ?',
      [limit, offset]
    );

    return rows.map(row => this.mapRowToLog(row));
  }

  async getByEmailId(emailId: string): Promise<ActivityLog[]> {
    const rows = await this.db.all<ActivityLogRow>(
      'SELECT * FROM activity_log WHERE email_id = ? ORDER BY timestamp DESC',
      [emailId]
    );

    return rows.map(row => this.mapRowToLog(row));
  }

  async getByType(type: ActivityLogType, limit: number = 100): Promise<ActivityLog[]> {
    const rows = await this.db.all<ActivityLogRow>(
      'SELECT * FROM activity_log WHERE type = ? ORDER BY timestamp DESC LIMIT ?',
      [type, limit]
    );

    return rows.map(row => this.mapRowToLog(row));
  }

  private mapRowToLog(row: ActivityLogRow): ActivityLog {
    return {
      id: row.id,
      timestamp: new Date(row.timestamp),
      type: row.type,
      emailId: row.email_id,
      replyId: row.reply_id,
      details: row.details,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    };
  }
}
