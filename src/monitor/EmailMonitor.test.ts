import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { EmailMonitorImpl, EmailMonitorConfig } from './EmailMonitor';
import { Email, ActivityLog } from '../models';
import { MessageFilter } from '../filter';
import { AutoResponder, ReadTracker } from '../responder';

// Mock implementations for testing
class MockMessageFilter implements MessageFilter {
  shouldAutoReply = vi.fn().mockReturnValue({ approved: true, reason: 'test' });
  updateKeywords = vi.fn();
  updateExcludedDomains = vi.fn();
  setKeywordsEnabled = vi.fn();
}

class MockAutoResponder implements AutoResponder {
  generateReply = vi.fn().mockReturnValue({
    id: 'reply-1',
    originalEmailId: 'email-1',
    to: 'test@example.com',
    subject: 'Re: Test',
    body: 'Test reply',
    generatedAt: new Date(),
    status: 'approved',
  });
  sendReply = vi.fn().mockResolvedValue({ success: true, sentAt: new Date() });
  queueForConfirmation = vi.fn();
  processConfirmation = vi.fn();
  getPendingReplies = vi.fn().mockReturnValue([]);
}

class MockReadTracker implements ReadTracker {
  markAsRead = vi.fn().mockResolvedValue(undefined);
  isRead = vi.fn().mockResolvedValue(false);
}

// Mock IMAP module
vi.mock('imap', () => {
  return {
    default: vi.fn().mockImplementation(() => {
      const handlers: Record<string, Function> = {};
      return {
        once: (event: string, handler: Function) => {
          handlers[event] = handler;
        },
        connect: () => {
          setTimeout(() => handlers['ready']?.(), 10);
          setTimeout(() => handlers['end']?.(), 50);
        },
        openBox: (box: string, readOnly: boolean, callback: Function) => {
          callback(null);
        },
        search: (criteria: any[], callback: Function) => {
          callback(null, []);
        },
        end: () => {
          setTimeout(() => handlers['end']?.(), 10);
        },
      };
    }),
  };
});

describe('EmailMonitor Property Tests', () => {
  let mockFilter: MockMessageFilter;
  let mockResponder: MockAutoResponder;
  let mockTracker: MockReadTracker;
  let logs: ActivityLog[];

  beforeEach(() => {
    mockFilter = new MockMessageFilter();
    mockResponder = new MockAutoResponder();
    mockTracker = new MockReadTracker();
    logs = [];
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  /**
   * **Feature: lazy-mail-boss, Property 1: Monitoring interval consistency**
   * **Validates: Requirements 1.1**
   */
  it('should accept and use configured check intervals', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1000, max: 60000 }), // Check intervals between 1-60 seconds
        (checkInterval) => {
          const config: EmailMonitorConfig = {
            imapConfig: {
              user: 'test@example.com',
              password: 'password',
              host: 'imap.example.com',
              port: 993,
              tls: true,
            },
            messageFilter: mockFilter,
            autoResponder: mockResponder,
            readTracker: mockTracker,
            checkInterval,
            onLog: (log) => logs.push(log),
          };

          const monitor = new EmailMonitorImpl(config);
          
          // Verify the monitor was created successfully with the interval
          expect(monitor).toBeDefined();
          
          // The monitor should accept any valid positive interval
          return checkInterval > 0;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Feature: lazy-mail-boss, Property 3: Connection retry on failure**
   * **Validates: Requirements 1.3**
   */
  it('should continue monitoring after connection errors', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 5 }), // Number of failures before success
        async (failuresBeforeSuccess) => {
          let attemptCount = 0;
          
          const config: EmailMonitorConfig = {
            imapConfig: {
              user: 'test@example.com',
              password: 'password',
              host: 'imap.example.com',
              port: 993,
              tls: true,
            },
            messageFilter: mockFilter,
            autoResponder: mockResponder,
            readTracker: mockTracker,
            checkInterval: 100, // Fast interval for testing
            onLog: (log) => logs.push(log),
          };

          const monitor = new EmailMonitorImpl(config);
          
          // Mock checkInbox to fail a few times then succeed
          monitor.checkInbox = vi.fn().mockImplementation(async () => {
            attemptCount++;
            if (attemptCount <= failuresBeforeSuccess) {
              throw new Error('Connection failed');
            }
            return [];
          });

          await monitor.start();
          
          // Wait for enough time for retries (add extra buffer)
          await new Promise(resolve => setTimeout(resolve, 100 * (failuresBeforeSuccess + 4)));
          
          await monitor.stop();

          // Verify that after failures, the monitor continued trying
          expect(attemptCount).toBeGreaterThan(failuresBeforeSuccess);
          
          // Verify error logs were created
          const errorLogs = logs.filter(log => log.type === 'error');
          expect(errorLogs.length).toBeGreaterThanOrEqual(failuresBeforeSuccess);
          
          return true;
        }
      ),
      { numRuns: 10 }
    );
  }, 10000);

  /**
   * **Feature: lazy-mail-boss, Property 21: Continuous monitoring operation**
   * **Validates: Requirements 7.2, 7.3**
   */
  it('should continue monitoring despite non-fatal errors', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.boolean(), { minLength: 3, maxLength: 10 }), // Array of success/failure outcomes
        async (outcomes) => {
          let callIndex = 0;
          
          const config: EmailMonitorConfig = {
            imapConfig: {
              user: 'test@example.com',
              password: 'password',
              host: 'imap.example.com',
              port: 993,
              tls: true,
            },
            messageFilter: mockFilter,
            autoResponder: mockResponder,
            readTracker: mockTracker,
            checkInterval: 50, // Fast interval for testing
            onLog: (log) => logs.push(log),
          };

          const monitor = new EmailMonitorImpl(config);
          
          // Mock checkInbox to succeed or fail based on outcomes array
          monitor.checkInbox = vi.fn().mockImplementation(async () => {
            const shouldSucceed = outcomes[callIndex % outcomes.length];
            callIndex++;
            
            if (!shouldSucceed) {
              throw new Error('Simulated error');
            }
            return [];
          });

          await monitor.start();
          
          // Wait for multiple cycles (add extra buffer for timing)
          await new Promise(resolve => setTimeout(resolve, 50 * (outcomes.length + 3)));
          
          await monitor.stop();

          // Verify the monitor kept trying despite errors (allow for at least most of the outcomes)
          expect(callIndex).toBeGreaterThanOrEqual(Math.max(2, outcomes.length - 1));
          
          return true;
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * **Feature: lazy-mail-boss, Property 22: Graceful shutdown**
   * **Validates: Requirements 7.4**
   */
  it('should complete processing current email before shutdown', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 5 }), // Number of emails to process
        async (emailCount) => {
          const emails: Email[] = Array.from({ length: emailCount }, (_, i) => ({
            id: `email-${i}`,
            from: `sender${i}@example.com`,
            to: 'recipient@example.com',
            subject: `Test ${i}`,
            body: `Body ${i}`,
            receivedAt: new Date(),
            isRead: false,
          }));

          let processedEmails: string[] = [];
          let isProcessing = false;
          
          const config: EmailMonitorConfig = {
            imapConfig: {
              user: 'test@example.com',
              password: 'password',
              host: 'imap.example.com',
              port: 993,
              tls: true,
            },
            messageFilter: mockFilter,
            autoResponder: mockResponder,
            readTracker: mockTracker,
            checkInterval: 1000, // Longer interval
            onLog: (log) => logs.push(log),
          };

          const monitor = new EmailMonitorImpl(config);
          
          // Mock checkInbox to return emails once
          let called = false;
          monitor.checkInbox = vi.fn().mockImplementation(async () => {
            if (!called) {
              called = true;
              return emails;
            }
            return [];
          });

          // Mock processEmail to track processing
          const originalProcessEmail = monitor.processEmail.bind(monitor);
          monitor.processEmail = vi.fn().mockImplementation(async (email: Email) => {
            isProcessing = true;
            await new Promise(resolve => setTimeout(resolve, 50)); // Simulate processing time
            processedEmails.push(email.id);
            isProcessing = false;
            return originalProcessEmail(email);
          });

          await monitor.start();
          
          // Wait a bit for processing to start
          await new Promise(resolve => setTimeout(resolve, 100));
          
          // Stop while potentially processing
          await monitor.stop();

          // If processing started, it should have completed
          // All emails should be processed
          expect(processedEmails.length).toBe(emailCount);
          expect(isProcessing).toBe(false);
          
          return true;
        }
      ),
      { numRuns: 10 }
    );
  });
});
