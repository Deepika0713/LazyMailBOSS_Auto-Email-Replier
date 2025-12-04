import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { Email } from './Email';
import { isEmail } from './validation';

describe('Email Model', () => {
  describe('Property Tests', () => {
    /**
     * **Feature: lazy-mail-boss, Property 2: Email metadata completeness**
     * **Validates: Requirements 1.2**
     * 
     * For any unread email detected by the EmailMonitor, the retrieved Email object 
     * should contain non-empty values for id, from, to, subject, body, and receivedAt fields.
     */
    it('should have complete metadata for all valid emails', () => {
      // Arbitrary for generating valid email addresses
      const emailAddressArbitrary = fc.tuple(
        fc.stringMatching(/^[a-z0-9]+$/),
        fc.stringMatching(/^[a-z0-9]+$/),
        fc.stringMatching(/^[a-z]{2,10}$/)
      ).map(([user, domain, tld]) => `${user}@${domain}.${tld}`);

      // Arbitrary for generating Email objects
      const emailArbitrary = fc.record({
        id: fc.string({ minLength: 1 }),
        from: emailAddressArbitrary,
        to: emailAddressArbitrary,
        subject: fc.string(),
        body: fc.string(),
        receivedAt: fc.date(),
        isRead: fc.boolean(),
      });

      fc.assert(
        fc.property(emailArbitrary, (email: Email) => {
          // Verify the email passes our type guard
          expect(isEmail(email)).toBe(true);

          // Verify all required fields are present and non-empty
          expect(email.id).toBeDefined();
          expect(email.id.length).toBeGreaterThan(0);
          
          expect(email.from).toBeDefined();
          expect(email.from.length).toBeGreaterThan(0);
          
          expect(email.to).toBeDefined();
          expect(email.to.length).toBeGreaterThan(0);
          
          expect(email.subject).toBeDefined();
          
          expect(email.body).toBeDefined();
          
          expect(email.receivedAt).toBeDefined();
          expect(email.receivedAt).toBeInstanceOf(Date);
          
          expect(email.isRead).toBeDefined();
          expect(typeof email.isRead).toBe('boolean');
        }),
        { numRuns: 100 }
      );
    });
  });
});
