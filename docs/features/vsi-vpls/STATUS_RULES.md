# Status Rules

## Saida da classificacao

- `status`
- `severity`
- `reason`
- `evidence[]`

## Regras

- `UP`: membros existem, operacao suficiente, PWs/ACs relevantes UP, sem alarme critico.
- `DEGRADED`: pelo menos um PW/AC/membro down ou divergencia/alarme relevante, mas ainda ha servico parcial.
- `DOWN`: nenhum PW operacional, todos os membros principais down, ou indisponibilidade total.
- `CONFIG_ONLY`: ha config, mas nao ha runtime operacional suficiente.
- `UNKNOWN`: coleta incompleta, parser falhou, device inacessivel ou dados insuficientes.

## Divergencias

- Mesmo VS-ID com nomes diferentes: divergencia provavel.
- Mesmo nome com VS-ID diferente: erro de configuracao provavel.
- VS-ID duplicado com servicos diferentes: conflito grave.
