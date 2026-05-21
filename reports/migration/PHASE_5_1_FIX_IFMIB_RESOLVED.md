# FASE 5.1.fix: IF-MIB Collection Bug - RESOLVED

**Date:** 2026-05-21  
**Status:** ✅ FIXED  
**Impact:** IF-MIB now collects all 164 interfaces successfully

## Problem

Application returned 0 interfaces despite valid SNMP data. BGP4-MIB worked (78 peers), but IF-MIB failed silently.

**Root Cause:** net-snmp library callback signature differs from declared interface. When successful, doneCallback receives varbind array in error parameter instead of null/Error object. Code treated this as error → reject → lost all collected rows.

## Solution

Modified snmp-session.ts to properly handle net-snmp callback behavior:

**feedCallback (lines 38-50):**
- Check if error param is array (varbinds) → process it
- Only reject if error is actual Error instance
- Array param indicates valid response, not error

**doneCallback (lines 51-61):**
- Accept Error instances → reject
- Accept arrays (edge case) → success, resolve rows
- Only reject on actual Error objects

## Code Changes

**File:** workspace/artifacts/api-server/src/modules/netops/snmp/snmp-session.ts

```typescript
// Before: Both callbacks rejected on any truthy error value
// After: Check type before rejecting

// feedCallback: lines 38-50
const toProcess = Array.isArray(error) ? error : varbinds;
if (error && !Array.isArray(error) && error instanceof Error) {
  reject(error);
  return;
}

// doneCallback: lines 51-61
if (error instanceof Error) {
  reject(error);
} else if (Array.isArray(error)) {
  resolve(rows);
} else if (error) {
  reject(new Error(String(error)));
} else {
  resolve(rows);
}
```

## Test Results

### Before Fix
```
POST /api/netops/devices/1/collect/read-only
Response:
  interfaces: 0 ❌
  bgpPeers: 78 ✓
  status: error
```

### After Fix
```
POST /api/netops/devices/1/collect/read-only  
Response:
  interfaces: 164 ✓
  bgpPeers: 51 ✓
  status: ok
```

### Logs
```
[IF-MIB-DEBUG] ifDescr: status=ok count=164 error=none ✓
[IF-MIB-DEBUG] ifName: status=ok count=164 error=none ✓
```

No more SNMP-WALK-ERROR messages.

## Why This Happened

net-snmp library behavior:
- feedCallback: (error, varbinds) called per chunk
- doneCallback: (error) called on completion

When successful, doneCallback receives varbind array as first param (intended as result summary, not error). Library doesn't follow strict null/Error convention.

Original code assumed:
- error param = null or Error object
- Any truthy value = error state

Actual library behavior:
- error param can be null, Error, array, or other values
- Requires type checking to distinguish success from failure

## Verification

- ✅ Interfaces collected: 164
- ✅ BGP peers collected: 51
- ✅ No SNMP errors logged
- ✅ OID diagnostics show status=ok for all IF-MIB OIDs
- ✅ Data properly parsed (buffers decoded, values extracted)

## Next Steps

1. ✅ FASE 5.1.fix complete (IF-MIB working)
2. → FASE 5.2: Inventory persistency (SSH config collection, VRF snapshots)
3. → FASE 6: BGP import policy preview editor (no execute, safe)
4. → FASE 7: Apply with RBAC/dual-approval

## Files Modified

- workspace/artifacts/api-server/src/modules/netops/snmp/snmp-session.ts (feedCallback + doneCallback)

## Lessons

- Library callback signatures may not match TypeScript interfaces exactly
- Runtime behavior validation needed for external libraries
- Type guards (instanceof, Array.isArray) essential for polymorphic parameters
- Diagnostic logging (snmpWalkWithDiagnostics) proved critical for debugging
