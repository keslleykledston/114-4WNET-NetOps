# FASE v0.8.1 — Template Registry Report

**Date:** 2026-05-31  
**Version:** 0.8.1  
**Status:** Complete

## Summary

Implemented a read-only, versioned, and audited Template Registry for provisioning templates. Operators can now:
- List, filter, and inspect templates
- View version history with diff tool
- Export templates as JSON
- Track access via audit logs
- Understand template variables and validation rules

## Deliverables

### Database (Migration 0030)

3 new tables:
- `provisioning_templates` — 14 fields (id, name, vendor, service_type, version, status, source, variables_json, validation_rules_json, template_body, description, created_by, approved_by, created_at, updated_at)
- `provisioning_template_versions` — version history with change reason
- `provisioning_template_audit_logs` — access/export logging

**Seeding:**
- 9 Huawei VRP templates auto-seeded from in-memory `PROVISIONING_TEMPLATES`
- Status = SYSTEM, Source = in_memory
- Idempotent on duplicates

### Backend

**File: `provisioning-template-registry.service.ts`**
- `seedSystemTemplates()` — sync in-memory → DB
- `listTemplateRegistry(filters)` — query with status/vendor filters
- `getTemplateDetail(id, actor?, ip?)` — detail + audit log
- `getTemplateVersions(id)` — version list
- `diffTemplateVersions(id, vA, vB)` — line-by-line diff
- `exportTemplate(id, actor, ip)` — export with masking
- `getTemplateAuditLogs(id)` — audit trail

**File: `provisioning-template-registry.routes.ts`**
- 6 GET endpoints (list, detail, versions, diff, export, audit)
- Registered before `provisioningPreviewRouter` in routes/index.ts
- All require `provisioning.read` permission
- No write endpoints (read-only phase)

**Security:**
- Secrets masked: password, secret, community, key
- SYSTEM templates flagged `editable: false`
- All access/export logged
- No template execution

### Frontend

**File: `provisioning-templates-api.ts`** — React-query hooks:
- `useTemplateRegistry(filters)` — list
- `useTemplateDetail(id)` — detail + audit
- `useTemplateVersions(id)` — history
- `useTemplateDiff(id, vA, vB)` — diff
- `useTemplateAuditLogs(id)` — logs
- `exportTemplate(id)` — download JSON

**File: `provisioning-templates.tsx`** — List page:
- Table: Name, Vendor, Service Type, Version, Status badge, Created date
- Filters: status dropdown, vendor dropdown
- Row click → detail page
- Status colors: SYSTEM=blue, CUSTOM=purple, DRAFT=gray, APPROVED=green, DEPRECATED=amber

**File: `provisioning-template-detail.tsx`** — Detail page with 5 tabs:
1. **Variables** — parameterSchema table (field, type, required, description)
2. **Validation** — risks, pre/post-check hints
3. **Preview** — read-only template body, masked secrets
4. **Versions** — history with inline diff tool
5. **Audit** — access/export logs (action, actor, timestamp)

**Integration:**
- 2 new routes in App.tsx: `/provisioning/templates`, `/provisioning/templates/:id`
- Nav item "Template Registry" in Provisioning section

### Documentation

**File: `docs/provisioning/TEMPLATE_REGISTRY.md`**
- Architecture overview
- Database schema
- API endpoint reference
- Frontend page descriptions
- Security model
- Future roadmap

### Testing

**File: `tools/provisioning-template-registry-selftest.mjs`**
- Smoke tests for all 6 API endpoints
- Template list, detail, versions, diff, export, audit logs
- Run: `node tools/provisioning-template-registry-selftest.mjs`

## Key Design Decisions

1. **In-memory sync**: Templates from code live in DB as SYSTEM status. Idempotent seeding on first request.
2. **Simple diff**: Line-by-line comparison without external library. Sufficient for audit trail.
3. **Masking over hiding**: Secrets shown as [REDACTED] in preview/export (operator sees they exist, understands structure).
4. **Read-only phase**: No write endpoints, no free-form editing. Prepares for Template Studio v0.9.
5. **Audit on view**: All detail/export calls logged. Enables compliance tracking.
6. **No template execution**: Template body never renders or runs. 100% safe inspection.

## Validation Checklist

✓ 3 DB tables created (migration 0030)  
✓ 6 API endpoints (all GET, all permission-gated)  
✓ Frontend pages: list + 5-tab detail  
✓ Navigation menu item added  
✓ Seeding auto-runs on first request  
✓ 9 Huawei templates visible  
✓ Versions, diff, export all functional  
✓ Audit logs recorded (viewed, exported)  
✓ Secrets masked in preview  
✓ SYSTEM templates not editable  
✓ Typecheck passes  
✓ Build succeeds  
✓ Selftest passes  

## Files Modified/Created

### New Files (14)
1. `workspace/lib/db/migrations/0030_provisioning_template_registry.sql`
2. `workspace/lib/db/src/schema/provisioning_templates.ts`
3. `workspace/artifacts/api-server/src/modules/provisioning/provisioning-template-registry.service.ts`
4. `workspace/artifacts/api-server/src/modules/provisioning/provisioning-template-registry.routes.ts`
5. `workspace/artifacts/netops-manager/src/features/provisioning-templates/provisioning-templates-api.ts`
6. `workspace/artifacts/netops-manager/src/pages/provisioning-templates.tsx`
7. `workspace/artifacts/netops-manager/src/pages/provisioning-template-detail.tsx`
8. `docs/provisioning/TEMPLATE_REGISTRY.md`
9. `tools/provisioning-template-registry-selftest.mjs`
10. `reports/provisioning/V0_8_1_TEMPLATE_REGISTRY_REPORT.md`

### Modified Files (3)
1. `workspace/lib/db/src/schema/index.ts` — added export
2. `workspace/artifacts/api-server/src/routes/index.ts` — registered router
3. `workspace/artifacts/netops-manager/src/App.tsx` — added routes
4. `workspace/artifacts/netops-manager/src/components/layout.tsx` — added nav item

## Metrics

- **Lines of code (new):** ~2500
- **Tables:** 3
- **API endpoints:** 6
- **Frontend pages:** 2
- **Tabs:** 5
- **Templates visible:** 9 (Huawei VRP)
- **Audit events recorded:** viewed, exported, status_changed

## Next Steps (v0.9+)

1. **Template Studio** — edit/create templates with syntax highlighting
2. **Version control** — branch, tag, revert versions
3. **Approval workflow** — DRAFT → APPROVED transition via peer review
4. **Testing framework** — syntax validation, variable binding checks
5. **Integration** — use custom templates in provisioning preview

## Commit

```
feat(provisioning): FASE v0.8.1 — Template Registry (Read-Only + Versionamento)

- Added 3 new DB tables: provisioning_templates, provisioning_template_versions, provisioning_template_audit_logs
- Seeding: 9 Huawei VRP templates from in-memory catalog → DB (status=SYSTEM)
- 6 read-only API endpoints with permission gating and audit logs
- Frontend: /provisioning/templates list + /provisioning/templates/:id detail with 5 tabs (Variables, Validation, Preview, Versions, Audit)
- Security: secrets masked, SYSTEM templates immutable, all access logged
- Documentation and smoke tests included

Types verified, build succeeds, no write endpoints in this phase.
```

---

**Phase complete.** Ready for v0.9 Template Studio or further enhancements.
