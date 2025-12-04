import { Email } from '../models';
import { KeywordMatcher } from './KeywordMatcher';
import { DomainFilter } from './DomainFilter';

export interface FilterDecision {
  approved: boolean;
  reason: string;
  matchedKeywords?: string[];
}

export interface FilterConfig {
  keywordsEnabled: boolean;
  keywords: string[];
  excludedDomains: string[];
}

export class MessageFilter {
  private keywordMatcher: KeywordMatcher;
  private domainFilter: DomainFilter;
  private keywordsEnabled: boolean;

  constructor(config: FilterConfig) {
    this.keywordMatcher = new KeywordMatcher(config.keywords);
    this.domainFilter = new DomainFilter(config.excludedDomains);
    this.keywordsEnabled = config.keywordsEnabled;
  }

  /**
   * Determines if an email should receive an auto-reply based on filtering rules
   */
  shouldAutoReply(email: Email): FilterDecision {
    // First check domain exclusion
    if (this.domainFilter.isExcluded(email.from)) {
      return {
        approved: false,
        reason: `Sender domain is excluded: ${this.domainFilter.extractDomain(email.from)}`
      };
    }

    // Then check keyword filtering if enabled
    if (this.keywordsEnabled) {
      const matchedKeywords = this.keywordMatcher.findMatches(email);
      
      if (matchedKeywords.length > 0) {
        return {
          approved: true,
          reason: 'Email contains required keywords',
          matchedKeywords
        };
      } else {
        return {
          approved: false,
          reason: 'Email does not contain any required keywords'
        };
      }
    }

    // If keyword filtering is disabled, approve
    return {
      approved: true,
      reason: 'Keyword filtering disabled, all non-excluded emails approved'
    };
  }

  /**
   * Updates keyword configuration
   */
  updateKeywords(keywords: string[]): void {
    this.keywordMatcher.updateKeywords(keywords);
  }

  /**
   * Updates excluded domains configuration
   */
  updateExcludedDomains(domains: string[]): void {
    this.domainFilter.updateExcludedDomains(domains);
  }

  /**
   * Enables or disables keyword filtering
   */
  setKeywordsEnabled(enabled: boolean): void {
    this.keywordsEnabled = enabled;
  }
}
