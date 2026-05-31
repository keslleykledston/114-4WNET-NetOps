#!/bin/bash
# RC-HARDENING: RBAC Validation Test

set -e

API="${API_BASE_URL:-http://127.0.0.1:8085}"
ADMIN_EMAIL="admin@example.com"
ADMIN_PASS="admin123"
READONLY_EMAIL="readonly@example.com"
READONLY_PASS="readonly123"

echo "RBAC Test: Validating role-based access control"
echo "=================================================="

# Login as admin
echo "1. Admin login..."
ADMIN_TOKEN=$(curl -s -X POST "$API/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASS\"}" \
  | jq -r '.token')

if [ -z "$ADMIN_TOKEN" ] || [ "$ADMIN_TOKEN" == "null" ]; then
  echo "FAIL: Admin login"
  exit 1
fi
echo "PASS: Admin login"

# Login as read-only
echo "2. Read-only user login..."
READONLY_TOKEN=$(curl -s -X POST "$API/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$READONLY_EMAIL\",\"password\":\"$READONLY_PASS\"}" \
  | jq -r '.token')

if [ -z "$READONLY_TOKEN" ] || [ "$READONLY_TOKEN" == "null" ]; then
  echo "FAIL: Read-only user login"
  exit 1
fi
echo "PASS: Read-only user login"

# Admin can read devices
echo "3. Admin read devices..."
ADMIN_DEVICES=$(curl -s -X GET "$API/api/devices" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq '.[] | .id' | head -1)

if [ -z "$ADMIN_DEVICES" ]; then
  echo "FAIL: Admin can't read devices"
  exit 1
fi
echo "PASS: Admin read devices"

# Read-only can read devices
echo "4. Read-only read devices..."
READONLY_DEVICES=$(curl -s -X GET "$API/api/devices" \
  -H "Authorization: Bearer $READONLY_TOKEN" | jq '.[] | .id' | head -1)

if [ -z "$READONLY_DEVICES" ]; then
  echo "FAIL: Read-only can't read devices"
  exit 1
fi
echo "PASS: Read-only read devices"

# Admin can create service request
echo "5. Admin create service request..."
ADMIN_CREATE=$(curl -s -X POST "$API/api/service-requests" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"serviceType":"L2VC","customerName":"Test","description":"Test"}' \
  | jq '.id')

if [ -z "$ADMIN_CREATE" ] || [ "$ADMIN_CREATE" == "null" ]; then
  echo "FAIL: Admin can't create service request"
  exit 1
fi
echo "PASS: Admin create service request (ID: $ADMIN_CREATE)"

# Read-only can't create service request
echo "6. Read-only create service request (should fail)..."
READONLY_CREATE=$(curl -s -w "\n%{http_code}" -X POST "$API/api/service-requests" \
  -H "Authorization: Bearer $READONLY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"serviceType":"L2VC","customerName":"Test","description":"Test"}')

HTTP_CODE=$(echo "$READONLY_CREATE" | tail -n 1)
if [ "$HTTP_CODE" == "403" ] || [ "$HTTP_CODE" == "401" ]; then
  echo "PASS: Read-only denied (HTTP $HTTP_CODE)"
else
  echo "FAIL: Read-only should be denied (HTTP $HTTP_CODE)"
  exit 1
fi

# Admin can delete service request
echo "7. Admin delete service request..."
ADMIN_DELETE=$(curl -s -w "\n%{http_code}" -X DELETE "$API/api/service-requests/$ADMIN_CREATE" \
  -H "Authorization: Bearer $ADMIN_TOKEN")

HTTP_CODE=$(echo "$ADMIN_DELETE" | tail -n 1)
if [ "$HTTP_CODE" == "204" ] || [ "$HTTP_CODE" == "200" ]; then
  echo "PASS: Admin delete (HTTP $HTTP_CODE)"
else
  echo "FAIL: Admin delete failed (HTTP $HTTP_CODE)"
  exit 1
fi

echo ""
echo "=================================================="
echo "RBAC Test: ALL CHECKS PASSED ✓"
echo "=================================================="
exit 0
