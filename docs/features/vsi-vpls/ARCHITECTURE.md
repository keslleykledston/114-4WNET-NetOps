# Architecture

## Visao

Novo submodulo de `L2 Circuits` com quatro camadas:

1. Ingestao e parser Huawei.
2. Persistencia em Postgres/Drizzle.
3. API read-only de lista/detalhe/historico.
4. UI de biblioteca consolidada.

## Principios

- Read-only por padrao.
- Consolidacao por `tenant_id + vs_id`.
- Historico append-only.
- Evidence-first: config e dados brutos persistidos.
- Status deterministico com justificativa.

## Integracao

- Reaproveitar auth, routes, layout, query client e padroes de tabela.
- Reaproveitar schema/orm existente.
- Reaproveitar parser Huawei como base.
- Reaproveitar `discovery_snapshots` e `collected_configs` quando a evidencia ja existir nesses fluxos, evitando duplicacao de config/historico.
- Persistencia dedicada fica em `workspace/lib/db/src/schema/vsi_vpls.ts` para consolidacao, membros, configs e historico especificos.

## Fluxo

`fixture/parser` -> `persistencia` -> `API` -> `UI` -> `historico/diagnostico`

## Riscos

- Colisao de nomes entre VSI e VPLS.
- Duplicidade por device vs consolidacao por tenant.
- Campos incompletos de operacao.
