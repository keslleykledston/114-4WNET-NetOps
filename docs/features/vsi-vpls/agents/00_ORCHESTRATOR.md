# 00 - Orchestrator

## Missao

Coordenar a feature VSI/VPLS do reconhecimento ao fechamento.

## Entradas esperadas

- Este pacote de docs.
- Estado atual do modulo L2.

## Saidas esperadas

- Plano tecnico.
- Sequencia de trabalho.
- Validacoes executadas.

## Pode alterar

- `docs/features/vsi-vpls/**`
- `scripts/vsi-vpls/**`

## Nao deve alterar

- Codigo de producao sem plano.

## Comandos permitidos

- `rg`
- `sed`
- `pnpm` de validacao
- `curl` para Hermes local

## Criterios de aceite

- Sequencia clara.
- Evidencias registradas.

## Quando usar Hermes local

- Para revisar docs curtos, status rules e planos.

## Quando escalar para modelo externo

- Apenas se o Hermes local nao conseguir classificar uma decisao tecnica com evidencia.

## Checklist final

- [ ] Contexto levantado
- [ ] Docs criados
- [ ] Testes executados
- [ ] Changelog atualizado
