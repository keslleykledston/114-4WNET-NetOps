# Provisioning Preview Engine (v0.4.0)

## Objetivo

Gerar planos de provisionamento **sem aplicar configuração** em dispositivos de rede.

## Endpoints

| Método | Path | Permissão |
|--------|------|-----------|
| GET | `/api/provisioning/templates` | `provisioning.read` |
| GET | `/api/provisioning/templates/:id` | `provisioning.read` |
| POST | `/api/provisioning/preview` | `provisioning.read` |
| POST | `/api/provisioning/preview/export` | `provisioning.read` |

## Fluxo

1. Operador lista templates e escolhe `templateId`.
2. API valida device, vendor/platform, parâmetros e hints de discovery.
3. Engine renderiza `configPreview` e `rollbackPreview`.
4. Resposta inclui `status` (`valid` | `warning` | `blocked`), riscos e plano de execução textual.
5. Export Markdown/JSON para change ticket.
6. Audit registra `provisioning_preview_created` e `provisioning_preview_export`.

## Guardrails

- `CONFIG_APPLY_ENABLED=false` (default)
- `DRY_RUN_DEFAULT=true`
- Sem SSH write / config mode / commit
- Parâmetros sensíveis mascarados em preview, export e audit

## Módulo

`workspace/artifacts/api-server/src/modules/provisioning/`

- `provisioning-template-registry.ts` — catálogo de templates
- `provisioning-preview.service.ts` — orquestração
- `provisioning-validator.ts` — validações + discovery
- `provisioning-renderer.ts` / `provisioning-rollback.ts` — render
- `provisioning-export.ts` — Markdown
- `provisioning-preview.routes.ts` — rotas Express

## Selftest

```bash
node tools/provisioning-preview-selftest.mjs
```
