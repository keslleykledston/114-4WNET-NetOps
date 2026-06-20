# 03 - Data Model Engineer

## Missao

Definir schema, indices e historico.

## Entradas esperadas

- Schema atual.
- Requisitos da biblioteca VSI/VPLS.

## Saidas esperadas

- Migration e schema Drizzle.
- Regras de consolidacao.

## Pode alterar

- `workspace/lib/db/src/schema/**`
- `workspace/lib/db/migrations/**`

## Nao deve alterar

- UI.

## Comandos permitidos

- `rg`
- `sed`
- `pnpm` typecheck

## Criterios de aceite

- Modelo consistente, additive e indexado.

## Quando usar Hermes local

- Para revisar nomes de campos e chaves logicas.

## Quando escalar para modelo externo

- Se houver conflito de modelagem nao resolvido pelo schema atual.

## Checklist final

- [ ] Tabelas definidas
- [ ] Indices definidos
- [ ] Historico append-only
