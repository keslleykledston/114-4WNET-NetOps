# Config Generator MVP

## Objetivo
Gerar preview de configuração Huawei de forma isolada, sem apply em dispositivo.

## Escopo
- Listar templates.
- Validar entrada.
- Renderizar preview.
- Salvar histórico e artefatos.
- Copiar/baixar TXT.
- Sugestões de tenant/device/interface/template/conflitos vêm de inventory, discovery, BGP e Service Catalog.

## Flags
- `CONFIG_GENERATOR_ENABLED=false` por padrão.
- `CONFIG_WRITE_ENABLED=false` por padrão e bloqueia approval/execute.

## RBAC
- `viewer`: listar templates e ver runs.
- `operator`: validar, renderizar, salvar, baixar.
- `admin`: gerenciar templates e versões.

## Endpoints
- `GET /api/config-generator/feature`
- `GET /api/config-generator/templates`
- `GET /api/config-generator/templates/:id/schema`
- `POST /api/config-generator/validate`
- `POST /api/config-generator/render`
- `POST /api/config-generator/runs`
- `GET /api/config-generator/runs/:id`
- `GET /api/config-generator/runs/:id/artifacts`
- `POST /api/config-generator/runs/:id/request-approval`
- `POST /api/config-generator/change-requests/:id/approve`
- `GET /api/config-generator/suggestions/service-context`
- `GET /api/config-generator/id-ranges`
- `GET /api/config-generator/id-inventory`
- `POST /api/config-generator/id-inventory/refresh` (reprocessa DB, sem coleta)
- `POST /api/config-generator/id-allocator/suggest`
- `POST /api/config-generator/id-allocator/validate`

## Fluxo
1. Selecionar tenant/device/template.
2. Validar input.
3. Gerar preview.
4. Salvar artefatos, se desejado.
5. Baixar ou copiar o TXT.

## Segurança
- Nenhum comando é enviado ao device.
- `md5/password/secret/key/token/community` são mascarados.
- Audit/history persistem payload sanitizado.
- Artefatos salvos mantêm placeholders como `<SECRET_NOT_STORED>`.

## Teste
- `pnpm --filter @workspace/api-server run typecheck`
- `pnpm --filter @workspace/netops-manager run typecheck`
- `pnpm run typecheck`
- `DATABASE_URL=postgres://selftest:selftest@127.0.0.1:1/selftest pnpm --dir ./scripts exec tsx ../artifacts/api-server/src/modules/config-generator/config-generator.selftest.ts`
- `DATABASE_URL=postgres://selftest:selftest@127.0.0.1:1/selftest pnpm --dir ./scripts exec tsx ../artifacts/api-server/src/modules/config-generator/config-generator.contract.selftest.ts`

## Limitações
- Sem apply real.
- Sem execução em device.
- Sem integração com Controlled Execution.

## Próximos passos
- Approval/apply controlado.
- Mais templates.
- Mais validações por vendor/platform.

## ID Allocator (fase CONFIG-GENERATOR.ID-ALLOCATOR)
- Catálogo K3G VLAN rev. 2026.05 em `config-generator-id-ranges.ts`.
- Inventário normalizado em `config_generator_discovered_ids`.
- Sugestão integrada em `/provisioning` e `/config-generator`.
- Ver `docs/config-generator/ID_ALLOCATOR.md`.
