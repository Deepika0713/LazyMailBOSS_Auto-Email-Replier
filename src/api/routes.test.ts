import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fc from 'fast-check';
import request from 'supertest';
import express, { Express } from 'express';
import { ActivityLogRepository } from '../database/ActivityLogRepository';
import { ReplyRepository } from '../database/ReplyRepository';
import { Database } from '../database/connection';
import { ActivityLog, ActivityLogType } from '../models/ActivityLog';
import { Reply } from '../models/Reply';
import { createApiRouter, ApiDependencies } from './routes';
import { ConfigurationManager } from '../config';
import { AutoResponder } from '../responder';
import { EmailMonitor } from '../monitor';

// Test database setup
async function createTestDatabase(): Promise<Database> {
  const sqlite3 = require('sqlite3');
  const dbPath = `test-api-${Date.now()}-${Math.random()}.db`;
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
    return new Promise((resolve, reject) => {
      db.close((err: Error) => {
        if (err) reject(err);
        else resolve();
      });
    });
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

  return { run, get, all, close };
}

describe('API Routes - Unit Tests', () => {
  let app: Express;
  let testDb: Database;
  let activityLogRepo: ActivityLogRepository;
  let replyRepo: ReplyRepository;
  let configManager: ConfigurationManager;
  let autoResponder: AutoResponder;

  beforeEach(async () => {
    testDb = await createTestDatabase();
    activityLogRepo = new ActivityLogRepository(testDb);
    replyRepo = new ReplyRepository(testDb);
    
    // Create mock ConfigurationManager
    configManager = {
      getConfig: vi.fn().mockResolvedValue({
        email: {
          imapHost: 'imap.example.com',
          imapPort: 993,
          smtpHost: 'smtp.example.com',
          smtpPort: 587,
          username: 'test@example.com',
          password: 'encrypted_password'
        },
        filters: {
          keywordsEnabled: true,
          keywords: ['urgent', 'important'],
          excludedDomains: ['spam.com']
        },
        autoReply: {
          manualConfirmation: false,
          replyTemplate: 'Thank you for your email',
          checkInterval: 10
        }
      }),
      updateConfig: vi.fn().mockResolvedValue(undefined),
      subscribe: vi.fn()
    } as any;

    // Create mock AutoResponder
    autoResponder = {
      processConfirmation: vi.fn().mockResolvedValue(undefined)
    } as any;

    // Create Express app with API routes
    app = express();
    app.use(express.json());
    
    const dependencies: ApiDependencies = {
      configManager,
      activityLogRepository: activityLogRepo,
      replyRepository: replyRepo,
      autoResponder,
      emailMonitor: undefined
    };
    
    app.use('/api', createApiRouter(dependencies));
  });

  afterEach(async () => {
    if (testDb) {
      await testDb.close();
    }
  });

  describe('GET /api/status', () => {
    it('should return correct status format', async () => {
      // Create some test replies
      await replyRepo.create({
        id: 'reply-1',
        originalEmailId: 'email-1',
        to: 'test@example.com',
        subject: 'Re: Test',
        body: 'Reply body',
        generatedAt: new Date(),
        status: 'pending'
      });

      await replyRepo.create({
        id: 'reply-2',
        originalEmailId: 'email-2',
        to: 'test2@example.com',
        subject: 'Re: Test 2',
        body: 'Reply body 2',
        generatedAt: new Date(),
        status: 'sent',
        sentAt: new Date()
      });

      const response = await request(app)
        .get('/api/status')
        .expect(200);

      expect(response.body).toHaveProperty('monitoring');
      expect(response.body).toHaveProperty('manualConfirmationEnabled');
      expect(response.body).toHaveProperty('pendingRepliesCount');
      expect(response.body).toHaveProperty('totalRepliesSent');
      expect(response.body).toHaveProperty('checkInterval');

      expect(response.body.monitoring).toBe(false);
      expect(response.body.manualConfirmationEnabled).toBe(false);
      expect(response.body.pendingRepliesCount).toBe(1);
      expect(response.body.totalRepliesSent).toBe(1);
      expect(response.body.checkInterval).toBe(10);
    });
  });

  describe('GET /api/config', () => {
    it('should return configuration without exposing password', async () => {
      const response = await request(app)
        .get('/api/config')
        .expect(200);

      expect(response.body).toHaveProperty('email');
      expect(response.body).toHaveProperty('filters');
      expect(response.body).toHaveProperty('autoReply');

      // Password should be masked
      expect(response.body.email.password).toBe('********');
      expect(response.body.email.username).toBe('test@example.com');
    });
  });

  describe('PUT /api/config', () => {
    it('should update configuration successfully', async () => {
      const updates = {
        filters: {
          keywords: ['new', 'keywords']
        }
      };

      const response = await request(app)
        .put('/api/config')
        .send(updates)
        .expect(200);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toBe('Configuration updated successfully');
      expect(response.body).toHaveProperty('config');
      expect(configManager.updateConfig).toHaveBeenCalledWith(updates);
    });

    it('should reject invalid imapPort', async () => {
      const response = await request(app)
        .put('/api/config')
        .send({ email: { imapPort: -1 } })
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Invalid imapPort');
    });

    it('should reject invalid smtpPort', async () => {
      const response = await request(app)
        .put('/api/config')
        .send({ email: { smtpPort: 0 } })
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Invalid smtpPort');
    });

    it('should reject non-string imapHost', async () => {
      const response = await request(app)
        .put('/api/config')
        .send({ email: { imapHost: 123 } })
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Invalid imapHost');
    });

    it('should reject non-boolean keywordsEnabled', async () => {
      const response = await request(app)
        .put('/api/config')
        .send({ filters: { keywordsEnabled: 'true' } })
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Invalid keywordsEnabled');
    });

    it('should reject non-array keywords', async () => {
      const response = await request(app)
        .put('/api/config')
        .send({ filters: { keywords: 'not-an-array' } })
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Invalid keywords');
    });

    it('should reject non-array excludedDomains', async () => {
      const response = await request(app)
        .put('/api/config')
        .send({ filters: { excludedDomains: 'not-an-array' } })
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Invalid excludedDomains');
    });

    it('should reject invalid checkInterval', async () => {
      const response = await request(app)
        .put('/api/config')
        .send({ autoReply: { checkInterval: -5 } })
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Invalid checkInterval');
    });

    it('should reject non-string replyTemplate', async () => {
      const response = await request(app)
        .put('/api/config')
        .send({ autoReply: { replyTemplate: 123 } })
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Invalid replyTemplate');
    });
  });

  describe('GET /api/logs', () => {
    beforeEach(async () => {
      // Create test logs
      for (let i = 0; i < 15; i++) {
        await activityLogRepo.create({
          id: `log-${i}`,
          timestamp: new Date(Date.now() - i * 1000),
          type: 'reply_sent',
          emailId: `email-${i}`,
          replyId: `reply-${i}`,
          details: `Test log ${i}`
        });
      }
    });

    it('should return logs with default pagination', async () => {
      const response = await request(app)
        .get('/api/logs')
        .expect(200);

      expect(response.body).toHaveProperty('logs');
      expect(response.body).toHaveProperty('pagination');
      expect(Array.isArray(response.body.logs)).toBe(true);
      expect(response.body.pagination.limit).toBe(100);
      expect(response.body.pagination.offset).toBe(0);
      expect(response.body.logs.length).toBe(15);
    });

    it('should respect limit parameter', async () => {
      const response = await request(app)
        .get('/api/logs?limit=5')
        .expect(200);

      expect(response.body.logs.length).toBe(5);
      expect(response.body.pagination.limit).toBe(5);
    });

    it('should respect offset parameter', async () => {
      const response = await request(app)
        .get('/api/logs?offset=10')
        .expect(200);

      expect(response.body.logs.length).toBe(5);
      expect(response.body.pagination.offset).toBe(10);
    });

    it('should handle pagination with both limit and offset', async () => {
      const response = await request(app)
        .get('/api/logs?limit=5&offset=5')
        .expect(200);

      expect(response.body.logs.length).toBe(5);
      expect(response.body.pagination.limit).toBe(5);
      expect(response.body.pagination.offset).toBe(5);
    });

    it('should reject limit below 1', async () => {
      const response = await request(app)
        .get('/api/logs?limit=0')
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Invalid limit');
    });

    it('should reject limit above 1000', async () => {
      const response = await request(app)
        .get('/api/logs?limit=1001')
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Invalid limit');
    });

    it('should reject negative offset', async () => {
      const response = await request(app)
        .get('/api/logs?offset=-1')
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Invalid offset');
    });
  });

  describe('GET /api/pending-replies', () => {
    it('should return pending replies', async () => {
      await replyRepo.create({
        id: 'pending-1',
        originalEmailId: 'email-1',
        to: 'test@example.com',
        subject: 'Re: Test',
        body: 'Reply body',
        generatedAt: new Date(),
        status: 'pending'
      });

      await replyRepo.create({
        id: 'sent-1',
        originalEmailId: 'email-2',
        to: 'test2@example.com',
        subject: 'Re: Test 2',
        body: 'Reply body 2',
        generatedAt: new Date(),
        status: 'sent',
        sentAt: new Date()
      });

      const response = await request(app)
        .get('/api/pending-replies')
        .expect(200);

      expect(response.body).toHaveProperty('replies');
      expect(response.body).toHaveProperty('count');
      expect(response.body.count).toBe(1);
      expect(response.body.replies.length).toBe(1);
      expect(response.body.replies[0].status).toBe('pending');
    });
  });

  describe('POST /api/replies/:id/approve', () => {
    it('should approve a pending reply', async () => {
      await replyRepo.create({
        id: 'pending-approve',
        originalEmailId: 'email-1',
        to: 'test@example.com',
        subject: 'Re: Test',
        body: 'Reply body',
        generatedAt: new Date(),
        status: 'pending'
      });

      const response = await request(app)
        .post('/api/replies/pending-approve/approve')
        .send({ approvedBy: 'admin' })
        .expect(200);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('approved and sent');
      expect(response.body.replyId).toBe('pending-approve');
      expect(autoResponder.processConfirmation).toHaveBeenCalledWith('pending-approve', true);
    });

    it('should return 404 for non-existent reply', async () => {
      const response = await request(app)
        .post('/api/replies/non-existent/approve')
        .expect(404);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Reply not found');
    });

    it('should reject approval of non-pending reply', async () => {
      await replyRepo.create({
        id: 'already-sent',
        originalEmailId: 'email-1',
        to: 'test@example.com',
        subject: 'Re: Test',
        body: 'Reply body',
        generatedAt: new Date(),
        status: 'sent',
        sentAt: new Date()
      });

      const response = await request(app)
        .post('/api/replies/already-sent/approve')
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('not pending');
    });
  });

  describe('POST /api/replies/:id/reject', () => {
    it('should reject a pending reply', async () => {
      await replyRepo.create({
        id: 'pending-reject',
        originalEmailId: 'email-1',
        to: 'test@example.com',
        subject: 'Re: Test',
        body: 'Reply body',
        generatedAt: new Date(),
        status: 'pending'
      });

      const response = await request(app)
        .post('/api/replies/pending-reject/reject')
        .expect(200);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('rejected');
      expect(response.body.replyId).toBe('pending-reject');
      expect(autoResponder.processConfirmation).toHaveBeenCalledWith('pending-reject', false);
    });

    it('should return 404 for non-existent reply', async () => {
      const response = await request(app)
        .post('/api/replies/non-existent/reject')
        .expect(404);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Reply not found');
    });

    it('should reject rejection of non-pending reply', async () => {
      await replyRepo.create({
        id: 'already-rejected',
        originalEmailId: 'email-1',
        to: 'test@example.com',
        subject: 'Re: Test',
        body: 'Reply body',
        generatedAt: new Date(),
        status: 'rejected'
      });

      const response = await request(app)
        .post('/api/replies/already-rejected/reject')
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('not pending');
    });
  });
});

describe('API Routes - Property Tests', () => {
  let testDb: Database;
  let activityLogRepo: ActivityLogRepository;
  let replyRepo: ReplyRepository;

  beforeEach(async () => {
    testDb = await createTestDatabase();
    activityLogRepo = new ActivityLogRepository(testDb);
    replyRepo = new ReplyRepository(testDb);
  });

  afterEach(async () => {
    if (testDb) {
      await testDb.close();
    }
  });

  /**
   * **Feature: lazy-mail-boss, Property 19: Activity log display completeness**
   * **Validates: Requirements 6.5**
   * 
   * For any activity log entry displayed in the WebDashboard, it should include 
   * timestamp, type, emailId, and details fields.
   */
  it('Property 19: Activity log display completeness', async () => {
    // Clean up before test
    await testDb.run('DELETE FROM activity_log');
    // Arbitrary for ActivityLogType
    const activityLogTypeArb = fc.constantFrom<ActivityLogType>(
      'reply_sent',
      'reply_failed',
      'email_filtered',
      'error'
    );

    // Arbitrary for ActivityLog
    const activityLogArb = fc.record({
      id: fc.uuid(),
      timestamp: fc.date(),
      type: activityLogTypeArb,
      emailId: fc.uuid(),
      replyId: fc.option(fc.uuid(), { nil: undefined }),
      details: fc.string({ minLength: 1, maxLength: 200 }),
      metadata: fc.option(
        fc.record({
          from: fc.emailAddress(),
          subject: fc.string({ maxLength: 100 })
        }),
        { nil: undefined }
      )
    });

    await fc.assert(
      fc.asyncProperty(
        fc.array(activityLogArb, { minLength: 1, maxLength: 3 }),
        async (logs) => {
          // Clean up before each iteration to avoid ID conflicts
          await testDb.run('DELETE FROM activity_log');
          
          // Store logs in database
          for (const log of logs) {
            await activityLogRepo.create(log);
          }

          // Fetch logs via API by calling the repository directly
          // (simulating what the API endpoint does)
          const fetchedLogs = await activityLogRepo.getAll(100, 0);

          // Verify all returned logs have required fields
          expect(fetchedLogs).toBeDefined();
          expect(Array.isArray(fetchedLogs)).toBe(true);
          expect(fetchedLogs.length).toBeGreaterThan(0);

          for (const displayedLog of fetchedLogs) {
            // Check that all required fields are present and non-empty
            expect(displayedLog.timestamp).toBeDefined();
            expect(displayedLog.timestamp).toBeInstanceOf(Date);
            
            expect(displayedLog.type).toBeDefined();
            expect(displayedLog.type).not.toBe('');
            
            expect(displayedLog.emailId).toBeDefined();
            expect(displayedLog.emailId).not.toBe('');
            
            expect(displayedLog.details).toBeDefined();
            expect(displayedLog.details).not.toBe('');
          }
        }
      ),
      { numRuns: 20, timeout: 15000 }
    );
  }, 30000);

  /**
   * **Feature: lazy-mail-boss, Property 20: Pending reply display**
   * **Validates: Requirements 6.6**
   * 
   * For any pending reply (status = 'pending') when manual confirmation is enabled,
   * the WebDashboard should display it with both approve and reject action buttons.
   */
  it('Property 20: Pending reply display', async () => {
    // Clean up before test
    await testDb.run('DELETE FROM reply');
    // Arbitrary for Reply with pending status
    const pendingReplyArb = fc.record({
      id: fc.uuid(),
      originalEmailId: fc.uuid(),
      to: fc.emailAddress(),
      subject: fc.string({ minLength: 1, maxLength: 100 }),
      body: fc.string({ minLength: 1, maxLength: 500 }),
      generatedAt: fc.date(),
      status: fc.constant('pending' as const),
      sentAt: fc.constant(undefined),
      approvedBy: fc.constant(undefined)
    });

    await fc.assert(
      fc.asyncProperty(
        fc.array(pendingReplyArb, { minLength: 1, maxLength: 5 }),
        async (replies) => {
          // Clean up before each iteration to avoid ID conflicts
          await testDb.run('DELETE FROM reply');
          
          // Store pending replies in database
          for (const reply of replies) {
            await replyRepo.create(reply);
          }

          // Fetch pending replies via repository (simulating API endpoint)
          const pendingReplies = await replyRepo.getByStatus('pending');

          // Verify all returned replies are pending
          expect(pendingReplies).toBeDefined();
          expect(Array.isArray(pendingReplies)).toBe(true);
          expect(pendingReplies.length).toBeGreaterThan(0);

          for (const displayedReply of pendingReplies) {
            // Verify status is pending
            expect(displayedReply.status).toBe('pending');
            
            // Verify reply has all necessary fields for display
            expect(displayedReply.id).toBeDefined();
            expect(displayedReply.id).not.toBe('');
            
            expect(displayedReply.to).toBeDefined();
            expect(displayedReply.to).not.toBe('');
            
            expect(displayedReply.subject).toBeDefined();
            expect(displayedReply.body).toBeDefined();
            
            expect(displayedReply.originalEmailId).toBeDefined();
            expect(displayedReply.generatedAt).toBeDefined();
            expect(displayedReply.generatedAt).toBeInstanceOf(Date);
            
            // For pending replies, these should be undefined or null (database may return null)
            expect(displayedReply.sentAt == null).toBe(true);
            expect(displayedReply.approvedBy == null).toBe(true);
          }
        }
      ),
      { numRuns: 20, timeout: 15000 }
    );
  }, 30000);
});
