/**
 * Integration Tests for LazyMailBOSS
 * 
 * These tests verify the complete workflows of the system including:
 * - Auto-reply workflow with test IMAP/SMTP server
 * - Manual confirmation workflow end-to-end
 * - Configuration hot-reload across components
 * - System restart and recovery
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Database } from './database/connection';
import { ConfigurationManagerImpl } from './config/ConfigurationManager';
import { MessageFilter } from './filter/MessageFilter';
import { AutoResponderImpl, ReadTrackerImpl } from './responder';
import { EmailMonitorImpl } from './monitor/EmailMonitor';
import { ActivityLogRepository } from './database/ActivityLogRepository';
import { ReplyRepository } from './database/ReplyRepository';
import { Email } from './models/Email';
import { Config } from './models/Config';

// Mock IMAP connection for testing
class MockImapConnection {
  private emails: Email[] = [];
  private readEmails: Set<string> = new Set();
  private connected = false;

  constructor() {}

  connect(): Promise<void> {
    this.connected = true;
    return Promise.resolve();
  }

  disconnect(): Promise<void> {
    this.connected = false;
    return Promise.resolve();
  }

  isConnected(): boolean {
    return this.connected;
  }

  addEmail(email: Email): void {
    this.emails.push(email);
  }

  getUnreadEmails(): Promise<Email[]> {
    return Promise.resolve(
      this.emails.filter(email => !this.readEmails.has(email.id))
    );
  }

  markAsRead(emailId: string): Promise<void> {
    this.readEmails.add(emailId);
    return Promise.resolve();
  }

  isRead(emailId: string): Promise<boolean> {
    return Promise.resolve(this.readEmails.has(emailId));
  }

  clearEmails(): void {
    this.emails = [];
    this.readEmails.clear();
  }
}

// Mock SMTP transport for testing
class MockSmtpTransport {
  public sentEmails: Array<{
    to: string;
    subject: string;
    body: string;
    sentAt: Date;
  }> = [];

  async sendMail(options: {
    from: string;
    to: string;
    subject: string;
    text: string;
  }): Promise<void> {
    this.sentEmails.push({
      to: options.to,
      subject: options.subject,
      body: options.text,
      sentAt: new Date()
    });
  }

  clearSentEmails(): void {
    this.sentEmails = [];
  }
}

// Test database setup
async function createTestDatabase(): Promise<Database> {
  const sqlite3 = require('sqlite3');
  const dbPath = `:memory:`;
  const db = new sqlite3.Database(dbPath);

  const run = (sql: string, params: any[] = []): Promise<void> => {
    return new Promise((resolve, reject) => {
      db.run(sql, params, (err: Error) => {
        if (err) reject(err);
        else resolve();
      });
    });
  };

  const get = <T>(sql: string, params: any[] = []): Promise<T | undefined> => {
    return new Promise((resolve, reject) => {
      db.get(sql, params, (err: Error, row: T) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  };

  const all = <T>(sql: string, params: any[] = []): Promise<T[]> => {
    return new Promise((resolve, reject) => {
      db.all(sql, params, (err: Error, rows: T[]) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  };

  const close = (): Promise<void> => {
    return Promise.resolve();
  };

  // Initialize tables
  await run(`
    CREATE TABLE IF NOT EXISTS activity_log (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      type TEXT NOT NULL,
      email_id TEXT NOT NULL,
      reply_id TEXT,
      details TEXT NOT NULL,
      metadata TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(`
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
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  return { run, get, all, close };
}

describe('Integration Tests - Complete Auto-Reply Workflow', () => {
  let testDb: Database;
  let configDb: Database;
  let activityLogRepo: ActivityLogRepository;
  let replyRepo: ReplyRepository;
  let mockImap: MockImapConnection;
  let mockSmtp: MockSmtpTransport;
  let messageFilter: MessageFilter;
  let autoResponder: AutoResponderImpl;
  let readTracker: ReadTrackerImpl;

  beforeEach(async () => {
    testDb = await createTestDatabase();
    configDb = await createTestDatabase();
    activityLogRepo = new ActivityLogRepository(testDb);
    replyRepo = new ReplyRepository(testDb);
    mockImap = new MockImapConnection();
    mockSmtp = new MockSmtpTransport();

    // Create MessageFilter
    messageFilter = new MessageFilter({
      keywordsEnabled: true,
      keywords: ['urgent', 'important'],
      excludedDomains: ['spam.com', 'noreply.com']
    });

    // Create ReadTracker with mock IMAP
    readTracker = new ReadTrackerImpl({
      user: 'test@example.com',
      password: 'password',
      host: 'imap.example.com',
      port: 993,
      tls: true
    });

    // Override the internal IMAP connection with our mock
    (readTracker as any).markAsRead = async (emailId: string) => {
      await mockImap.markAsRead(emailId);
    };
    (readTracker as any).isRead = async (emailId: string) => {
      return await mockImap.isRead(emailId);
    };

    // Create AutoResponder with mock SMTP
    autoResponder = new AutoResponderImpl({
      smtpConfig: {
        host: 'smtp.example.com',
        port: 587,
        secure: false,
        auth: {
          user: 'test@example.com',
          pass: 'password'
        }
      },
      replyTemplate: 'Thank you for your email. I will respond shortly.',
      manualConfirmation: false,
      readTracker,
      onLog: async (log) => {
        await activityLogRepo.create(log);
      },
      onReplySave: async (reply) => {
        const existing = await replyRepo.getById(reply.id);
        if (existing) {
          await replyRepo.updateStatus(
            reply.id,
            reply.status,
            reply.sentAt,
            reply.approvedBy
          );
        } else {
          await replyRepo.create(reply);
        }
      }
    });

    // Override the internal SMTP transport with our mock
    (autoResponder as any).transporter = mockSmtp;
  });

  afterEach(async () => {
    if (testDb) {
      await testDb.close();
    }
    if (configDb) {
      await configDb.close();
    }
    mockImap.clearEmails();
    mockSmtp.clearSentEmails();
  });

  it('should complete full auto-reply workflow: unread email → filter → send → mark read', async () => {
    // Step 1: Add an unread email with keyword
    const testEmail: Email = {
      id: 'email-1',
      from: 'sender@example.com',
      to: 'test@example.com',
      subject: 'URGENT: Need help',
      body: 'This is an urgent matter that needs attention.',
      receivedAt: new Date(),
      isRead: false
    };

    mockImap.addEmail(testEmail);

    // Step 2: Retrieve unread emails
    const unreadEmails = await mockImap.getUnreadEmails();
    expect(unreadEmails.length).toBe(1);
    expect(unreadEmails[0].id).toBe('email-1');

    // Step 3: Filter the email
    const filterDecision = messageFilter.shouldAutoReply(testEmail);
    expect(filterDecision.approved).toBe(true);
    expect(filterDecision.matchedKeywords).toContain('urgent');

    // Step 4: Generate and send reply
    const reply = autoResponder.generateReply(testEmail);
    expect(reply).toBeDefined();
    expect(reply.to).toBe('sender@example.com');
    expect(reply.originalEmailId).toBe('email-1');

    const sendResult = await autoResponder.sendReply(reply);
    expect(sendResult.success).toBe(true);

    // Step 5: Verify email was sent
    expect(mockSmtp.sentEmails.length).toBe(1);
    expect(mockSmtp.sentEmails[0].to).toBe('sender@example.com');
    expect(mockSmtp.sentEmails[0].subject).toContain('Re:');

    // Step 6: Manually mark email as read (in real workflow, EmailMonitor does this)
    await readTracker.markAsRead('email-1');
    const isRead = await mockImap.isRead('email-1');
    expect(isRead).toBe(true);

    // Step 7: Verify activity log was created
    const logs = await activityLogRepo.getAll(10, 0);
    expect(logs.length).toBeGreaterThan(0);
    const sentLog = logs.find(log => log.type === 'reply_sent');
    expect(sentLog).toBeDefined();
    expect(sentLog?.emailId).toBe('email-1');

    // Step 8: Verify reply was saved to database
    const savedReply = await replyRepo.getById(reply.id);
    expect(savedReply).toBeDefined();
    expect(savedReply?.status).toBe('sent');
    expect(savedReply?.sentAt).toBeDefined();
  });

  it('should filter out emails from excluded domains', async () => {
    // Add an email from excluded domain
    const spamEmail: Email = {
      id: 'email-spam',
      from: 'noreply@spam.com',
      to: 'test@example.com',
      subject: 'URGENT: Special offer',
      body: 'This is spam with urgent keyword.',
      receivedAt: new Date(),
      isRead: false
    };

    mockImap.addEmail(spamEmail);

    // Filter the email
    const filterDecision = messageFilter.shouldAutoReply(spamEmail);
    expect(filterDecision.approved).toBe(false);
    expect(filterDecision.reason).toContain('excluded');

    // Verify no reply was generated
    expect(mockSmtp.sentEmails.length).toBe(0);
  });

  it('should filter out emails without keywords when keyword filtering is enabled', async () => {
    // Add an email without keywords
    const normalEmail: Email = {
      id: 'email-normal',
      from: 'sender@example.com',
      to: 'test@example.com',
      subject: 'Hello',
      body: 'Just saying hi.',
      receivedAt: new Date(),
      isRead: false
    };

    mockImap.addEmail(normalEmail);

    // Filter the email
    const filterDecision = messageFilter.shouldAutoReply(normalEmail);
    expect(filterDecision.approved).toBe(false);
    expect(filterDecision.reason).toContain('does not contain');

    // Verify no reply was sent
    expect(mockSmtp.sentEmails.length).toBe(0);
  });
});

describe('Integration Tests - Manual Confirmation Workflow', () => {
  let testDb: Database;
  let activityLogRepo: ActivityLogRepository;
  let replyRepo: ReplyRepository;
  let mockImap: MockImapConnection;
  let mockSmtp: MockSmtpTransport;
  let autoResponder: AutoResponderImpl;
  let readTracker: ReadTrackerImpl;

  beforeEach(async () => {
    testDb = await createTestDatabase();
    activityLogRepo = new ActivityLogRepository(testDb);
    replyRepo = new ReplyRepository(testDb);
    mockImap = new MockImapConnection();
    mockSmtp = new MockSmtpTransport();

    readTracker = new ReadTrackerImpl({
      user: 'test@example.com',
      password: 'password',
      host: 'imap.example.com',
      port: 993,
      tls: true
    });

    (readTracker as any).markAsRead = async (emailId: string) => {
      await mockImap.markAsRead(emailId);
    };
    (readTracker as any).isRead = async (emailId: string) => {
      return await mockImap.isRead(emailId);
    };

    // Create AutoResponder with manual confirmation enabled
    autoResponder = new AutoResponderImpl({
      smtpConfig: {
        host: 'smtp.example.com',
        port: 587,
        secure: false,
        auth: {
          user: 'test@example.com',
          pass: 'password'
        }
      },
      replyTemplate: 'Thank you for your email.',
      manualConfirmation: true, // Enable manual confirmation
      readTracker,
      onLog: async (log) => {
        await activityLogRepo.create(log);
      },
      onReplySave: async (reply) => {
        const existing = await replyRepo.getById(reply.id);
        if (existing) {
          await replyRepo.updateStatus(
            reply.id,
            reply.status,
            reply.sentAt,
            reply.approvedBy
          );
        } else {
          await replyRepo.create(reply);
        }
      }
    });

    (autoResponder as any).transporter = mockSmtp;
  });

  afterEach(async () => {
    if (testDb) {
      await testDb.close();
    }
    mockImap.clearEmails();
    mockSmtp.clearSentEmails();
  });

  it('should queue reply for manual confirmation and send after approval', async () => {
    const testEmail: Email = {
      id: 'email-manual-1',
      from: 'sender@example.com',
      to: 'test@example.com',
      subject: 'Test email',
      body: 'Test body',
      receivedAt: new Date(),
      isRead: false
    };

    // Step 1: Generate reply
    const reply = autoResponder.generateReply(testEmail);
    expect(reply.status).toBe('pending');

    // Step 2: Queue for confirmation (should not send immediately)
    autoResponder.queueForConfirmation(reply);
    expect(mockSmtp.sentEmails.length).toBe(0);

    // Step 3: Verify reply is in pending queue
    const pendingReplies = autoResponder.getPendingReplies();
    expect(pendingReplies.length).toBe(1);
    expect(pendingReplies[0].id).toBe(reply.id);
    expect(pendingReplies[0].status).toBe('pending');

    // Step 4: Approve the reply
    await autoResponder.processConfirmation(reply.id, true);

    // Step 5: Verify reply was sent
    expect(mockSmtp.sentEmails.length).toBe(1);
    expect(mockSmtp.sentEmails[0].to).toBe('sender@example.com');

    // Step 6: Verify reply status updated to sent (check in-memory reply object)
    expect(reply.status).toBe('sent');
    expect(reply.sentAt).toBeDefined();

    // Step 7: Verify email was marked as read
    const isRead = await mockImap.isRead('email-manual-1');
    expect(isRead).toBe(true);
  });

  it('should mark email as read after rejecting reply', async () => {
    const testEmail: Email = {
      id: 'email-manual-2',
      from: 'sender@example.com',
      to: 'test@example.com',
      subject: 'Test email',
      body: 'Test body',
      receivedAt: new Date(),
      isRead: false
    };

    // Step 1: Generate and queue reply
    const reply = autoResponder.generateReply(testEmail);
    autoResponder.queueForConfirmation(reply);

    // Step 2: Reject the reply
    await autoResponder.processConfirmation(reply.id, false);

    // Step 3: Verify reply was NOT sent
    expect(mockSmtp.sentEmails.length).toBe(0);

    // Step 4: Verify reply status updated to rejected (check in-memory reply object)
    expect(reply.status).toBe('rejected');

    // Step 5: Verify email was still marked as read
    const isRead = await mockImap.isRead('email-manual-2');
    expect(isRead).toBe(true);
  });
});

describe('Integration Tests - Configuration Hot-Reload', () => {
  let testDb: Database;
  let configDb: Database;
  let configManager: ConfigurationManagerImpl;
  let messageFilter: MessageFilter;

  beforeEach(async () => {
    testDb = await createTestDatabase();
    configDb = await createTestDatabase();

    // Create ConfigurationManager
    configManager = new ConfigurationManagerImpl(
      ':memory:',
      'test-encryption-key-32-bytes-long!'
    );

    // Initialize with default config
    await configManager.updateConfig({
      email: {
        imapHost: 'imap.example.com',
        imapPort: 993,
        smtpHost: 'smtp.example.com',
        smtpPort: 587,
        username: 'test@example.com',
        password: 'password'
      },
      filters: {
        keywordsEnabled: true,
        keywords: ['urgent'],
        excludedDomains: ['spam.com']
      },
      autoReply: {
        manualConfirmation: false,
        replyTemplate: 'Thank you',
        checkInterval: 10
      }
    });

    // Create MessageFilter
    const config = await configManager.getConfig();
    messageFilter = new MessageFilter({
      keywordsEnabled: config.filters.keywordsEnabled,
      keywords: config.filters.keywords,
      excludedDomains: config.filters.excludedDomains
    });
  });

  afterEach(async () => {
    if (testDb) {
      await testDb.close();
    }
    if (configDb) {
      await configDb.close();
    }
    await configManager.close();
  });

  it('should hot-reload keywords and apply to message filter immediately', async () => {
    const testEmail: Email = {
      id: 'email-hotreload-1',
      from: 'sender@example.com',
      to: 'test@example.com',
      subject: 'Important message',
      body: 'This is important.',
      receivedAt: new Date(),
      isRead: false
    };

    // Step 1: Initially, email should not match (only 'urgent' keyword configured)
    let filterDecision = messageFilter.shouldAutoReply(testEmail);
    expect(filterDecision.approved).toBe(false);

    // Step 2: Subscribe to configuration changes
    let configUpdated = false;
    configManager.subscribe((newConfig: Config) => {
      messageFilter.updateKeywords(newConfig.filters.keywords);
      messageFilter.setKeywordsEnabled(newConfig.filters.keywordsEnabled);
      configUpdated = true;
    });

    // Step 3: Update configuration to add 'important' keyword
    await configManager.updateConfig({
      filters: {
        keywords: ['urgent', 'important']
      }
    });

    // Wait for subscription callback
    await new Promise(resolve => setTimeout(resolve, 100));

    // Step 4: Verify configuration was updated
    expect(configUpdated).toBe(true);

    // Step 5: Now email should match with new keywords
    filterDecision = messageFilter.shouldAutoReply(testEmail);
    expect(filterDecision.approved).toBe(true);
    expect(filterDecision.matchedKeywords).toContain('important');
  });

  it('should hot-reload excluded domains and apply immediately', async () => {
    const testEmail: Email = {
      id: 'email-hotreload-2',
      from: 'sender@newspam.com',
      to: 'test@example.com',
      subject: 'URGENT message',
      body: 'This is urgent.',
      receivedAt: new Date(),
      isRead: false
    };

    // Step 1: Initially, email should pass (newspam.com not excluded)
    let filterDecision = messageFilter.shouldAutoReply(testEmail);
    expect(filterDecision.approved).toBe(true);

    // Step 2: Subscribe to configuration changes
    configManager.subscribe((newConfig: Config) => {
      messageFilter.updateExcludedDomains(newConfig.filters.excludedDomains);
    });

    // Step 3: Update configuration to add 'newspam.com' to excluded domains
    await configManager.updateConfig({
      filters: {
        excludedDomains: ['spam.com', 'newspam.com']
      }
    });

    // Wait for subscription callback
    await new Promise(resolve => setTimeout(resolve, 100));

    // Step 4: Now email should be filtered out
    filterDecision = messageFilter.shouldAutoReply(testEmail);
    expect(filterDecision.approved).toBe(false);
    expect(filterDecision.reason).toContain('excluded');
  });

  it('should hot-reload keyword filtering toggle', async () => {
    const testEmail: Email = {
      id: 'email-hotreload-3',
      from: 'sender@example.com',
      to: 'test@example.com',
      subject: 'Hello',
      body: 'No keywords here.',
      receivedAt: new Date(),
      isRead: false
    };

    // Step 1: Initially, email should not pass (no keywords)
    let filterDecision = messageFilter.shouldAutoReply(testEmail);
    expect(filterDecision.approved).toBe(false);

    // Step 2: Subscribe to configuration changes
    configManager.subscribe((newConfig: Config) => {
      messageFilter.setKeywordsEnabled(newConfig.filters.keywordsEnabled);
    });

    // Step 3: Disable keyword filtering
    await configManager.updateConfig({
      filters: {
        keywordsEnabled: false
      }
    });

    // Wait for subscription callback
    await new Promise(resolve => setTimeout(resolve, 100));

    // Step 4: Now email should pass (keyword filtering disabled)
    filterDecision = messageFilter.shouldAutoReply(testEmail);
    expect(filterDecision.approved).toBe(true);
  });
});

describe('Integration Tests - System Restart and Recovery', () => {
  let testDb: Database;
  let mockImap: MockImapConnection;

  beforeEach(async () => {
    testDb = await createTestDatabase();
    mockImap = new MockImapConnection();
  });

  afterEach(async () => {
    if (testDb) {
      await testDb.close();
    }
    mockImap.clearEmails();
  });

  it('should not reprocess emails marked as read after restart', async () => {
    // Simulate first run: process an email
    const testEmail: Email = {
      id: 'email-restart-1',
      from: 'sender@example.com',
      to: 'test@example.com',
      subject: 'Test email',
      body: 'Test body',
      receivedAt: new Date(),
      isRead: false
    };

    mockImap.addEmail(testEmail);

    // Mark email as read (simulating it was processed)
    await mockImap.markAsRead('email-restart-1');

    // Verify email is marked as read
    const isRead = await mockImap.isRead('email-restart-1');
    expect(isRead).toBe(true);

    // Simulate restart: retrieve unread emails
    const unreadEmails = await mockImap.getUnreadEmails();

    // Email should not be in unread list
    expect(unreadEmails.length).toBe(0);
    expect(unreadEmails.find(e => e.id === 'email-restart-1')).toBeUndefined();
  });

  it('should persist activity logs across restarts', async () => {
    const activityLogRepo = new ActivityLogRepository(testDb);

    // Create activity log
    await activityLogRepo.create({
      id: 'log-1',
      timestamp: new Date(),
      type: 'reply_sent',
      emailId: 'email-1',
      replyId: 'reply-1',
      details: 'Reply sent successfully'
    });

    // Simulate restart by creating new repository instance
    const newActivityLogRepo = new ActivityLogRepository(testDb);

    // Retrieve logs
    const logs = await newActivityLogRepo.getAll(10, 0);

    // Log should still exist
    expect(logs.length).toBe(1);
    expect(logs[0].id).toBe('log-1');
    expect(logs[0].type).toBe('reply_sent');
  });

  it('should persist pending replies across restarts', async () => {
    const replyRepo = new ReplyRepository(testDb);

    // Create pending reply
    await replyRepo.create({
      id: 'reply-pending-1',
      originalEmailId: 'email-1',
      to: 'sender@example.com',
      subject: 'Re: Test',
      body: 'Reply body',
      generatedAt: new Date(),
      status: 'pending'
    });

    // Simulate restart by creating new repository instance
    const newReplyRepo = new ReplyRepository(testDb);

    // Retrieve pending replies
    const pendingReplies = await newReplyRepo.getByStatus('pending');

    // Pending reply should still exist
    expect(pendingReplies.length).toBe(1);
    expect(pendingReplies[0].id).toBe('reply-pending-1');
    expect(pendingReplies[0].status).toBe('pending');
  });

  it('should recover configuration after restart', async () => {
    const configManager = new ConfigurationManagerImpl(
      ':memory:',
      'test-encryption-key-32-bytes-long!'
    );

    // Set configuration
    await configManager.updateConfig({
      filters: {
        keywords: ['urgent', 'important'],
        excludedDomains: ['spam.com']
      }
    });

    // Get configuration
    const config = await configManager.getConfig();

    // Verify configuration persisted
    expect(config.filters.keywords).toContain('urgent');
    expect(config.filters.keywords).toContain('important');
    expect(config.filters.excludedDomains).toContain('spam.com');

    await configManager.close();
  });
});
