---
name: api-endpoint
description: >-
  Add or change Express API routes, controllers, services, auth, and OpenAPI
  contract. Use when implementing REST endpoints outside parser-only work.
---

# API Endpoint

**Agent:** `.cursor/agents/api-platform.md`  
**Workflow:** `.cursor/workflows/api-endpoint.md`

## Registration

`src/routes/index.ts` — public vs `authorizeRequest` protected

## Module pattern

```
modules/<domain>/
  <domain>.routes.ts
  <domain>.controller.ts
  <domain>.service.ts
  *.gate.ts          # feature flags
  *.errors.ts        # typed errors + codes
```

## OpenAPI

If UI uses generated hooks: update `workspace/lib/api-spec/openapi.yaml` then regenerate.

## Env

New flag → `lib/env.ts` + document in `docs/ai/DEPENDENCIES.md`

## Validate

```bash
cd workspace/artifacts/api-server && npx tsc --noEmit
```
