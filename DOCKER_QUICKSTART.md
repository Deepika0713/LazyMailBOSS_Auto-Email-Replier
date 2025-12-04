# Docker Quick Start Guide

## Quick Start with Docker Compose

1. **Generate an encryption key:**
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

2. **Create a `.env` file:**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` and set at minimum:
   ```
   ENCRYPTION_KEY=your-generated-key-here
   ```

3. **Start the application:**
   ```bash
   docker-compose up -d
   ```

4. **Access the dashboard:**
   Open http://localhost:3000

5. **View logs:**
   ```bash
   docker-compose logs -f
   ```

6. **Stop the application:**
   ```bash
   docker-compose down
   ```

## Building the Docker Image

```bash
docker build -t lazymail-boss:latest .
```

## Running Without Docker Compose

```bash
docker run -d \
  --name lazymail-boss \
  -p 3000:3000 \
  -e ENCRYPTION_KEY="your-key-here" \
  -v lazymail-data:/app/data \
  lazymail-boss:latest
```

## Health Check

The application includes a health check endpoint at `/api/health`:

```bash
curl http://localhost:3000/api/health
```

Response:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "uptime": 3600.5
}
```

## Environment Variables

See `.env.example` for all available configuration options.

**Required:**
- `ENCRYPTION_KEY` - Encryption key for storing credentials

**Optional:**
- `PORT` - Server port (default: 3000)
- `IMAP_HOST`, `IMAP_PORT`, `IMAP_USER`, `IMAP_PASSWORD` - Email credentials
- `SMTP_HOST`, `SMTP_PORT` - SMTP server settings
- `CHECK_INTERVAL` - Email check interval in seconds (default: 10)
- `MANUAL_CONFIRMATION` - Require manual approval (default: true)
- And more... (see `.env.example`)

## Data Persistence

Application data is stored in `/app/data` inside the container. Use Docker volumes to persist data:

```bash
docker volume create lazymail-data
docker run -v lazymail-data:/app/data ...
```

## Troubleshooting

**Container won't start:**
- Check logs: `docker logs lazymail-boss`
- Verify `ENCRYPTION_KEY` is set
- Ensure port 3000 is available

**Health check failing:**
- Wait 40 seconds for startup period
- Check application logs for errors
- Verify port 3000 is accessible

**Email monitoring not working:**
- Configure email credentials via dashboard or environment variables
- Check IMAP/SMTP server settings
- Review application logs for connection errors

For detailed deployment instructions, see [DEPLOYMENT.md](DEPLOYMENT.md)
