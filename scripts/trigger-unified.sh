#!/bin/bash

# Extract CRON_SECRET from .env file
CRON_SECRET=$(grep CRON_SECRET .env | cut -d '=' -f2 | tr -d '"')

# Trigger unified cron job
echo "🔬 Triggering unified post generation cycle..."
echo ""

curl http://localhost:3000/api/cron-unified \
  -H "Authorization: Bearer ${CRON_SECRET}" \
  -w "\n"

echo ""
echo "✅ Done!"
