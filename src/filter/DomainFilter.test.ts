import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { DomainFilter } from './DomainFilter';

describe('DomainFilter', () => {
  describe('Property 15: Domain extraction correctness', () => {
    /**
     * **Feature: lazy-mail-boss, Property 15: Domain extraction correctness**
     * **Validates: Requirements 5.1**
     * 
     * For any email address in the format "user@domain.com", 
     * the DomainFilter should extract "domain.com" as the sender domain.
     */
    it('should correctly extract domain from email addresses', () => {
      const domainFilter = new DomainFilter([]);

      // Arbitrary for generating valid email addresses
      const emailArbitrary = fc.tuple(
        fc.stringMatching(/^[a-zA-Z0-9._-]+$/),  // username part
        fc.stringMatching(/^[a-zA-Z0-9.-]+$/),   // domain part
        fc.stringMatching(/^[a-zA-Z]{2,}$/)      // TLD
      ).map(([user, domain, tld]) => ({
        email: `${user}@${domain}.${tld}`,
        expectedDomain: `${domain}.${tld}`.toLowerCase()
      }));

      fc.assert(
        fc.property(emailArbitrary, ({ email, expectedDomain }) => {
          const extractedDomain = domainFilter.extractDomain(email);
          expect(extractedDomain).toBe(expectedDomain);
        }),
        { numRuns: 100 }
      );
    });

    it('should handle edge cases for domain extraction', () => {
      const domainFilter = new DomainFilter([]);

      // Test email without @ symbol
      expect(domainFilter.extractDomain('invalidemail')).toBe('');
      
      // Test email with @ but no domain
      expect(domainFilter.extractDomain('user@')).toBe('');
      
      // Test simple email
      expect(domainFilter.extractDomain('user@example.com')).toBe('example.com');
      
      // Test email with subdomain
      expect(domainFilter.extractDomain('user@mail.example.com')).toBe('mail.example.com');
    });
  });
});
