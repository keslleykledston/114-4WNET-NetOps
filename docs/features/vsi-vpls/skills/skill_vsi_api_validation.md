# skill_vsi_api_validation

## Objetivo

Validar contrato e isolamento da API.

## Quando usar

- Antes de publicar rotas.

## Entradas

- lista
- detalhe
- filtros

## Saidas

- resposta validada
- erro de contrato

## Procedimento

1. Verificar filtros.
2. Conferir tenant isolation.
3. Conferir resposta vazia.

## Comandos

- testes de API do modulo

## Critérios de sucesso

- Contrato sem vazamento cross-tenant.

## Exemplos

- `GET /api/l2/vsi-vpls?vs_id=100`

## Falhas comuns

- filtros ignorados.
