import { Email, ActivityLog } from '../models';
import { MessageFilter } from '../filter';
import { AutoResponder } from '../responder';
import { ReadTracker } from '../responder';
import * as Imap from 'imap';
import { randomUUID } from 'crypto';

export interface EmailMonitor {
  start(): Promise<void>;
  stop(): Promise<void>;
  checkInbox(): Promise<Email[]>;
  processEmail(email: Email): Promise<void>;
}

export interface ImapConfig {
  user: string;
  password: string;
  host: string;
  port: number;
  tls: boolean;
}

export interface EmailMonitorConfig {
  imapConfig: ImapConfig;
  messageFilter: MessageFilter;
  autoResponder: AutoResponder;
  readTracker: ReadTracker;
  checkInterval?: number; // In milliseconds, defaults to 10000 (10 seconds)
  onLog?: (log: ActivityLog) => void;
}

export class EmailMonitorImpl implements EmailMonitor {
  private config: EmailMonitorConfig;
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  private isProcessing: boolean = false;
  private shouldStop: boolean = false;
  private consecutiveFailures: number = 0;
  private readonly MAX_CONSECUTIVE_FAILURES = 5;

  constructor(config: EmailMonitorConfig) {
    this.config = {
      ...config,
      checkInterval: config.checkInterval || 10000, // Default 10 seconds
    };
  }

  /**
   * Start monitoring the inbox
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('EmailMonitor is already running');
    }

    this.isRunning = true;
    this.shouldStop = false;
    this.consecutiveFailures = 0;

    this.logActivity({
      id: randomUUID(),
      timestamp: new Date(),
      type: 'email_filtered',
      emailId: 'system',
      details: 'EmailMonitor started',
    });

    // Start the polling loop
    this.intervalId = setInterval(() => {
      this.pollInbox();
    }, this.config.checkInterval);

    // Do an immediate check
    await this.pollInbox();
  }

  /**
   * Stop monitoring the inbox
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.shouldStop = true;

    // Clear the interval
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    // Wait for current processing to complete
    while (this.isProcessing) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    this.isRunning = false;

    this.logActivity({
      id: randomUUID(),
      timestamp: new Date(),
      type: 'email_filtered',
      emailId: 'system',
      details: 'EmailMonitor stopped',
    });
  }

  /**
   * Check inbox for unread emails
   */
  async checkInbox(): Promise<Email[]> {
    return new Promise((resolve, reject) => {
      const imap = new (Imap as any)(this.config.imapConfig);
      const emails: Email[] = [];

      imap.once('ready', () => {
        imap.openBox('INBOX', false, (err: any) => {
          if (err) {
            imap.end();
            reject(new Error(`Failed to open inbox: ${err.message}`));
            return;
          }

          // Search for unread emails
          imap.search(['UNSEEN'], (err: any, results: any) => {
            if (err) {
              imap.end();
              reject(new Error(`Failed to search for unread emails: ${err.message}`));
              return;
            }

            if (!results || results.length === 0) {
              imap.end();
              resolve([]);
              return;
            }

            const fetch = imap.fetch(results, {
              bodies: '',
              struct: true,
            });

            fetch.on('message', (msg: any) => {
              let uid = '';
              let from = '';
              let to = '';
              let subject = '';
              let body = '';
              let receivedAt = new Date();

              msg.on('attributes', (attrs: any) => {
                uid = String(attrs.uid);
                
                if (attrs.envelope) {
                  from = attrs.envelope.from?.[0]
                    ? `${attrs.envelope.from[0].mailbox}@${attrs.envelope.from[0].host}`
                    : '';
                  to = attrs.envelope.to?.[0]
                    ? `${attrs.envelope.to[0].mailbox}@${attrs.envelope.to[0].host}`
                    : '';
                  subject = attrs.envelope.subject || '';
                  receivedAt = attrs.envelope.date || new Date();
                }
              });

              msg.on('body', (stream: any) => {
                let buffer = '';
                stream.on('data', (chunk: any) => {
                  buffer += chunk.toString('utf8');
                });
                stream.once('end', () => {
                  body = buffer;
                });
              });

              msg.once('end', () => {
                if (uid && from) {
                  emails.push({
                    id: uid,
                    from,
                    to,
                    subject,
                    body,
                    receivedAt,
                    isRead: false,
                  });
                }
              });
            });

            fetch.once('error', (err: Error) => {
              imap.end();
              reject(new Error(`Failed to fetch emails: ${err.message}`));
            });

            fetch.once('end', () => {
              imap.end();
            });
          });
        });
      });

      imap.once('error', (err: Error) => {
        reject(new Error(`IMAP connection error: ${err.message}`));
      });

      imap.once('end', () => {
        resolve(emails);
      });

      try {
        imap.connect();
      } catch (err) {
        reject(new Error(`Failed to connect to IMAP server: ${err}`));
      }
    });
  }

  /**
   * Process a single email through the pipeline
   */
  async processEmail(email: Email): Promise<void> {
    try {
      // Filter the email
      const filterDecision = this.config.messageFilter.shouldAutoReply(email);

      if (!filterDecision.approved) {
        this.logActivity({
          id: randomUUID(),
          timestamp: new Date(),
          type: 'email_filtered',
          emailId: email.id,
          details: `Email filtered out: ${filterDecision.reason}`,
          metadata: { from: email.from, subject: email.subject },
        });
        
        // Mark as read even if filtered
        await this.config.readTracker.markAsRead(email.id);
        return;
      }

      // Generate reply
      const reply = this.config.autoResponder.generateReply(email);

      // Handle based on manual confirmation setting
      if (reply.status === 'pending') {
        // Queue for manual confirmation
        this.config.autoResponder.queueForConfirmation(reply);
        
        this.logActivity({
          id: randomUUID(),
          timestamp: new Date(),
          type: 'email_filtered',
          emailId: email.id,
          replyId: reply.id,
          details: `Reply queued for manual confirmation`,
          metadata: { from: email.from, subject: email.subject },
        });
      } else {
        // Send immediately
        await this.config.autoResponder.sendReply(reply);
        
        // Mark as read after sending (or attempting to send)
        await this.config.readTracker.markAsRead(email.id);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      this.logActivity({
        id: randomUUID(),
        timestamp: new Date(),
        type: 'error',
        emailId: email.id,
        details: `Error processing email: ${errorMessage}`,
        metadata: { from: email.from, subject: email.subject, error: errorMessage },
      });
      
      // Continue processing other emails despite error
    }
  }

  /**
   * Poll the inbox and process unread emails
   */
  private async pollInbox(): Promise<void> {
    if (this.isProcessing || this.shouldStop) {
      return;
    }

    this.isProcessing = true;

    try {
      const emails = await this.checkInbox();
      
      // Reset consecutive failures on success
      this.consecutiveFailures = 0;

      // Process each email
      for (const email of emails) {
        if (this.shouldStop) {
          break;
        }
        await this.processEmail(email);
      }
    } catch (error) {
      this.consecutiveFailures++;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      this.logActivity({
        id: randomUUID(),
        timestamp: new Date(),
        type: 'error',
        emailId: 'system',
        details: `Failed to check inbox (attempt ${this.consecutiveFailures}/${this.MAX_CONSECUTIVE_FAILURES}): ${errorMessage}`,
        metadata: { error: errorMessage, consecutiveFailures: this.consecutiveFailures },
      });

      // Alert after max consecutive failures
      if (this.consecutiveFailures >= this.MAX_CONSECUTIVE_FAILURES) {
        this.logActivity({
          id: randomUUID(),
          timestamp: new Date(),
          type: 'error',
          emailId: 'system',
          details: `Maximum consecutive failures reached (${this.MAX_CONSECUTIVE_FAILURES}). Connection issues detected.`,
          metadata: { consecutiveFailures: this.consecutiveFailures },
        });
      }

      // Continue running despite errors (will retry on next interval)
    } finally {
      this.isProcessing = false;
    }
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
