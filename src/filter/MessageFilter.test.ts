import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { MessageFilter } from './MessageFilter';
import { Email } from '../models';

describe('MessageFilter', () => {
  describe('Property 13: Keyword filter approval logic', () => {
    /**
     * **Feature: lazy-mail-boss, Property 13: Keyword filter approval logic**
     * **Validates: Requirements 4.2, 4.3**
     * 
     * For any email when keyword filtering is enabled, the MessageFilter should approve 
     * the email if and only if at least one configured keyword appears in the subject or body.
     */
    it('should approve emails with keywords and reject without', () => {
      // Generate test cases with keywords and emails
      const testCaseArbitrary = fc.record({
        keywords: fc.array(fc.string({ minLength: 3, maxLength: 10 }), { minLength: 1, maxLength: 5 }),
        hasKeyword: fc.boolean(),
        subjectText: fc.string({ maxLength: 50 }),
        bodyText: fc.string({ maxLength: 100 })
      });

      fc.assert(
        fc.property(testCaseArbitrary, (testCase) => {
          const { keywords, hasKeyword, subjectText, bodyText } = testCase;
          
          // Build email - include a keyword if hasKeyword is true
          const selectedKeyword = keywords[0];
          const email: Email = {
            id: '1',
            from: 'test@example.com',
            to: 'user@example.com',
            subject: hasKeyword ? `${subjectText} ${selectedKeyword}` : subjectText,
            body: bodyText,
            receivedAt: new Date(),
            isRead: false
          };

          const filter = new MessageFilter({
            keywordsEnabled: true,
            keywords,
            excludedDomains: []
          });

          const decision = filter.shouldAutoReply(email);

          // Should approve if and only if email has keyword
          expect(decision.approved).toBe(hasKeyword);
          
          if (hasKeyword) {
            expect(decision.matchedKeywords).toBeDefined();
            expect(decision.matchedKeywords!.length).toBeGreaterThan(0);
          }
        }),
        { numRuns: 100 }
      );
    });

    it('should find keywords case-insensitively', () => {
      const email: Email = {
        id: '1',
        from: 'test@example.com',
        to: 'user@example.com',
        subject: 'URGENT Request',
        body: 'Please respond',
        receivedAt: new Date(),
        isRead: false
      };

      const filter = new MessageFilter({
        keywordsEnabled: true,
        keywords: ['urgent'],
        excludedDomains: []
      });

      const decision = filter.shouldAutoReply(email);
      expect(decision.approved).toBe(true);
      expect(decision.matchedKeywords).toContain('urgent');
    });
  });

  describe('Property 14: Keyword filter bypass', () => {
    /**
     * **Feature: lazy-mail-boss, Property 14: Keyword filter bypass**
     * **Validates: Requirements 4.4**
     * 
     * For any email when keyword filtering is disabled, the keyword check should pass 
     * (approve) regardless of email content.
     */
    it('should approve all emails when keyword filtering is disabled', () => {
      // Generate random emails and keywords
      const testCaseArbitrary = fc.record({
        keywords: fc.array(fc.string({ minLength: 3, maxLength: 10 }), { minLength: 1, maxLength: 5 }),
        subject: fc.string({ maxLength: 50 }),
        body: fc.string({ maxLength: 100 }),
        from: fc.emailAddress()
      });

      fc.assert(
        fc.property(testCaseArbitrary, (testCase) => {
          const { keywords, subject, body, from } = testCase;
          
          const email: Email = {
            id: '1',
            from,
            to: 'user@example.com',
            subject,
            body,
            receivedAt: new Date(),
            isRead: false
          };

          const filter = new MessageFilter({
            keywordsEnabled: false,  // Keyword filtering disabled
            keywords,
            excludedDomains: []
          });

          const decision = filter.shouldAutoReply(email);

          // Should always approve when keyword filtering is disabled
          expect(decision.approved).toBe(true);
          expect(decision.reason).toContain('disabled');
        }),
        { numRuns: 100 }
      );
    });

    it('should approve emails without keywords when filtering is disabled', () => {
      const email: Email = {
        id: '1',
        from: 'test@example.com',
        to: 'user@example.com',
        subject: 'Random subject',
        body: 'Random body content',
        receivedAt: new Date(),
        isRead: false
      };

      const filter = new MessageFilter({
        keywordsEnabled: false,
        keywords: ['urgent', 'important'],
        excludedDomains: []
      });

      const decision = filter.shouldAutoReply(email);
      expect(decision.approved).toBe(true);
    });
  });

  describe('Property 16: Domain exclusion logic', () => {
    /**
     * **Feature: lazy-mail-boss, Property 16: Domain exclusion logic**
     * **Validates: Requirements 5.2, 5.3**
     * 
     * For any email, the DomainFilter should reject it if and only if the sender domain 
     * matches any domain in the excluded domains list.
     */
    it('should reject emails from excluded domains and approve others', () => {
      // Generate test cases with domains
      const testCaseArbitrary = fc.record({
        excludedDomains: fc.array(
          fc.stringMatching(/^[a-z0-9-]+\.[a-z]{2,}$/), 
          { minLength: 1, maxLength: 5 }
        ),
        isExcluded: fc.boolean(),
        username: fc.stringMatching(/^[a-z0-9._-]+$/),
        otherDomain: fc.stringMatching(/^[a-z0-9-]+\.[a-z]{2,}$/),
        subject: fc.string({ maxLength: 50 }),
        body: fc.string({ maxLength: 100 })
      });

      fc.assert(
        fc.property(testCaseArbitrary, (testCase) => {
          const { excludedDomains, isExcluded, username, otherDomain, subject, body } = testCase;
          
          // Use excluded domain if isExcluded is true, otherwise use a different domain
          const senderDomain = isExcluded ? excludedDomains[0] : otherDomain;
          
          // Make sure otherDomain is not in excluded list
          if (!isExcluded && excludedDomains.includes(otherDomain)) {
            return; // Skip this test case
          }

          const email: Email = {
            id: '1',
            from: `${username}@${senderDomain}`,
            to: 'user@example.com',
            subject,
            body,
            receivedAt: new Date(),
            isRead: false
          };

          const filter = new MessageFilter({
            keywordsEnabled: false,  // Disable keyword filtering to isolate domain test
            keywords: [],
            excludedDomains
          });

          const decision = filter.shouldAutoReply(email);

          // Should reject if and only if domain is excluded
          expect(decision.approved).toBe(!isExcluded);
          
          if (isExcluded) {
            expect(decision.reason).toContain('excluded');
          }
        }),
        { numRuns: 100 }
      );
    });

    it('should handle domain exclusion case-insensitively', () => {
      const email: Email = {
        id: '1',
        from: 'user@EXAMPLE.COM',
        to: 'user@mymail.com',
        subject: 'Test',
        body: 'Test body',
        receivedAt: new Date(),
        isRead: false
      };

      const filter = new MessageFilter({
        keywordsEnabled: false,
        keywords: [],
        excludedDomains: ['example.com']
      });

      const decision = filter.shouldAutoReply(email);
      expect(decision.approved).toBe(false);
      expect(decision.reason).toContain('excluded');
    });

    it('should prioritize domain exclusion over keyword matching', () => {
      const email: Email = {
        id: '1',
        from: 'user@spam.com',
        to: 'user@mymail.com',
        subject: 'urgent request',
        body: 'This is urgent',
        receivedAt: new Date(),
        isRead: false
      };

      const filter = new MessageFilter({
        keywordsEnabled: true,
        keywords: ['urgent'],
        excludedDomains: ['spam.com']
      });

      const decision = filter.shouldAutoReply(email);
      // Should reject due to excluded domain, even though it has keywords
      expect(decision.approved).toBe(false);
      expect(decision.reason).toContain('excluded');
    });
  });
});
