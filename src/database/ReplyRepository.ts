import { Database } from './connection';
import { Reply, ReplyStatus } from '../models/Reply';

interface ReplyRow {
  id: string;
  original_email_id: string;
  to_address: string;
  subject: string;
  body: string;
  generated_at: string;
  status: ReplyStatus;
  sent_at?: string;
  approved_by?: string;
  created_at: string;
}

export class ReplyRepository {
  constructor(private db: Database) {}

  async create(reply: Reply): Promise<void> {
    await this.db.run(
      `INSERT INTO reply (
        id, original_email_id, to_address, subject, body,
        generated_at, status, sent_at, approved_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        reply.id,
        reply.originalEmailId,
        reply.to,
        reply.subject,
        reply.body,
        reply.generatedAt.toISOString(),
        reply.status,
        reply.sentAt ? reply.sentAt.toISOString() : null,
        reply.approvedBy || null,
      ]
    );
  }

  async getById(id: string): Promise<Reply | null> {
    const row = await this.db.get<ReplyRow>(
      'SELECT * FROM reply WHERE id = ?',
      [id]
    );

    if (!row) return null;

    return this.mapRowToReply(row);
  }

  async getByStatus(status: ReplyStatus): Promise<Reply[]> {
    const rows = await this.db.all<ReplyRow>(
      'SELECT * FROM reply WHERE status = ? ORDER BY generated_at DESC',
      [status]
    );

    return rows.map(row => this.mapRowToReply(row));
  }

  async getByEmailId(emailId: string): Promise<Reply[]> {
    const rows = await this.db.all<ReplyRow>(
      'SELECT * FROM reply WHERE original_email_id = ? ORDER BY generated_at DESC',
      [emailId]
    );

    return rows.map(row => this.mapRowToReply(row));
  }

  async updateStatus(
    id: string,
    status: ReplyStatus,
    sentAt?: Date,
    approvedBy?: string
  ): Promise<void> {
    await this.db.run(
      `UPDATE reply 
       SET status = ?, sent_at = ?, approved_by = ?
       WHERE id = ?`,
      [
        status,
        sentAt ? sentAt.toISOString() : null,
        approvedBy || null,
        id,
      ]
    );
  }

  async getAll(limit: number = 100, offset: number = 0): Promise<Reply[]> {
    const rows = await this.db.all<ReplyRow>(
      'SELECT * FROM reply ORDER BY generated_at DESC LIMIT ? OFFSET ?',
      [limit, offset]
    );

    return rows.map(row => this.mapRowToReply(row));
  }

  private mapRowToReply(row: ReplyRow): Reply {
    return {
      id: row.id,
      originalEmailId: row.original_email_id,
      to: row.to_address,
      subject: row.subject,
      body: row.body,
      generatedAt: new Date(row.generated_at),
      status: row.status,
      sentAt: row.sent_at ? new Date(row.sent_at) : undefined,
      approvedBy: row.approved_by,
    };
  }
}
