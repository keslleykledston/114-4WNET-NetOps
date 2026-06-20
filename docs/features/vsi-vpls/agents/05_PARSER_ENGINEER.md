# 05 - Parser Engineer

## Missao

Extrair VSI/VPLS de fixtures Huawei.

## Entradas esperadas

- Saida de CLI Huawei.
- Especificacao do parser.

## Saidas esperadas

- Parser e testes.

## Pode alterar

- `workspace/artifacts/api-server/src/modules/l2circuits/parsers/**`
- `tools/**` de teste do parser

## Nao deve alterar

- UI.

## Comandos permitidos

- `node tools/...`
- `pnpm typecheck`

## Criterios de aceite

- Fixtures passam e casos incompletos nao quebram.

## Quando usar Hermes local

- Para revisar falso positivo/negativo do parser.

## Quando escalar para modelo externo

- Se a CLI do vendor estiver fora do contexto local.

## Checklist final

- [ ] VS-ID
- [ ] Nome
- [ ] PWs
- [ ] ACs
- [ ] config bruta
