# Provisioning Template Model

## Purpose

Provisioning templates define the only approved way to render configuration, rollback, and validation commands. They are intentionally versioned, named, and limited to known vendors and service types.

## Current model

Template records support:

- `vendor`
- `platform`
- `serviceType`
- `templateType` (`config`, `rollback`, `validation`)
- `content`
- `parameterSchema`
- `enabled`
- `version`

The implementation reuses the existing template registry instead of creating a parallel template engine.

## Current sources

- Built-in registry: `workspace/artifacts/api-server/src/modules/provisioning/provisioning-template-registry.ts`
- Database registry: `workspace/lib/db/src/schema/provisioning_templates.ts`
- Legacy compatibility templates: `workspace/artifacts/api-server/src/modules/netops/provisioning-template-seed.ts`

## Initial template set for the MVP

The current MVP adds Huawei VRP coverage for:

- L2VPN config
- L2VPN rollback
- L2VPN validation
- L3VPN config
- L3VPN rollback
- L3VPN validation

These templates are intended for preview and validation first. They do not enable real device apply by default.

## Rendering contract

The renderer must:

- validate required parameters before output
- reject missing variables with a clear error
- keep command generation deterministic
- avoid free-form command injection
- never execute commands during preview

## Compatibility rules

- Legacy templates remain available
- Template names and IDs must stay stable for existing UI flows
- New structured L2VPN/L3VPN templates should not break the older BGP/L3VPN service catalog
- Secrets and credentials must stay masked in preview/export paths

## Operational note

The template model is still read-only from an operator perspective in the MVP. Write workflows, branching, and editing remain future work.
