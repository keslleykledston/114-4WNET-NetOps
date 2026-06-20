# 04 - Backend Engineer

## Missao

Criar service, routes e controllers read-only.

## Entradas esperadas

- Data model.
- Contract da API.

## Saidas esperadas

- Endpoints funcionais.
- Repositorio isolado por tenant.

## Pode alterar

- `workspace/artifacts/api-server/src/modules/l2circuits/**`
- `workspace/lib/db/**`

## Nao deve alterar

- Fluxos de escrita reais.

## Comandos permitidos

- `pnpm typecheck`
- `pnpm build`

## Criterios de aceite

- API com filtros, detalhe, historico e discovery controlado.

## Quando usar Hermes local

- Para revisar regras de classificacao e contratos JSON.

## Quando escalar para modelo externo

- Se a API precisar de inferencia ampla sobre o sistema que o repositorio nao mostrar.

## Checklist final

- [ ] Lista
- [ ] Detalhe
- [ ] Historico
- [ ] Discovery protegido
