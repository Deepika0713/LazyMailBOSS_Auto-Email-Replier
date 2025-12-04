import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { KeywordMatcher } from './KeywordMatcher';
import { Email } from '../models';

describe('KeywordMatcher', () => {
  describe('Property 12: Keyword matching in subject and body', () => {
    /**
     * **Feature: lazy-mail-boss, Property 12: Keyword matching in subject and body**
     * **Validates: Requirements 4.1**
     * 
     * For any email and keyword list (when keyword filtering is enabled), 
     * the KeywordMatcher should search for keyword occurrences in both the subject and body fields.
     */
    it('should find keywords in both subject and body', () => {
      // Arbitrary for generating emails with keywords in different locations
      const testCaseArbitrary = fc.record({
        keyword: fc.string({ minLength: 3, maxLength: 10 }),
        location: fc.constantFrom('subject', 'body', 'both', 'neither'),
        subjectPrefix: fc.string({ maxLength: 20 }),
        subjectSuffix: fc.string({ maxLength: 20 }),
        bodyPrefix: fc.string({ maxLength: 50 }),
        bodySuffix: fc.string({ maxLength: 50 })
      });

      fc.assert(
        fc.property(testCaseArbitrary, (testCase) => {
          const { keyword, location, subjectPrefix, subjectSuffix, bodyPrefix, bodySuffix } = testCase;
          
          // Build email based on location
          const email: Email = {
            id: '1',
            from: 'test@example.com',
            to: 'user@example.com',
            subject: location === 'subject' || location === 'both' 
              ? `${subjectPrefix}${keyword}${subjectSuffix}`
              : subjectPrefix + subjectSuffix,
            body: location === 'body' || location === 'both'
              ? `${bodyPrefix}${keyword}${bodySuffix}`
              : bodyPrefix + bodySuffix,
            receivedAt: new Date(),
            isRead: false
          };

          const matcher = new KeywordMatcher([keyword]);
          const matches = matcher.findMatches(email);
          const hasMatch = matcher.hasMatch(email);

          // Should find keyword if it's in subject, body, or both
          const shouldMatch = location !== 'neither';
          
          if (shouldMatch) {
            expect(matches).toContain(keyword.toLowerCase());
            expect(hasMatch).toBe(true);
          } else {
            expect(matches).not.toContain(keyword.toLowerCase());
            expect(hasMatch).toBe(false);
          }
        }),
        { numRuns: 100 }
      );
    });

    it('should perform case-insensitive matching', () => {
      const email: Email = {
        id: '1',
        from: 'test@example.com',
        to: 'user@example.com',
        subject: 'URGENT Request',
        body: 'This is an urgent message',
        receivedAt: new Date(),
        isRead: false
      };

      const matcher = new KeywordMatcher(['urgent', 'REQUEST']);
      const matches = matcher.findMatches(email);

      // Both keywords should match despite case differences
      expect(matches).toHaveLength(2);
      expect(matches).toContain('urgent');
      expect(matches).toContain('request');
    });
  });
});
