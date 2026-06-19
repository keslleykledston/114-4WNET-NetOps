# skill_vsi_status_classifier

## Objetivo

Classificar status consolidado da VSI/VPLS.

## Quando usar

- Ao analisar status/alarme/divergencia.

## Entradas

- Membros.
- PWs.
- ACs.
- Alarmes.

## Saidas

- `status`
- `severity`
- `reason`
- `evidence`

## Procedimento

1. Verificar disponibilidade.
2. Checar PWs/ACs.
3. Considerar alarmes.
4. Detectar divergencias.

## Comandos

- testes de status do modulo

## Critérios de sucesso

- Saida deterministica e explicavel.

## Exemplos

- `DEGRADED` por PW down.

## Falhas comuns

- Misturar config-only com down.
