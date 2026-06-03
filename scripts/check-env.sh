#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "APP_VERSION:"
cat appfutebol_run/js/core/version.js

echo
echo "env.js:"
grep -E "url:|environment:" appfutebol_run/env.js

echo
echo "supabase.config.js fallback/runtime-aware check:"
grep -E "Runtime env.js|FALLBACK_SUPABASE_CONFIG|window.HARMONIA_SUPABASE|environment:" appfutebol_run/js/config/supabase.config.js
