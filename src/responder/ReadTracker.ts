import Imap from 'imap';

export interface ReadTracker {
  markAsRead(emailId: string): Promise<void>;
  isRead(emailId: string): Promise<boolean>;
}

export interface ImapConfig {
  user: string;
  password: string;
  host: string;
  port: number;
  tls: boolean;
}

export class ReadTrackerImpl implements ReadTracker {
  private imapConfig: ImapConfig;

  constructor(imapConfig: ImapConfig) {
    this.imapConfig = imapConfig;
  }

  /**
   * Mark an email as read in the IMAP server
   * @param emailId - The UID of the email to mark as read
   */
  async markAsRead(emailId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const imap = new Imap(this.imapConfig);

      imap.once('ready', () => {
        imap.openBox('INBOX', false, (err: Error | null) => {
          if (err) {
            imap.end();
            reject(new Error(`Failed to open inbox: ${err.message}`));
            return;
          }

          // Add the \Seen flag to mark as read
          imap.addFlags(emailId, '\\Seen', (err: Error | null) => {
            if (err) {
              imap.end();
              reject(new Error(`Failed to mark email as read: ${err.message}`));
              return;
            }

            imap.end();
          });
        });
      });

      imap.once('error', (err: Error) => {
        reject(new Error(`IMAP connection error: ${err.message}`));
      });

      imap.once('end', () => {
        resolve();
      });

      try {
        imap.connect();
      } catch (err) {
        reject(new Error(`Failed to connect to IMAP server: ${err}`));
      }
    });
  }

  /**
   * Check if an email is marked as read in the IMAP server
   * @param emailId - The UID of the email to check
   * @returns true if the email is marked as read, false otherwise
   */
  async isRead(emailId: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const imap = new Imap(this.imapConfig);
      let isReadFlag = false;

      imap.once('ready', () => {
        imap.openBox('INBOX', true, (err: Error | null) => {
          if (err) {
            imap.end();
            reject(new Error(`Failed to open inbox: ${err.message}`));
            return;
          }

          // Fetch the flags for the specific email
          const fetch = imap.fetch(emailId, { bodies: '' });

          fetch.on('message', (msg: any) => {
            msg.on('attributes', (attrs: any) => {
              // Check if the \Seen flag is present
              if (attrs.flags && attrs.flags.includes('\\Seen')) {
                isReadFlag = true;
              }
            });
          });

          fetch.once('error', (err: Error) => {
            imap.end();
            reject(new Error(`Failed to fetch email flags: ${err.message}`));
          });

          fetch.once('end', () => {
            imap.end();
          });
        });
      });

      imap.once('error', (err: Error) => {
        reject(new Error(`IMAP connection error: ${err.message}`));
      });

      imap.once('end', () => {
        resolve(isReadFlag);
      });

      try {
        imap.connect();
      } catch (err) {
        reject(new Error(`Failed to connect to IMAP server: ${err}`));
      }
    });
  }
}
