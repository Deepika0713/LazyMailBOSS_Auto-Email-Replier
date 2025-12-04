# LazyMailBOSS Web Dashboard

This is the web-based user interface for the LazyMailBOSS automated email response system.

## Features

### Status Display
- Real-time monitoring status (Active/Inactive)
- Current operation mode (Manual/Automatic)
- Pending replies count
- Total replies sent count

### Configuration Management
- **Email Settings**: Configure IMAP and SMTP server credentials
- **Filter Settings**: 
  - Enable/disable keyword filtering
  - Manage keyword list (comma-separated)
  - Manage excluded domains list (comma-separated)
- **Auto-Reply Settings**:
  - Toggle manual confirmation mode
  - Edit reply template
  - Set check interval (in seconds)

### Pending Replies Management
- View all pending replies awaiting manual confirmation
- Approve replies to send them
- Reject replies to discard them
- Each reply shows recipient, subject, and body

### Activity Log Viewer
- View recent system activity
- Pagination support (20 logs per page)
- Color-coded log types:
  - Green: Reply sent successfully
  - Red: Reply failed or error
  - Yellow: Email filtered
- Displays timestamp, type, details, and email ID

## Usage

### Starting the Dashboard

Run the demo server:
```bash
npm run demo
```

Then open your browser to: http://localhost:3000

### Configuration

1. Navigate to the Configuration section
2. Fill in your email server details:
   - IMAP host and port (for receiving emails)
   - SMTP host and port (for sending replies)
   - Username and password
3. Configure filters:
   - Enable keyword filtering if you want to filter by keywords
   - Add keywords (comma-separated)
   - Add excluded domains (comma-separated)
4. Configure auto-reply settings:
   - Enable manual confirmation if you want to approve each reply
   - Edit the reply template
   - Set the check interval
5. Click "Save Configuration"

### Managing Pending Replies

When manual confirmation is enabled:
1. New replies appear in the "Pending Replies" section
2. Review each reply's content
3. Click "Approve & Send" to send the reply
4. Click "Reject" to discard the reply

### Viewing Activity Logs

1. The Activity Log section shows recent system activity
2. Use "Previous" and "Next" buttons to navigate pages
3. Click "Refresh" to reload the current page
4. Logs auto-refresh every 10 seconds

## API Endpoints

The dashboard communicates with these API endpoints:

- `GET /api/status` - Get system status
- `GET /api/config` - Get current configuration
- `PUT /api/config` - Update configuration
- `GET /api/logs?limit=100&offset=0` - Get activity logs
- `GET /api/pending-replies` - Get pending replies
- `POST /api/replies/:id/approve` - Approve a reply
- `POST /api/replies/:id/reject` - Reject a reply

## Files

- `index.html` - Main HTML structure
- `styles.css` - Styling and layout
- `app.js` - JavaScript application logic and API client

## Browser Compatibility

The dashboard works in all modern browsers that support:
- ES6+ JavaScript
- Fetch API
- CSS Grid and Flexbox
