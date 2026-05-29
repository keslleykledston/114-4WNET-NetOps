# MVP L2 Circuit Discovery — Closure Report (FASE 1.7)

**Date:** 2026-05-23  
**Status:** **VALIDATED — controlled NOC use GO**  
**Branch ref:** `feature/v0.3.4-operational-pilot-noc`

---

## Resumo executivo

MVP L2 Circuit Discovery **fechado e validado** em dois perfis Huawei:

| Device | NetOps ID | Perfil | Resultado smoke |
|--------|-----------|--------|-----------------|
| `4WNET-BVA-BRT-RX` | **1** | NE/VRP edge — dot1q / VE | **131** `vlan_local` — GO |
| `4WNET-BVA-BRT-A_S6730-H48X6C` | **2** (`4WNET-BVA-BRT-RA`) | S6730 — L2VC/VSI | **130** circuitos (82 L2VC/VPWS + 48 VSI) — GO |

Pipeline: **SSH read-only → collector → parser → normalize → findings → DB → API**.

Flag default **`L2_DISCOVER_SSH_ENABLED=false`**. Uso live exige habilitação temporária + rollback documentado.

---

## Arquitetura final

```
┌─────────────┐     POST /discover      ┌──────────────┐
│  NOC / API  │ ───────────────────────►│ l2circuits   │
│  client     │     202 + run_id        │ controller   │
└─────────────┘                         └──────┬───────┘
                                               │
                    L2_DISCOVER_SSH_ENABLED=true
                                               ▼
                                        ┌──────────────┐
                                        │ SSH collector│
                                        │ (6 cmds RO)  │
                                        └──────┬───────┘
                                               ▼
                                        ┌──────────────┐
                                        │ huawei-vrp-l2│
                                        │ + dot1q      │
                                        │ + s6730      │
                                        └──────┬───────┘
                                               ▼
                                        ┌──────────────┐
                                        │ normalizers  │
                                        │ + findings   │
                                        └──────┬───────┘
                                               ▼
                                        ┌──────────────┐
                                        │ PostgreSQL   │
                                        │ l2_circuits  │
                                        │ l2_discovery │
                                        │ _jobs        │
                                        └──────────────┘
```

**Módulo:** `workspace/artifacts/api-server/src/modules/l2circuits/`

---

## Endpoints

| Method | Path | Descrição |
|--------|------|-----------|
| POST | `/api/l2-circuits/discover` | Inicia job async (`device_id`) → **202** |
| GET | `/api/l2-circuits/discovery-jobs/:runId` | Poll status + counts |
| GET | `/api/l2-circuits` | Lista circuitos (filtros) |
| GET | `/api/l2-circuits/:id` | Detalhe circuito |

Auth obrigatória (login `/api/auth/login`). API host lab: `:8085` (map → container `:8080`).

---

## Comandos allowlist (collector L2)

Executados **somente** se `L2_DISCOVER_SSH_ENABLED=true`:

1. `display mpls l2vc verbose` — NE8000-style L2VC
2. `display mpls l2vc` — S6730-style L2VC
3. `display vsi verbose` — VSI NE8000 + S6730
4. `display interface brief`
5. `display interface description` — merge status dot1q
6. `display current-configuration interface` — dot1q / VE / ve-group

Validação: `validateReadonlyCommand()` em `netops/huawei-vrp/commands.ts`.  
Selftest: `node tools/l2-collector-selftest.mjs`.

---

## Cenários validados

| Cenário | Device | Fase | Veredito |
|---------|--------|------|----------|
| dot1q VLAN_LOCAL | 1 RX | 1.3–1.4 | **GO** |
| VE / ve-group | 1 RX | 1.3–1.4 | **GO** |
| interface description merge | 1 RX | 1.3–1.4 | **GO** |
| S6730 L2VC non-verbose | 2 S6730 | 1.5–1.6 | **GO** |
| S6730 VSI Peer Router ID | 2 S6730 | 1.5–1.6 | **GO** |
| REMOTE_NOT_FORWARDING | 2 VC 15 | 1.5–1.6 | **GO** |
| NE8000 fixtures (offline) | — | 1.3–1.5 | **GO** (6 circuitos) |

Detalhe: `docs/l2-circuits/SUPPORTED_SCENARIOS.md`.

---

## Resultados device 1 (BRT-RX)

| Campo | Valor |
|-------|-------|
| `device_id` | 1 |
| `run_id` | `disc-l2-1-1779575076582` |
| Job | completed ~5,4s |
| `circuit_count` | **131** |
| Tipos | 100% `vlan_local` |
| Findings (job) | 72 |
| L2VC/VSI | 0 (esperado — L2VC no switch downstream) |

---

## Resultados device 2 (S6730 / BRT-RA)

| Campo | Valor |
|-------|-------|
| `device_id` | 2 |
| Hostname NetOps | `4WNET-BVA-BRT-RA` |
| Hostname real | `4WNET-BVA-BRT-A_S6730-H48X6C` |
| `run_id` | `disc-l2-2-1779576876490` |
| Job | completed ~16s |
| `circuit_count` | **130** |
| L2VC + VPWS | **82** (63 UP / 19 DOWN) |
| VSI | **48** |
| VC 15 | Vlanif15 → 10.200.5.1, DOWN, CIRCUIT_DOWN + REMOTE_NOT_FORWARDING |
| SERVICOS_CDS | vsi_id 601, peer 10.200.4.1, UP |

---

## Findings suportados

| Code | Severity | Condição resumida |
|------|----------|-------------------|
| `CIRCUIT_DOWN` | error | `oper_status == DOWN` |
| `REMOTE_NOT_FORWARDING` | warning | L2VC/VPWS remote PW not forwarding |
| `INCOMPLETE_L2_CONFIG` | error | L2VC sem vc_id, VSI sem nome, L2VC sem peer |
| `DUPLICATED_VC_ID` | error | vc_id duplicado no mesmo run |
| `VLAN_CONFLICT` | warning | par outer+inner vlan duplicado |
| `DESCRIPTION_MISSING` | info | sem description (**exceto** l2vc/vpws/vsi/vpls) |

---

## Limitações conhecidas

- **MAC** por VLAN/VSI — não integrado dinamicamente (comando exige parâmetro)
- **SNMP** — não implementado
- **NetBox sync** — não implementado (read-only NetBox fora escopo L2)
- **Bulk discovery** — não validado (1 device por job)
- **Renomear device 2** — cosmético (`BRT-RA` vs hostname CLI S6730)
- **attachFindings substring** — `L2VC-15` pode herdar finding de `L2VC-1548` (backlog)
- **remoteForwardingState** — parser-only; não coluna DB dedicada
- **Huawei only** — outros vendors fora escopo

---

## Riscos

| Risco | Mitigação |
|-------|-----------|
| SSH write acidental | Allowlist + blocked tokens |
| Credencial em log | redact-l2-output + grep logs pós-run |
| Timeout config interface | SSH 300s/cmd, 10min session; falha = job failed controlado |
| Flag SSH esquecida true | Runbook rollback obrigatório; default false |
| Env shell override docker | `L2_DISCOVER_SSH_ENABLED=false docker compose ...` no rollback |
| Carga device | 1 device/job; janela NOC |

---

## Rollback (padrão operacional)

1. `.env` → `L2_DISCOVER_SSH_ENABLED=false`
2. `L2_DISCOVER_SSH_ENABLED=false docker compose up -d --force-recreate api`
3. Confirmar: `docker exec netops-api printenv L2_DISCOVER_SSH_ENABLED` → `false`
4. `curl :8085/api/healthz` → ok

---

## Critérios GO/NO-GO (uso NOC)

### GO — executar discover em device piloto

- [ ] Janela NOC aprovada
- [ ] Device com IP + cred + vendor huawei/vrp
- [ ] `test-connection` OK
- [ ] Flag true + rebuild api
- [ ] **1 device** por execução
- [ ] Rollback planejado
- [ ] Operador leu `SAFE_EXECUTION_CHECKLIST.md`

### NO-GO

- Flag false sem intenção de habilitar
- Device sem credencial
- Bulk multi-device
- Comandos fora allowlist
- Alteração config no device

---

## Próximas fases recomendadas

| Fase | Escopo | Prioridade |
|------|--------|------------|
| 2.0 | Renomear device 2 + alias hostname CLI | baixa |
| 2.1 | Fix attachFindings (match exato vc_id/name) | média |
| 2.2 | Fixture completa 82 blocos S6730 offline | média |
| 2.3 | MAC `display mac-address vlan <id>` opt-in | baixa |
| 2.4 | Bulk discovery / fila jobs | baixa |
| 2.5 | SNMP read-only fallback | futura |
| 2.6 | NetBox export (read/sync) | futura |

---

## Documentação entregue (FASE 1.7)

| Documento | Path |
|-----------|------|
| MVP (atualizado) | `docs/l2-circuits/MVP.md` |
| Runbook | `docs/l2-circuits/RUNBOOK_L2_DISCOVERY.md` |
| Checklist seguro | `docs/l2-circuits/SAFE_EXECUTION_CHECKLIST.md` |
| Matriz cenários | `docs/l2-circuits/SUPPORTED_SCENARIOS.md` |
| Closure (este) | `reports/l2-circuits/MVP_L2_DISCOVERY_CLOSURE_REPORT.md` |

---

## Referências de validação

| Fase | Relatório |
|------|-----------|
| 1.4 | `PHASE_1_4_DEVICE1_RESMOKE_RESULT.md` |
| 1.6 | `PHASE_1_6_S6730_SMOKE_RESULT.md` |
| 1.5 | `PHASE_1_5_S6730_L2VC_PARSER_REPORT.md` |
| 1.3 | `PHASE_1_3_DOT1Q_PARSER_FIX_REPORT.md` |

---

## Veredito final

## **GO — MVP L2 encerrado para uso controlado NOC**

Parser + collector + API + DB validados em **device 1 (dot1q)** e **device 2 (S6730 L2VC/VSI)**.  
SSH discovery **desligado por default** até operador seguir runbook.
