# Checklist — Execução Segura L2 Discovery

**Uso:** marcar **todos** antes de `POST /api/l2-circuits/discover`.  
**Rollback:** checklist pós-execução no final.

---

## Antes de iniciar

| # | Item | OK |
|---|------|----|
| 1 | Janela NOC aprovada | ☐ |
| 2 | **1 device apenas** — sem bulk | ☐ |
| 3 | `L2_DISCOVER_SSH_ENABLED=false` confirmado (estado inicial) | ☐ |
| 4 | API healthy (`GET /api/healthz` → 200) | ☐ |
| 5 | Auth login OK | ☐ |
| 6 | Tabelas `l2_circuits`, `l2_discovery_jobs` existem | ☐ |
| 7 | Device tem `ip_address` preenchido | ☐ |
| 8 | Device tem `password_encrypted` preenchido | ☐ |
| 9 | `vendor=huawei`, `platform=vrp` | ☐ |
| 10 | `POST /api/devices/:id/test-connection` → success | ☐ |
| 11 | Operador leu `RUNBOOK_L2_DISCOVERY.md` | ☐ |
| 12 | Cenário device conhecido (`SUPPORTED_SCENARIOS.md`) | ☐ |

---

## Habilitar discover (temporário)

| # | Item | OK |
|---|------|----|
| 13 | `.env` → `L2_DISCOVER_SSH_ENABLED=true` | ☐ |
| 14 | `docker compose up -d --build api` | ☐ |
| 15 | Container flag = `true` (`docker exec netops-api printenv ...`) | ☐ |

---

## Execução

| # | Item | OK |
|---|------|----|
| 16 | `POST /api/l2-circuits/discover` → **202** | ☐ |
| 17 | `run_id` anotado | ☐ |
| 18 | Poll até `completed` ou `failed` (max ~10 min) | ☐ |
| 19 | Se `failed` — **não** loop infinito; registrar erro | ☐ |
| 20 | `GET /api/l2-circuits?device_id=N` — counts razoáveis | ☐ |

---

## Pós-execução (segurança)

| # | Item | OK |
|---|------|----|
| 21 | Logs API sem password/token/community | ☐ |
| 22 | Nenhum comando fora allowlist (6 display cmds) | ☐ |
| 23 | Device **não** alterado (read-only) | ☐ |

---

## Rollback obrigatório

| # | Item | OK |
|---|------|----|
| 24 | `.env` → `L2_DISCOVER_SSH_ENABLED=false` | ☐ |
| 25 | `L2_DISCOVER_SSH_ENABLED=false docker compose up -d --force-recreate api` | ☐ |
| 26 | Container flag = `false` | ☐ |
| 27 | Health API OK | ☐ |

---

## NO-GO imediato (parar)

- [ ] Descobrir múltiplos devices na mesma janela
- [ ] Flag true permanente sem rollback
- [ ] Device sem credencial / test-connection fail
- [ ] Tentativa de `system-view` ou write manual no device
- [ ] SNMP / NetBox write (fora escopo MVP)

---

## Expectativas por device (referência)

| device_id | Tipo | circuit_count típico |
|-----------|------|----------------------|
| 1 (BRT-RX) | dot1q | ~131 vlan_local |
| 2 (S6730) | L2VC/VSI | ~130 (82 L2VC/VPWS + VSI) |

Desvio grande → investigar antes de repetir.

---

## Referências

- `RUNBOOK_L2_DISCOVERY.md`
- `reports/l2-circuits/MVP_L2_DISCOVERY_CLOSURE_REPORT.md`
