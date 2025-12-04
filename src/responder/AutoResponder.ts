import { Email, Reply, ActivityLog } from '../models';
import * as nodemailer from 'nodemailer';
import { ReadTracker } from './ReadTracker';
import { randomUUID } from 'crypto';

export interface SendResult {
  success: boolean;
  error?: string;
  sentAt?: Date;
}

export interface AutoResponder {
  generateReply(email: Email): Reply;
  sendReply(reply: Reply): Promise<SendResult>;
  queueForConfirmation(reply: Reply): void;
  processConfirmation(replyId: string, approved: boolean): Promise<void>;
  getPendingReplies(): Reply[];
}

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
}

export interface AutoResponderConfig {
  smtpConfig: SmtpConfig;
  replyTemplate: string;
  manualConfirmation: boolean;
  readTracker: ReadTracker;
  onLog?: (log: ActivityLog) => void;
  onReplySave?: (reply: Reply) => Promise<void>;
}

export class AutoResponderImpl implements AutoResponder {
  private config: AutoResponderConfig;
  private pendingReplies: Map<string, Reply>;
  private transporter: nodemailer.Transporter;

  constructor(config: AutoResponderConfig) {
    this.config = config;
    this.pendingReplies = new Map();
    this.transporter = nodemailer.createTransport(this.config.smtpConfig);
  }

  /**
   * Generate a reply for the given email
   */
  generateReply(email: Email): Reply {
    const reply: Reply = {
      id: randomUUID(),
      originalEmailId: email.id,
      to: email.from,
      subject: `Re: ${email.subject}`,
      body: this.renderTemplate(email),
      generatedAt: new Date(),
      status: this.config.manualConfirmation ? 'pending' : 'approved',
    };

    // Save reply to database if callback provided
    if (this.config.onReplySave) {
      this.config.onReplySave(reply).catch((err) => {
        console.error('Failed to save reply to database:', err);
      });
    }

    return reply;
  }

  /**
   * Send a reply via SMTP
   */
  async sendReply(reply: Reply): Promise<SendResult> {
    try {
      await this.transporter.sendMail({
        from: this.config.smtpConfig.auth.user,
        to: reply.to,
        subject: reply.subject,
        text: reply.body,
      });

      const sentAt = new Date();
      reply.status = 'sent';
      reply.sentAt = sentAt;

      // Update reply in database if callback provided
      if (this.config.onReplySave) {
        await this.config.onReplySave(reply).catch((err) => {
          console.error('Failed to update reply in database:', err);
        });
      }

      // Log successful send
      this.logActivity({
        id: randomUUID(),
        timestamp: sentAt,
        type: 'reply_sent',
        emailId: reply.originalEmailId,
        replyId: reply.id,
        details: `Reply sent to ${reply.to}`,
        metadata: { recipient: reply.to },
      });

      return { success: true, sentAt };
    } catch (error) {
      reply.status = 'failed';
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Update reply in database if callback provided
      if (this.config.onReplySave) {
        await this.config.onReplySave(reply).catch((err) => {
          console.error('Failed to update reply in database:', err);
        });
      }

      // Log failed send
      this.logActivity({
        id: randomUUID(),
        timestamp: new Date(),
        type: 'reply_failed',
        emailId: reply.originalEmailId,
        replyId: reply.id,
        details: `Failed to send reply to ${reply.to}: ${errorMessage}`,
        metadata: { recipient: reply.to, error: errorMessage },
      });

      return { success: false, error: errorMessage };
    }
  }

  /**
   * Queue a reply for manual confirmation
   */
  queueForConfirmation(reply: Reply): void {
    reply.status = 'pending';
    this.pendingReplies.set(reply.id, reply);
  }

  /**
   * Process manual confirmation (approve or reject)
   */
  async processConfirmation(replyId: string, approved: boolean): Promise<void> {
    const reply = this.pendingReplies.get(replyId);
    
    if (!reply) {
      throw new Error(`Reply with id ${replyId} not found in pending queue`);
    }

    if (approved) {
      reply.status = 'approved';
      await this.sendReply(reply);
    } else {
      reply.status = 'rejected';
    }

    // Mark original email as read regardless of approval/rejection
    await this.config.readTracker.markAsRead(reply.originalEmailId);

    // Remove from pending queue
    this.pendingReplies.delete(replyId);
  }

  /**
   * Get all pending replies
   */
  getPendingReplies(): Reply[] {
    return Array.from(this.pendingReplies.values());
  }

  /**
   * Render the reply template with email data
   */
  private renderTemplate(email: Email): string {
    return this.config.replyTemplate
      .replace(/\{sender\}/g, email.from)
      .replace(/\{subject\}/g, email.subject)
      .replace(/\{body\}/g, email.body);
  }

  /**
   * Log activity
   */
  private logActivity(log: ActivityLog): void {
    if (this.config.onLog) {
      this.config.onLog(log);
    }
  }
}
