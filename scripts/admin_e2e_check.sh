#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-http://127.0.0.1:8000/api}"
ADMIN_USERNAME="${ADMIN_USERNAME:-admin}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-admin123}"

PASS_COUNT=0
FAIL_COUNT=0

pass() {
  PASS_COUNT=$((PASS_COUNT + 1))
  echo "[PASS] $1"
}

fail() {
  FAIL_COUNT=$((FAIL_COUNT + 1))
  echo "[FAIL] $1"
}

json_get() {
  local key="$1"
  local input
  input="$(cat)"
  JSON_INPUT="$input" python3 - "$key" <<'PY'
import json
import os
import sys

key = sys.argv[1]
raw = os.environ.get("JSON_INPUT", "")
if not raw.strip():
  print("")
  raise SystemExit(0)

try:
  data = json.loads(raw)
except Exception:
  print("")
  raise SystemExit(0)

value = data
for part in key.split('.'):
  if isinstance(value, dict):
    value = value.get(part)
  else:
    value = None
    break

if value is None:
  print("")
elif isinstance(value, (dict, list)):
  print(json.dumps(value, ensure_ascii=False))
else:
  print(value)
PY
}

request_with_code() {
  local method="$1"
  local endpoint="$2"
  local payload="${3:-}"
  local auth_header="${4:-}"

  if [[ -n "$payload" ]]; then
    if [[ -n "$auth_header" ]]; then
      curl -sS -X "$method" "$BASE_URL$endpoint" \
        -H "Content-Type: application/json" \
        -H "$auth_header" \
        -d "$payload" \
        -w "\n%{http_code}"
    else
      curl -sS -X "$method" "$BASE_URL$endpoint" \
        -H "Content-Type: application/json" \
        -d "$payload" \
        -w "\n%{http_code}"
    fi
  else
    if [[ -n "$auth_header" ]]; then
      curl -sS -X "$method" "$BASE_URL$endpoint" \
        -H "$auth_header" \
        -w "\n%{http_code}"
    else
      curl -sS -X "$method" "$BASE_URL$endpoint" \
        -w "\n%{http_code}"
    fi
  fi
}

extract_body() {
  sed '$d'
}

extract_code() {
  tail -n1
}

echo "=== Admin E2E Checklist ==="
echo "Base URL: $BASE_URL"

# 1) Admin login
LOGIN_PAYLOAD=$(cat <<JSON
{"username":"$ADMIN_USERNAME","password":"$ADMIN_PASSWORD"}
JSON
)

login_raw=$(request_with_code "POST" "/auth/login" "$LOGIN_PAYLOAD")
login_code=$(echo "$login_raw" | extract_code)
login_body=$(echo "$login_raw" | extract_body)

if [[ "$login_code" != "200" ]]; then
  fail "Admin login failed (HTTP $login_code)"
  echo "$login_body"
  echo "=== Summary: $PASS_COUNT passed, $FAIL_COUNT failed ==="
  exit 1
fi

TOKEN=$(echo "$login_body" | json_get "access_token")
if [[ -z "$TOKEN" ]]; then
  fail "No access token returned from login"
  echo "=== Summary: $PASS_COUNT passed, $FAIL_COUNT failed ==="
  exit 1
fi

AUTH="Authorization: Bearer $TOKEN"
pass "Admin login"

# 2) Core admin GET endpoints
for ep in \
  "/auth/me" \
  "/hotels" \
  "/dashboard/overview" \
  "/dashboard/attendance" \
  "/auth/users?include_inactive=true" \
  "/tasks" \
  "/maintenance/reports" \
  "/broadcasts" \
  "/broadcasts/inbox" \
  "/finance/admin-reports/overview?days=30" \
  "/finance/warehouse-items" \
; do
  raw=$(request_with_code "GET" "$ep" "" "$AUTH")
  code=$(echo "$raw" | extract_code)
  if [[ "$code" == "200" ]]; then
    pass "GET $ep"
  else
    fail "GET $ep returned HTTP $code"
  fi
done

# 3) Create temp user
STAMP=$(date +%s)
TEMP_USERNAME="e2e_reception_$STAMP"
USER_PAYLOAD=$(cat <<JSON
{"username":"$TEMP_USERNAME","password":"123456","full_name":"E2E Reception $STAMP","role":"reception","hotel_id":1}
JSON
)

user_raw=$(request_with_code "POST" "/auth/register" "$USER_PAYLOAD" "$AUTH")
user_code=$(echo "$user_raw" | extract_code)
user_body=$(echo "$user_raw" | extract_body)

TEMP_USER_ID=""
if [[ "$user_code" == "200" ]]; then
  TEMP_USER_ID=$(echo "$user_body" | json_get "id")
  if [[ -n "$TEMP_USER_ID" ]]; then
    pass "Create temp user"
  else
    fail "Temp user created but no user id found"
  fi
else
  fail "Create temp user failed (HTTP $user_code)"
fi

# 4) Create + close a task (if user creation succeeded)
TEMP_TASK_ID=""
if [[ -n "$TEMP_USER_ID" ]]; then
  task_payload=$(cat <<JSON
{"title":"E2E Admin Task $STAMP","description":"Smoke check task","priority":"normal","assigned_to_id":$TEMP_USER_ID,"hotel_id":1}
JSON
)

  task_raw=$(request_with_code "POST" "/tasks" "$task_payload" "$AUTH")
  task_code=$(echo "$task_raw" | extract_code)
  task_body=$(echo "$task_raw" | extract_body)

  if [[ "$task_code" == "200" ]]; then
    TEMP_TASK_ID=$(echo "$task_body" | json_get "id")
    if [[ -n "$TEMP_TASK_ID" ]]; then
      pass "Create task"

      close_payload='{"status":"closed"}'
      close_raw=$(request_with_code "PATCH" "/tasks/$TEMP_TASK_ID/status" "$close_payload" "$AUTH")
      close_code=$(echo "$close_raw" | extract_code)
      if [[ "$close_code" == "200" ]]; then
        pass "Close task"
      else
        fail "Close task failed (HTTP $close_code)"
      fi
    else
      fail "Task created but id missing"
    fi
  else
    fail "Create task failed (HTTP $task_code)"
  fi
fi

# 5) Create broadcast to all
BC_PAYLOAD=$(cat <<JSON
{"title":"E2E Broadcast $STAMP","message":"Admin broadcast smoke check","target_role":"all","hotel_id":null}
JSON
)

bc_raw=$(request_with_code "POST" "/broadcasts" "$BC_PAYLOAD" "$AUTH")
bc_code=$(echo "$bc_raw" | extract_code)
if [[ "$bc_code" == "200" ]]; then
  pass "Create broadcast (all hotels/all roles)"
else
  fail "Create broadcast failed (HTTP $bc_code)"
fi

# 6) Warehouse add/update/consume/deactivate
WH_ID=""
wh_create_payload=$(cat <<JSON
{"item_name":"E2E Item $STAMP","quantity":50,"reorder_level":10,"unit":"قطعة"}
JSON
)

wh_create_raw=$(request_with_code "POST" "/finance/warehouse-items" "$wh_create_payload" "$AUTH")
wh_create_code=$(echo "$wh_create_raw" | extract_code)
wh_create_body=$(echo "$wh_create_raw" | extract_body)

if [[ "$wh_create_code" == "200" ]]; then
  WH_ID=$(echo "$wh_create_body" | json_get "id")
  if [[ -n "$WH_ID" ]]; then
    pass "Create warehouse item"

    wh_update_payload='{"quantity":60,"reorder_level":12,"unit":"قطعة"}'
    wh_update_raw=$(request_with_code "PATCH" "/finance/warehouse-items/$WH_ID" "$wh_update_payload" "$AUTH")
    wh_update_code=$(echo "$wh_update_raw" | extract_code)
    if [[ "$wh_update_code" == "200" ]]; then
      pass "Update warehouse item"
    else
      fail "Update warehouse item failed (HTTP $wh_update_code)"
    fi

    wh_consume_payload='{"quantity":5,"note":"E2E consume"}'
    wh_consume_raw=$(request_with_code "POST" "/finance/warehouse-items/$WH_ID/consume" "$wh_consume_payload" "$AUTH")
    wh_consume_code=$(echo "$wh_consume_raw" | extract_code)
    if [[ "$wh_consume_code" == "200" ]]; then
      pass "Consume warehouse item"
    else
      fail "Consume warehouse item failed (HTTP $wh_consume_code)"
    fi

    wh_disable_payload='{"is_active":false}'
    wh_disable_raw=$(request_with_code "PATCH" "/finance/warehouse-items/$WH_ID" "$wh_disable_payload" "$AUTH")
    wh_disable_code=$(echo "$wh_disable_raw" | extract_code)
    if [[ "$wh_disable_code" == "200" ]]; then
      pass "Deactivate warehouse item"
    else
      fail "Deactivate warehouse item failed (HTTP $wh_disable_code)"
    fi
  else
    fail "Warehouse item created but id missing"
  fi
else
  fail "Create warehouse item failed (HTTP $wh_create_code)"
fi

# 7) Deactivate temp user (cleanup)
if [[ -n "$TEMP_USER_ID" ]]; then
  user_disable_payload='{"is_active":false}'
  user_disable_raw=$(request_with_code "PATCH" "/auth/users/$TEMP_USER_ID" "$user_disable_payload" "$AUTH")
  user_disable_code=$(echo "$user_disable_raw" | extract_code)
  if [[ "$user_disable_code" == "200" ]]; then
    pass "Deactivate temp user"
  else
    fail "Deactivate temp user failed (HTTP $user_disable_code)"
  fi
fi

echo "=== Summary: $PASS_COUNT passed, $FAIL_COUNT failed ==="
if [[ "$FAIL_COUNT" -gt 0 ]]; then
  exit 1
fi
