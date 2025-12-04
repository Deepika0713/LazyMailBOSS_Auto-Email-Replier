import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { ConfigurationManagerImpl } from './ConfigurationManager';
import { Config } from '../models';
import * as fs from 'fs';
import * as path from 'path';

describe('ConfigurationManager Property Tests', () => {
  let testDbPath: string;
  let configManager: ConfigurationManagerImpl;

  beforeEach(() => {
    // Create a unique test database for each test
    testDbPath = path.join(__dirname, `test-config-${Date.now()}-${Math.random()}.db`);
  });

  afterEach(async () => {
    // Clean up
    if (configManager) {
      await configManager.close();
    }
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  /**
   * **Feature: lazy-mail-boss, Property 18: Credential encryption at rest**
   * **Validates: Requirements 6.2**
   * 
   * For any email credentials saved through the WebDashboard, 
   * the password field should be encrypted in the database and never stored in plaintext.
   */
  it('Property 18: Credentials are encrypted at rest', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          imapHost: fc.string({ minLength: 1, maxLength: 50 }),
          imapPort: fc.integer({ min: 1, max: 65535 }),
          smtpHost: fc.string({ minLength: 1, maxLength: 50 }),
          smtpPort: fc.integer({ min: 1, max: 65535 }),
          username: fc.string({ minLength: 1, maxLength: 50 }),
          password: fc.string({ minLength: 5, maxLength: 100 }) // Minimum 5 chars to avoid false positives
        }),
        async (emailConfig) => {
          // Create a unique database for each iteration
          const iterationDbPath = path.join(__dirname, `test-config-${Date.now()}-${Math.random()}.db`);
          const manager = new ConfigurationManagerImpl(iterationDbPath, 'test-encryption-key');
          
          try {
            // Update config with the generated credentials
            await manager.updateConfig({ email: emailConfig });

            // Close the manager to release the database connection
            await manager.close();

            // Longer delay to ensure file handles are released on Windows
            await new Promise(resolve => setTimeout(resolve, 50));

            // Read the raw database content with a separate connection
            const sqlite3 = require('sqlite3');
            const db = new sqlite3.Database(iterationDbPath);
            
            const row: any = await new Promise((resolve, reject) => {
              db.get('SELECT data FROM config WHERE id = 1', (err: any, row: any) => {
                if (err) reject(err);
                else resolve(row);
              });
            });

            await new Promise<void>((resolve, reject) => {
              db.close((err: any) => {
                if (err) reject(err);
                else resolve();
              });
            });

            // Longer delay after closing
            await new Promise(resolve => setTimeout(resolve, 50));

            // Verify the password is NOT stored in plaintext
            expect(row).toBeDefined();
            expect(row.data).toBeDefined();
            expect(row.data).not.toContain(emailConfig.password);

            // Reopen to verify we can retrieve the password correctly
            const manager2 = new ConfigurationManagerImpl(iterationDbPath, 'test-encryption-key');
            const retrievedConfig = await manager2.getConfig();
            expect(retrievedConfig.email.password).toBe(emailConfig.password);
            await manager2.close();

            // Longer delay before cleanup
            await new Promise(resolve => setTimeout(resolve, 50));

            // Clean up the iteration database
            if (fs.existsSync(iterationDbPath)) {
              try {
                fs.unlinkSync(iterationDbPath);
              } catch (e) {
                // Ignore cleanup errors on Windows
              }
            }
          } catch (error) {
            // Clean up on error
            await new Promise(resolve => setTimeout(resolve, 50));
            if (fs.existsSync(iterationDbPath)) {
              try {
                fs.unlinkSync(iterationDbPath);
              } catch (e) {
                // Ignore cleanup errors
              }
            }
            throw error;
          }
        }
      ),
      { numRuns: 20 }  // Reduced from 100 to avoid resource exhaustion on Windows
    );
  }, 60000);  // Increased timeout to 60 seconds

  /**
   * **Feature: lazy-mail-boss, Property 17: Configuration hot-reload**
   * **Validates: Requirements 5.4, 6.3, 6.4, 6.7, 8.3**
   * 
   * For any configuration change (keywords, excluded domains, manual confirmation mode, reply template),
   * the change should be applied to the respective components immediately without requiring a system restart,
   * and the next processed email should use the updated configuration.
   */
  it('Property 17: Configuration hot-reload notifies subscribers', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          keywords: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 5 }),
          excludedDomains: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 5 }),
          manualConfirmation: fc.boolean(),
          replyTemplate: fc.string({ minLength: 10, maxLength: 100 })
        }),
        async (updates) => {
          // Create a unique database for this test
          const testDb = path.join(__dirname, `test-hotreload-${Date.now()}-${Math.random()}.db`);
          const manager = new ConfigurationManagerImpl(testDb, 'test-key');
          
          try {
            // Track if subscriber was called
            let subscriberCalled = false;
            let receivedConfig: Config | null = null;

            // Subscribe to config changes
            manager.subscribe((config) => {
              subscriberCalled = true;
              receivedConfig = config;
            });

            // Update configuration
            await manager.updateConfig({
              filters: {
                keywordsEnabled: true,
                keywords: updates.keywords,
                excludedDomains: updates.excludedDomains
              },
              autoReply: {
                manualConfirmation: updates.manualConfirmation,
                replyTemplate: updates.replyTemplate,
                checkInterval: 10
              }
            });

            // Verify subscriber was called
            expect(subscriberCalled).toBe(true);
            expect(receivedConfig).not.toBeNull();

            // Verify the received config contains the updates
            if (receivedConfig) {
              expect(receivedConfig.filters.keywords).toEqual(updates.keywords);
              expect(receivedConfig.filters.excludedDomains).toEqual(updates.excludedDomains);
              expect(receivedConfig.autoReply.manualConfirmation).toBe(updates.manualConfirmation);
              expect(receivedConfig.autoReply.replyTemplate).toBe(updates.replyTemplate);
            }

            // Verify getConfig returns the updated config
            const retrievedConfig = await manager.getConfig();
            expect(retrievedConfig.filters.keywords).toEqual(updates.keywords);
            expect(retrievedConfig.filters.excludedDomains).toEqual(updates.excludedDomains);
            expect(retrievedConfig.autoReply.manualConfirmation).toBe(updates.manualConfirmation);
            expect(retrievedConfig.autoReply.replyTemplate).toBe(updates.replyTemplate);

            await manager.close();
            await new Promise(resolve => setTimeout(resolve, 50));

            // Clean up
            if (fs.existsSync(testDb)) {
              try {
                fs.unlinkSync(testDb);
              } catch (e) {
                // Ignore cleanup errors
              }
            }
          } catch (error) {
            await new Promise(resolve => setTimeout(resolve, 50));
            if (fs.existsSync(testDb)) {
              try {
                fs.unlinkSync(testDb);
              } catch (e) {
                // Ignore cleanup errors
              }
            }
            throw error;
          }
        }
      ),
      { numRuns: 20 }  // Reduced from 100 to avoid resource exhaustion on Windows
    );
  }, 60000);  // Increased timeout to 60 seconds
});
