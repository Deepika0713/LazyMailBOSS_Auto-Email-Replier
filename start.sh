#!/bin/sh
# Startup script for LazyMailBOSS cloud deployment

set -e

echo "LazyMailBOSS - Starting up..."

# Validate required environment variables
if [ -z "$ENCRYPTION_KEY" ]; then
  echo "ERROR: ENCRYPTION_KEY environment variable is required"
  echo "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
  exit 1
fi

# Set default values for optional environment variables
export PORT="${PORT:-3000}"
export NODE_ENV="${NODE_ENV:-production}"
export DATABASE_PATH="${DATABASE_PATH:-/app/data/lazymail.db}"
export CONFIG_DATABASE_PATH="${CONFIG_DATABASE_PATH:-/app/data/config.db}"
export CHECK_INTERVAL="${CHECK_INTERVAL:-10}"
export MANUAL_CONFIRMATION="${MANUAL_CONFIRMATION:-true}"
export LOG_LEVEL="${LOG_LEVEL:-info}"

# Create data directory if it doesn't exist
mkdir -p "$(dirname "$DATABASE_PATH")"
mkdir -p "$(dirname "$CONFIG_DATABASE_PATH")"

echo "Configuration:"
echo "  PORT: $PORT"
echo "  NODE_ENV: $NODE_ENV"
echo "  DATABASE_PATH: $DATABASE_PATH"
echo "  CONFIG_DATABASE_PATH: $CONFIG_DATABASE_PATH"
echo "  CHECK_INTERVAL: $CHECK_INTERVAL seconds"
echo "  MANUAL_CONFIRMATION: $MANUAL_CONFIRMATION"
echo "  LOG_LEVEL: $LOG_LEVEL"

# Check if email credentials are provided
if [ -n "$IMAP_HOST" ] && [ -n "$IMAP_USER" ] && [ -n "$IMAP_PASSWORD" ]; then
  echo "  Email monitoring: ENABLED (credentials provided)"
else
  echo "  Email monitoring: DISABLED (configure via dashboard)"
fi

echo ""
echo "Starting LazyMailBOSS..."

# Start the application
exec node dist/index.js
