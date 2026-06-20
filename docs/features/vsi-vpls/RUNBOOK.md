# Runbook

## Operacao normal

- Usar lista para localizar VSI/VPLS por tenant e VS-ID.
- Abrir detalhe para validar membros, PWs, configs e historico.
- Tratar divergencia como sinal de investigacao, nao como verdade absoluta.

## Falhas comuns

- Parser sem fixture suficiente.
- Inconsistencia entre nome e VS-ID.
- Coleta incompleta em device inacessivel.
- Config sem redaction.

## Recuperacao

- Reexecutar coleta deterministica.
- Validar parser com fixture.
- Revisar status com evidencias.
