# Workflow: Provisioning validation

**Agent:** `agents/provisioning-validator.md`

## Steps

1. Read the context summary and phase status
2. Run `node tools/provisioning/provisioning-flags-selftest.mjs`
3. Run `node tools/provisioning/provisioning-findings-selftest.mjs`
4. Run `node tools/provisioning/provisioning-preview-l2vpn-selftest.mjs`
5. Run `node tools/provisioning/provisioning-preview-l3vpn-selftest.mjs`
6. Summarize pass/fail and note blockers explicitly

