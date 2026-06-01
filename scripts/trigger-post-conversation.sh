#!/bin/bash

# Extract CRON_SECRET from .env file
CRON_SECRET=$(grep CRON_SECRET .env | cut -d '=' -f2 | tr -d '"')

# Trigger post + conversation cron job
echo "🔬 Triggering post + conversation generation..."

curl http://localhost:3000/api/cron-post-conversation \
  -H "Authorization: Bearer ${CRON_SECRET}" \
  -w "\n"

echo "✅ Done!"
