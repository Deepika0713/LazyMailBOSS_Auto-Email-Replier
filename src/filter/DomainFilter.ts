export class DomainFilter {
  private excludedDomains: string[];

  constructor(excludedDomains: string[]) {
    this.excludedDomains = excludedDomains.map(d => d.toLowerCase());
  }

  /**
   * Extracts domain from email address (e.g., "user@domain.com" -> "domain.com")
   */
  extractDomain(emailAddress: string): string {
    const atIndex = emailAddress.indexOf('@');
    if (atIndex === -1) {
      return '';
    }
    return emailAddress.substring(atIndex + 1).toLowerCase();
  }

  /**
   * Checks if the sender domain is in the excluded list
   */
  isExcluded(emailAddress: string): boolean {
    const domain = this.extractDomain(emailAddress);
    return this.excludedDomains.includes(domain);
  }

  /**
   * Updates the excluded domains list
   */
  updateExcludedDomains(domains: string[]): void {
    this.excludedDomains = domains.map(d => d.toLowerCase());
  }
}
