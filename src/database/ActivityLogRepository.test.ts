import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { Database } from './connection';
import { ActivityLogRepository } from './ActivityLogRepository';
import { runMigrations } from './migrations';
import { ActivityLog, ActivityLogType } from '../models/ActivityLog';
import { randomBytes } from 'crypto';
import { unlinkSync, existsSync } from 'fs';

// Arbitraries for property-based testing
const activityLogTypeArbitrary = fc.constantFrom<ActivityLogType>(
  'reply_sent',
  'reply_failed',
  'email_filtered',
  'error'
);

const activityLogArbitrary = fc.record({
  id: fc.uuid(),
  timestamp: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }),
  type: activityLogTypeArbitrary,
  emailId: fc.uuid(),
  replyId: fc.option(fc.uuid(), { nil: undefined }),
  details: fc.string({ minLength: 1, maxLength: 500 }),
  metadata: fc.option(
    fc.dictionary(fc.string(), fc.oneof(fc.string(), fc.integer(), fc.boolean())),
    { nil: undefined }
  ),
}) as fc.Arbitrary<ActivityLog>;

describe('ActivityLogRepository', () => {
  let db: Database;
  let repository: ActivityLogRepository;
  let testDbPath: string;

  beforeEach(async () => {
    // Use unique database path for each test
    testDbPath = `./test-activity-log-${Date.now()}-${Math.random()}.db`;
    
    // Clean up any existing test database
    if (existsSync(testDbPath)) {
      unlinkSync(testDbPath);
    }

    // Create new database instance
    db = new Database();
    await db.connect(testDbPath);
    await runMigrations(db);
    repository = new ActivityLogRepository(db);
    
    // Clear any existing data
    await db.run('DELETE FROM activity_log');
  });

  afterEach(async () => {
    await db.close();
    if (existsSync(testDbPath)) {
      unlinkSync(testDbPath);
    }
  });

  /**
   * **Feature: lazy-mail-boss, Property 23: Log persistence and accessibility**
   * **Validates: Requirements 8.4**
   * 
   * For any ActivityLog entry created by the system, it should be stored in the 
   * database and retrievable through the repository.
   */
  it('should persist and retrieve activity logs correctly', async () => {
    await fc.assert(
      fc.asyncProperty(activityLogArbitrary, async (log) => {
        // Reuse the test database connection from beforeEach
        // Create the log
        await repository.create(log);

        // Retrieve the log by ID
        const retrieved = await repository.getById(log.id);

        // Verify the log was persisted and is accessible
        expect(retrieved).not.toBeNull();
        expect(retrieved!.id).toBe(log.id);
        expect(retrieved!.type).toBe(log.type);
        expect(retrieved!.emailId).toBe(log.emailId);
        expect(retrieved!.replyId).toBe(log.replyId);
        expect(retrieved!.details).toBe(log.details);
        
        // Timestamps should be equal (within millisecond precision)
        expect(retrieved!.timestamp.getTime()).toBe(log.timestamp.getTime());
        
        // Metadata should match
        if (log.metadata) {
          expect(retrieved!.metadata).toEqual(log.metadata);
        } else {
          expect(retrieved!.metadata).toBeUndefined();
        }
      }),
      { numRuns: 100 }
    );
  });

  it('should retrieve logs through getAll', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(activityLogArbitrary, { minLength: 1, maxLength: 10 }), async (logs) => {
        // Create all logs
        for (const log of logs) {
          await repository.create(log);
        }

        // Retrieve all logs
        const retrieved = await repository.getAll(logs.length);

        // Verify all logs are accessible
        expect(retrieved.length).toBeGreaterThanOrEqual(logs.length);
        
        // Verify each log can be found
        for (const log of logs) {
          const found = retrieved.find(r => r.id === log.id);
          expect(found).toBeDefined();
          expect(found!.emailId).toBe(log.emailId);
          expect(found!.type).toBe(log.type);
        }
      }),
      { numRuns: 10 }
    );
  });

  it('should retrieve logs by email ID', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.array(activityLogArbitrary, { minLength: 1, maxLength: 5 }),
        async (emailId, logs) => {
          // Set all logs to have the same email ID
          const logsWithSameEmail = logs.map(log => ({ ...log, emailId }));

          // Create all logs
          for (const log of logsWithSameEmail) {
            await repository.create(log);
          }

          // Retrieve logs by email ID
          const retrieved = await repository.getByEmailId(emailId);

          // Verify all logs for this email are accessible
          expect(retrieved.length).toBeGreaterThanOrEqual(logsWithSameEmail.length);
          
          for (const retrieved_log of retrieved) {
            expect(retrieved_log.emailId).toBe(emailId);
          }
        }
      ),
      { numRuns: 10 }
    );
  });

  it('should retrieve logs by type', async () => {
    await fc.assert(
      fc.asyncProperty(
        activityLogTypeArbitrary,
        fc.array(activityLogArbitrary, { minLength: 1, maxLength: 5 }),
        async (type, logs) => {
          // Set all logs to have the same type
          const logsWithSameType = logs.map(log => ({ ...log, type }));

          // Create all logs
          for (const log of logsWithSameType) {
            await repository.create(log);
          }

          // Retrieve logs by type
          const retrieved = await repository.getByType(type);

          // Verify all logs of this type are accessible
          expect(retrieved.length).toBeGreaterThanOrEqual(logsWithSameType.length);
          
          for (const retrieved_log of retrieved) {
            expect(retrieved_log.type).toBe(type);
          }
        }
      ),
      { numRuns: 10 }
    );
  });
});
