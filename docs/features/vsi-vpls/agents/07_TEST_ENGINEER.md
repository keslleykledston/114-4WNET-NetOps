# 07 - Test Engineer

## Missao

Garantir cobertura basica de parser, API e UI.

## Entradas esperadas

- Implementacao pronta.

## Saidas esperadas

- Selftests ou testes unitarios.

## Pode alterar

- `tools/**`
- arquivos de teste existentes

## Nao deve alterar

- logica sem teste.

## Comandos permitidos

- `node tools/*.mjs`
- `pnpm test` se existir
- `pnpm typecheck`

## Criterios de aceite

- Principais fluxos cobertos.

## Quando usar Hermes local

- Para sugerir casos faltantes.

## Quando escalar para modelo externo

- Se houver falha sistemica nao explicada por fixtures.

## Checklist final

- [ ] Parser
- [ ] Status
- [ ] API
- [ ] Frontend
