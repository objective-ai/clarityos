#!/bin/bash
# scripts/check-do-health.sh

echo "🔍 Starting ClarityOS Production Health Check..."
echo "--------------------------------------------"

# 1. Test Local Backend Connectivity
echo "📡 Testing Backend connectivity at $FASTAPI_URL..."
HTTP_STATUS=$(curl -o /dev/null -s -w "%{http_code}" "$FASTAPI_URL/health")

if [ "$HTTP_STATUS" -eq 200 ]; then
  echo "✅ Backend is REACHABLE (Status 200)"
else
  echo "❌ Backend is UNREACHABLE (Status $HTTP_STATUS)"
fi

# 2. Test Supabase Variable Presence
echo "🔑 Checking Supabase credentials..."
if [ -z "$NEXT_PUBLIC_SUPABASE_URL" ] || [ -z "$SUPABASE_JWT_SECRET" ]; then
  echo "❌ Error: Missing Supabase Auth variables!"
else
  echo "✅ Auth variables are SET."
fi

# 3. Test Anthropic Connectivity
echo "🤖 Checking AI Scribe connectivity..."
if [ -z "$ANTHROPIC_API_KEY" ]; then
  echo "⚠️ Warning: ANTHROPIC_API_KEY is missing. Scribe will not work."
else
  echo "✅ AI Key is present."
fi

echo "--------------------------------------------"
echo "Check complete."