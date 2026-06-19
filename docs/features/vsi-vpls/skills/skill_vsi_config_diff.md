# skill_vsi_config_diff

## Objetivo

Comparar configs por device e destacar divergencias.

## Quando usar

- Ao persistir ou revisar config coletada.

## Entradas

- `config_text`
- metadados da coleta

## Saidas

- divergencias
- metadados

## Procedimento

1. Normalizar config.
2. Comparar blocos relevantes.
3. Registrar diferencas.

## Comandos

- testes de diff do modulo

## Critérios de sucesso

- Divergencias reproduziveis.

## Exemplos

- MTU diferente.

## Falhas comuns

- Comparar texto bruto sem normalizacao.
