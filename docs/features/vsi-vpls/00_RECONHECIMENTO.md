# 00 - Reconhecimento

Data: 2026-06-19

## Resumo da arvore

- `workspace/artifacts/api-server/src/modules/l2circuits/` existe e ja atende `GET/POST /api/l2-circuits`.
- `workspace/artifacts/netops-manager/src/features/l2-circuits/` existe e a pagina `/l2-circuits` esta ativa no layout.
- `workspace/lib/db/src/schema/l2circuits.ts` ja possui tabela `l2_circuits` e `l2_discovery_jobs`.
- `workspace/lib/db/src/schema/l2_operational.ts` ja possui estado operacional por device.
- `workspace/artifacts/api-server/src/routes/index.ts` ja registra o router de L2.
- `workspace/artifacts/netops-manager/src/components/layout.tsx` ja possui item de sidebar `L2 Circuits`.
- `docs/l2-circuits/` ja documenta o dominio atual.

## Arquivos relevantes encontrados

- `workspace/artifacts/api-server/src/modules/l2circuits/l2circuits.routes.ts`
- `workspace/artifacts/api-server/src/modules/l2circuits/l2circuits.controller.ts`
- `workspace/artifacts/api-server/src/modules/l2circuits/l2circuits.service.ts`
- `workspace/artifacts/api-server/src/modules/l2circuits/parsers/huawei-vrp-l2.ts`
- `workspace/artifacts/api-server/src/modules/l2circuits/parsers/vsi-multipoint.helpers.ts`
- `workspace/artifacts/netops-manager/src/pages/l2-circuits.tsx`
- `workspace/artifacts/netops-manager/src/features/l2-circuits/l2-circuits-api.ts`
- `workspace/artifacts/netops-manager/src/features/l2-circuits/l2-circuit-detail-sheet.tsx`
- `workspace/lib/db/src/schema/l2circuits.ts`
- `workspace/lib/db/src/schema/l2_operational.ts`
- `workspace/artifacts/netops-manager/src/components/layout.tsx`

## Pontos de integracao

- A feature nova deve reaproveitar o dominio `L2 Circuits`, mas com submódulo proprio para `VSI/VPLS`.
- O backend ja tem padrao de router + controller + service em `api-server/src/modules/l2circuits/`.
- O frontend ja usa pagina dedicada em `pages/l2-circuits.tsx` e componentes em `features/l2-circuits/`.
- O banco usa Drizzle + Postgres; a nova biblioteca deve seguir o mesmo padrao.
- O layout ja tem sidebar compacta; o item novo deve entrar como subitem de `L2 Circuits`, sem reescrever a navegacao global.

## Riscos

- Duplicar conceito ja existente de `vsi` no inventario atual sem consolidacao por `tenant_id + vs_id`.
- Criar migration nova sem mapear tabelas e history existentes.
- Misturar coleta operacional com biblioteca persistida e quebrar isolamento read-only.
- Expor config bruta sem redaction ou sem metadados de coleta.

## Decisoes iniciais

- Manter a feature como submodulo de L2 Circuits.
- Focar o MVP em leitura, persistencia, diagnostico e historico simples.
- Reusar padroes existentes de API, UI, tabela e badges.
- Priorizar Huawei no parser inicial.
- Tratar status como classificacao deterministica com evidencias.

## Comandos executados

- `pwd`
- `find . -maxdepth 3 -type f | sort | sed 's#^\\./##' | head -300`
- `find . -maxdepth 3 -type d | sort | sed 's#^\\./##' | head -200`
- `rg -n "L2|l2|circuit|circuits|VSI|vsi|VPLS|vpls|l2vc|vpws|tenant|sidebar|route|drizzle|migration|schema|zabbix|alarm|history|snapshot|discovery" .`
- `ai-memory search --project 114-4WNET_NetOps "VSI VPLS L2 Circuits"`

## Resultado inicial

- Nenhum hit relevante em ai-memory para esse recorte ainda.
- O repositório ja tem base funcional de L2 Circuits, parser Huawei e UI read-only.
- A feature nova precisa ampliar o modelo atual para biblioteca consolidada por tenant e VS-ID.
