import { Email } from '../models';

export class KeywordMatcher {
  private keywords: string[];

  constructor(keywords: string[]) {
    this.keywords = keywords.map(kw => kw.toLowerCase());
  }

  /**
   * Searches for configured keywords in email subject and body (case-insensitive)
   * Returns matched keywords if any are found
   */
  findMatches(email: Email): string[] {
    const searchText = `${email.subject} ${email.body}`.toLowerCase();
    
    return this.keywords.filter(keyword => 
      searchText.includes(keyword)
    );
  }

  /**
   * Checks if email contains at least one keyword
   */
  hasMatch(email: Email): boolean {
    return this.findMatches(email).length > 0;
  }

  /**
   * Updates the keyword list
   */
  updateKeywords(keywords: string[]): void {
    this.keywords = keywords.map(kw => kw.toLowerCase());
  }
}
