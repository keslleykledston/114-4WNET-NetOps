# Provisioning Preview Only

> **MVP fechado** — checklist operacional e de segurança: [CONFIG_GENERATOR_MVP_CLOSURE.md](../config-generator/CONFIG_GENERATOR_MVP_CLOSURE.md)

## Role
- `/provisioning` is UI principal do MVP.
- Config Generator is engine oficial de geração, validação, render e histórico.
- provisioning legado existe, mas não é caminho operacional oficial do MVP.

## Safety
- `CONFIG_WRITE_ENABLED=false` keeps write blocked.
- No command sent to device.
- Any future apply must pass Controlled Execution and human approval.
- Secrets stay sanitized in logs, DB, audit, history and downloads.

## UI
- Show preview only.
- Use inventory, discovery, BGP and Service Catalog only to suggest tenant, device, interfaces, template and conflicts.
- ID Allocator sugere VLAN/L2VC/VSI com range K3G; operador pode override manual.
- Change Request Preview gera pacote markdown + JSON para ticket NOC (sem execução).
- Keep future approval/apply paths hidden or disabled.

## Status
- Preview-only.
- Legacy backend preserved.
- Main route stays safe.
- **MVP oficialmente fechado** (documentação em `docs/config-generator/CONFIG_GENERATOR_MVP_CLOSURE.md`).

## Documentação
- [CONFIG_GENERATOR_MVP.md](../config-generator/CONFIG_GENERATOR_MVP.md)
- [ID_ALLOCATOR.md](../config-generator/ID_ALLOCATOR.md)
- [CHANGE_REQUEST_PREVIEW.md](../config-generator/CHANGE_REQUEST_PREVIEW.md)
- [CONFIG_GENERATOR_MVP_CLOSURE.md](../config-generator/CONFIG_GENERATOR_MVP_CLOSURE.md)
