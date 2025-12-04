# LazyMailBOSS

Automated email response system with intelligent filtering.

## Features

- 🔄 Automatic email monitoring (checks inbox every 10 seconds)
- 🎯 Intelligent filtering by keywords and domains
- 📧 Automatic reply generation and sending
- ✅ Manual confirmation mode for reply approval
- 🌐 Web dashboard for configuration and monitoring
- 🔒 Encrypted credential storage
- 🔥 Hot-reload configuration without restart
- 📊 Activity logging and transaction history

## Project Structure

```
src/
├── models/          # Data models and types
├── monitor/         # Email monitoring components
├── filter/          # Message filtering logic
├── responder/       # Auto-response and read tracking
├── config/          # Configuration management
├── database/        # Database layer and repositories
└── api/             # REST API endpoints
```

## Setup

### Prerequisites

- Node.js 18+ 
- npm or yarn
- Email account with IMAP/SMTP access

### Installation

```bash
# Install dependencies
npm install

# Build the application
npm run build
```

### Configuration

LazyMailBOSS supports configuration through both environment variables and the web dashboard. Environment variables take precedence and are useful for deployment scenarios.

#### Environment Variables

Create a `.env` file in the project root (copy from `.env.example`):

```bash
cp .env.example .env
```

Then edit `.env` with your configuration:

```bash
# Server Configuration
PORT=3000                    # Web dashboard port
NODE_ENV=development         # Environment (development/production)

# Security (REQUIRED in production)
ENCRYPTION_KEY=your-secure-random-key-here

# Database Paths
DATABASE_PATH=./data/lazymail.db
CONFIG_DATABASE_PATH=./data/config.db

# Email Configuration (Optional - can be set via dashboard)
IMAP_HOST=imap.gmail.com
IMAP_PORT=993
IMAP_USER=your-email@gmail.com
IMAP_PASSWORD=your-app-password
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password

# Auto-Reply Settings (Optional)
CHECK_INTERVAL=10                    # Check inbox every N seconds
MANUAL_CONFIRMATION=true             # Require approval before sending
REPLY_TEMPLATE=Thank you for your email. I will respond shortly.

# Filter Settings (Optional)
KEYWORDS_ENABLED=false
KEYWORDS=urgent,important,meeting
EXCLUDED_DOMAINS=noreply.com,notifications.example.com

# Logging
LOG_LEVEL=info
```

#### Generating a Secure Encryption Key

For production deployments, generate a secure encryption key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy the output and set it as your `ENCRYPTION_KEY` environment variable.

#### Configuration Priority

Configuration is loaded in the following order (later sources override earlier ones):

1. Default values (built into the application)
2. Database configuration (set via web dashboard)
3. Environment variables (from `.env` file or system environment)

This allows you to:
- Use the web dashboard for initial setup and testing
- Override with environment variables for deployment
- Keep sensitive credentials out of the database in production

### Running the Application

```bash
# Start the application
npm start

# Or run in development mode with auto-reload
npm run dev
```

The application will:
1. Initialize the database and run migrations
2. Load configuration (or create default config)
3. Start the web dashboard on port 3000 (or PORT env variable)
4. Start email monitoring (if credentials are configured)

### First Time Setup

1. Start the application: `npm start`
2. Open the web dashboard: `http://localhost:3000`
3. Configure your email credentials:
   - IMAP host and port
   - SMTP host and port
   - Email username and password
4. Configure filtering rules:
   - Enable/disable keyword filtering
   - Add keywords to match
   - Add domains to exclude
5. Configure auto-reply settings:
   - Enable/disable manual confirmation
   - Customize reply template
   - Set check interval (default: 10 seconds)

## Web Dashboard

The web dashboard provides:

- **Status**: View monitoring status and reply counts
- **Configuration**: Update email credentials, filters, and settings
- **Activity Log**: View recent auto-reply transactions
- **Pending Replies**: Approve or reject replies (when manual confirmation is enabled)

## Development

```bash
# Run in development mode
npm run dev

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Build TypeScript
npm run build
```

## Testing

```bash
# Run all tests
npm test

# Run specific test file
npm test src/index.test.ts

# Run tests in watch mode
npm run test:watch
```

## Architecture

The application follows a modular pipeline architecture:

```
Email Monitor → Message Filter → Auto Responder → Read Tracker
                                        ↓
                                  SMTP Server
```

Components communicate through well-defined interfaces and support hot-reload for configuration changes.

## Security

- Email passwords are encrypted at rest using AES-256
- Credentials are never logged or exposed in API responses
- Database files are excluded from version control
- Input validation on all API endpoints

## Deployment

The application can be deployed to any Node.js hosting platform. Environment variables make it easy to configure for different environments.

### Deployment Platforms

- **Local server**: Use `.env` file for configuration
- **Cloud platforms** (AWS, Google Cloud, Azure): Set environment variables in platform console
- **Container platforms** (Docker, Kubernetes): Pass environment variables to containers
- **PaaS providers** (Heroku, DigitalOcean App Platform): Configure via platform settings

### Environment-Specific Configuration

**Development:**
```bash
NODE_ENV=development
PORT=3000
LOG_LEVEL=debug
```

**Production:**
```bash
NODE_ENV=production
PORT=8080
ENCRYPTION_KEY=<secure-random-key>
DATABASE_PATH=/var/data/lazymail.db
LOG_LEVEL=info
```

### Cloud Deployment Example

**Heroku:**
```bash
heroku config:set NODE_ENV=production
heroku config:set ENCRYPTION_KEY=<your-key>
heroku config:set IMAP_HOST=imap.gmail.com
heroku config:set IMAP_USER=<your-email>
# ... set other variables
```

**Docker:**
```bash
docker run -d \
  -e NODE_ENV=production \
  -e ENCRYPTION_KEY=<your-key> \
  -e PORT=8080 \
  -p 8080:8080 \
  lazy-mail-boss
```

**AWS/GCP/Azure:**
Set environment variables in your platform's application configuration or secrets manager.

### Required Environment Variables for Production

At minimum, set these for production deployments:

- `NODE_ENV=production`
- `ENCRYPTION_KEY=<secure-random-key>` (REQUIRED)
- `PORT=<your-port>`
- Email credentials (IMAP/SMTP) via environment or dashboard

See the design document for detailed deployment architecture.

## License

MIT
