#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

cp appfutebol_run/env.dev.js appfutebol_run/env.js

echo "OK: appfutebol_run/env.js agora aponta para harmonia-dev."
grep -E "url:|environment:" appfutebol_run/env.js
