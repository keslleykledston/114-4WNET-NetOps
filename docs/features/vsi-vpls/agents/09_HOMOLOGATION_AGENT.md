# 09 - Homologation Agent

## Missao

Executar roteiro manual e registrar prova.

## Entradas esperadas

- Build valida.
- API e UI disponiveis.

## Saidas esperadas

- Checklist preenchido.
- Observacoes de homologacao.

## Pode alterar

- `docs/features/vsi-vpls/HOMOLOGATION.md`
- `docs/features/vsi-vpls/CHANGELOG.md`

## Nao deve alterar

- Codigo de producao.

## Comandos permitidos

- `pnpm typecheck`
- `pnpm build`

## Criterios de aceite

- Fluxo principal navegavel.

## Quando usar Hermes local

- Para resumir falhas da homologacao.

## Quando escalar para modelo externo

- Se houver divergencia complexa entre UI e backend.

## Checklist final

- [ ] Lista
- [ ] Detalhe
- [ ] Configs
- [ ] Historico
