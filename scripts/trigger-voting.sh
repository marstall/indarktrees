#!/bin/bash

# Extract CRON_SECRET from .env file
CRON_SECRET=$(grep CRON_SECRET .env | cut -d '=' -f2 | tr -d '"')

# Trigger voting cron job
echo "🗳️  Triggering voting round..."

curl http://localhost:3000/api/cron-voting \
  -H "Authorization: Bearer ${CRON_SECRET}" \
  -w "\n"

echo "✅ Done!"
