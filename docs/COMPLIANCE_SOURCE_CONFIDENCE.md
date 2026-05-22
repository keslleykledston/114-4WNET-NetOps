# Compliance Source/Confidence

Regra v0.2.4:

| Source | Confidence | Uso |
|---|---|---|
| `ssh_live` | high | dado de coleta SSH live/discovery |
| `ssh_running_config` | high | running-config parseada |
| `snmp_snapshot` | medium | dado SNMP ou fallback |
| `cached_config` | medium | config cache recente |
| `local_db` | low | dado local antigo/manual |
| `netbox_readonly` | low | inventário externo read-only |
| `unknown` | unknown | sem evidência |

Finding crítico com confidence `low` ou `unknown` não vira falha crítica sem evidência forte. Engine rebaixa severidade forte para `warning`.

Sem snapshot:
- compliance gera `unknown`/`warning`;
- não falha silencioso;
- recomenda executar discovery.

Segurança:
- evidence sanitizada;
- sem password/token/SNMP community;
- compliance não abre SSH direto;
- não aplica config.
