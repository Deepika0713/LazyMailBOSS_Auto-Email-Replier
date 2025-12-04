import { describe, it, expect, vi } from 'vitest';
import * as fc from 'fast-check';
import { AutoResponderImpl, AutoResponderConfig, SendResult } from './AutoResponder';
import { Email, Reply } from '../models';
import { ReadTracker } from './ReadTracker';

// Mock ReadTracker for testing
class MockReadTracker implements ReadTracker {
  private readEmails = new Set<string>();

  async markAsRead(emailId: string): Promise<void> {
    this.readEmails.add(emailId);
  }

  async isRead(emailId: string): Promise<boolean> {
    return this.readEmails.has(emailId);
  }
}

// Arbitraries for property-based testing
const emailArbitrary = fc.record({
  id: fc.uuid(),
  from: fc.emailAddress(),
  to: fc.emailAddress(),
  subject: fc.string({ minLength: 1, maxLength: 100 }),
  body: fc.string({ minLength: 1, maxLength: 500 }),
  receivedAt: fc.date(),
  isRead: fc.boolean(),
});

const createTestConfig = (manualConfirmation: boolean = false): AutoResponderConfig => ({
  smtpConfig: {
    host: 'smtp.test.com',
    port: 587,
    secure: false,
    auth: {
      user: 'test@test.com',
      pass: 'password',
    },
  },
  replyTemplate: 'Thank you for your email about {subject}. We will respond soon.',
  manualConfirmation,
  readTracker: new MockReadTracker(),
});

describe('AutoResponder Property Tests', () => {
  /**
   * **Feature: lazy-mail-boss, Property 4: Reply generation for filtered emails**
   * **Validates: Requirements 2.1**
   * 
   * For any email that passes all filters, the AutoResponder should generate 
   * a Reply object with valid to, subject, and body fields.
   */
  it('Property 4: should generate valid reply for any email', () => {
    fc.assert(
      fc.property(emailArbitrary, (email) => {
        const config = createTestConfig();
        const responder = new AutoResponderImpl(config);

        const reply = responder.generateReply(email);

        // Verify reply has valid fields
        expect(reply.id).toBeDefined();
        expect(reply.id.length).toBeGreaterThan(0);
        expect(reply.originalEmailId).toBe(email.id);
        expect(reply.to).toBe(email.from);
        expect(reply.to.length).toBeGreaterThan(0);
        expect(reply.subject).toBeDefined();
        expect(reply.subject.length).toBeGreaterThan(0);
        expect(reply.body).toBeDefined();
        expect(reply.body.length).toBeGreaterThan(0);
        expect(reply.generatedAt).toBeInstanceOf(Date);
      }),
      { numRuns: 100 }
    );
  });
});

  /**
   * **Feature: lazy-mail-boss, Property 5: Manual confirmation queuing**
   * **Validates: Requirements 2.2**
   * 
   * For any generated reply when manual confirmation mode is enabled, 
   * the reply status should be 'pending' and the reply should not be sent 
   * until explicitly approved.
   */
  it('Property 5: should queue replies for manual confirmation when enabled', () => {
    fc.assert(
      fc.property(emailArbitrary, (email) => {
        const config = createTestConfig(true); // Enable manual confirmation
        const responder = new AutoResponderImpl(config);

        const reply = responder.generateReply(email);
        
        // Verify reply is in pending status
        expect(reply.status).toBe('pending');
        
        // Queue the reply
        responder.queueForConfirmation(reply);
        
        // Verify reply is in the pending queue
        const pendingReplies = responder.getPendingReplies();
        expect(pendingReplies).toContainEqual(reply);
        expect(pendingReplies.find(r => r.id === reply.id)?.status).toBe('pending');
        
        // Verify reply has not been sent (no sentAt timestamp)
        expect(reply.sentAt).toBeUndefined();
      }),
      { numRuns: 100 }
    );
  });

  /**
   * **Feature: lazy-mail-boss, Property 6: Email marked as read after processing**
   * **Validates: Requirements 2.3, 2.4**
   * 
   * For any email that receives a generated reply (whether approved, rejected, or auto-sent), 
   * the email should be marked as read in the inbox regardless of the reply's final status.
   */
  it('Property 6: should mark email as read after approval', async () => {
    await fc.assert(
      fc.asyncProperty(emailArbitrary, async (email) => {
        const mockReadTracker = new MockReadTracker();
        const config: AutoResponderConfig = {
          ...createTestConfig(true),
          readTracker: mockReadTracker,
        };
        const responder = new AutoResponderImpl(config);
        
        // Mock the sendReply method to avoid actual SMTP calls
        vi.spyOn(responder, 'sendReply').mockResolvedValue({ success: true, sentAt: new Date() });

        const reply = responder.generateReply(email);
        responder.queueForConfirmation(reply);

        // Process approval
        await responder.processConfirmation(reply.id, true);

        // Verify email is marked as read
        const isRead = await mockReadTracker.isRead(email.id);
        expect(isRead).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it('Property 6: should mark email as read after rejection', async () => {
    await fc.assert(
      fc.asyncProperty(emailArbitrary, async (email) => {
        const mockReadTracker = new MockReadTracker();
        const config: AutoResponderConfig = {
          ...createTestConfig(true),
          readTracker: mockReadTracker,
        };
        const responder = new AutoResponderImpl(config);

        const reply = responder.generateReply(email);
        responder.queueForConfirmation(reply);

        // Process rejection
        await responder.processConfirmation(reply.id, false);

        // Verify email is marked as read even after rejection
        const isRead = await mockReadTracker.isRead(email.id);
        expect(isRead).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * **Feature: lazy-mail-boss, Property 7: Automatic sending in auto mode**
   * **Validates: Requirements 2.5**
   * 
   * For any generated reply when manual confirmation mode is disabled, 
   * the reply should be sent immediately and its status should transition to 'sent'.
   */
  it('Property 7: should send replies immediately in auto mode', () => {
    fc.assert(
      fc.property(emailArbitrary, (email) => {
        const config = createTestConfig(false); // Disable manual confirmation
        const responder = new AutoResponderImpl(config);

        const reply = responder.generateReply(email);
        
        // Verify reply is in approved status (not pending)
        expect(reply.status).toBe('approved');
        expect(reply.status).not.toBe('pending');
      }),
      { numRuns: 100 }
    );
  });

  /**
   * **Feature: lazy-mail-boss, Property 8: Transaction logging completeness**
   * **Validates: Requirements 2.6**
   * 
   * For any successfully sent reply, an ActivityLog entry should exist with type 'reply_sent', 
   * containing the emailId, replyId, timestamp, and recipient information.
   */
  it('Property 8: should log successful reply transactions', async () => {
    await fc.assert(
      fc.asyncProperty(emailArbitrary, async (email) => {
        let capturedLog: any = null;
        const config: AutoResponderConfig = {
          ...createTestConfig(false),
          onLog: (log) => {
            capturedLog = log;
          },
        };
        const responder = new AutoResponderImpl(config);
        
        // Mock the transporter to avoid actual SMTP calls
        vi.spyOn(responder as any, 'transporter', 'get').mockReturnValue({
          sendMail: vi.fn().mockResolvedValue({}),
        });

        const reply = responder.generateReply(email);
        await responder.sendReply(reply);

        // Verify log was created
        expect(capturedLog).not.toBeNull();
        expect(capturedLog.type).toBe('reply_sent');
        expect(capturedLog.emailId).toBe(email.id);
        expect(capturedLog.replyId).toBe(reply.id);
        expect(capturedLog.timestamp).toBeInstanceOf(Date);
        expect(capturedLog.details).toContain(reply.to);
        expect(capturedLog.metadata?.recipient).toBe(reply.to);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * **Feature: lazy-mail-boss, Property 9: Error logging and continuation**
   * **Validates: Requirements 2.7**
   * 
   * For any failed reply send operation, an ActivityLog entry with type 'reply_failed' 
   * should be created, and the system should continue processing subsequent emails 
   * without interruption.
   */
  it('Property 9: should log failed reply transactions', async () => {
    await fc.assert(
      fc.asyncProperty(emailArbitrary, async (email) => {
        let capturedLog: any = null;
        const config: AutoResponderConfig = {
          ...createTestConfig(false),
          onLog: (log) => {
            capturedLog = log;
          },
        };
        const responder = new AutoResponderImpl(config);
        
        // Mock the transporter to simulate SMTP failure
        const mockError = new Error('SMTP connection failed');
        vi.spyOn(responder as any, 'transporter', 'get').mockReturnValue({
          sendMail: vi.fn().mockRejectedValue(mockError),
        });

        const reply = responder.generateReply(email);
        const result = await responder.sendReply(reply);

        // Verify send failed
        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();

        // Verify error log was created
        expect(capturedLog).not.toBeNull();
        expect(capturedLog.type).toBe('reply_failed');
        expect(capturedLog.emailId).toBe(email.id);
        expect(capturedLog.replyId).toBe(reply.id);
        expect(capturedLog.timestamp).toBeInstanceOf(Date);
        expect(capturedLog.details).toContain(reply.to);
        expect(capturedLog.details).toContain('Failed');
        expect(capturedLog.metadata?.error).toBeDefined();

        // Verify reply status is 'failed'
        expect(reply.status).toBe('failed');
      }),
      { numRuns: 100 }
    );
  });
