# FASE 1.3b — Collector Dot1Q + Preparação Re-smoke Device 1

**Date:** 2026-05-23  
**Scope:** collector only — sem SSH real, sem smoke, flag SSH off  
**Base:** FASE 1.3 parser dot1q/VLAN_LOCAL  
**Device alvo:** `4WNET-BVA-BRT-RX` (`device_id=1`)

---

## Resumo

Collector L2 Huawei agora coleta **`display current-configuration interface`**. Output vai ao parser via chave exata `display current-configuration interface` (já consumida por `huawei-vrp-l2.ts`).

Comando **allowlisted**. Pipeline live dot1q **completo** (collector → parser).  
**Nenhum SSH executado.** `L2_DISCOVER_SSH_ENABLED` permanece **false**.

---

## Arquivos alterados

| Arquivo | Mudança |
|---------|---------|
| `collectors/ssh.collector.ts` | + comando config interface; export `L2_SSH_COMMANDS` |
| `tools/l2-collector-selftest.mjs` | **novo** — valida lista collector + allowlist |

**Sem alteração:** parser, service, docker-compose flag, `.env`.

---

## Comando adicionado ao collector

Lista `L2_SSH_COMMANDS` (ordem de execução SSH):

| # | Comando |
|---|---------|
| 1 | `display mpls l2vc verbose` |
| 2 | `display vsi verbose` |
| 3 | `display interface brief` |
| 4 | `display interface description` |
| 5 | **`display current-configuration interface`** ← **novo** |

Fluxo live (quando flag on):

```
collectL2CircuitsViaSsh()
  → rawOutput["display current-configuration interface"]
  → parseHuaweiL2Circuits(rawOutput)
  → parseVlanLocalCircuits(config, description)
```

---

## Confirmação allowlist

`validateReadonlyCommand("display current-configuration interface")` → **allowed: true**

Allowlist em `netops/huawei-vrp/commands.ts`:

- regex: `/^display current-configuration interface$/i`
- entrada doc: `HUAWEI_VRP_READONLY_COMMANDS` linha 84

Selftest `l2-collector-selftest.mjs` valida **5/5** comandos allowlisted.

---

## L2_DISCOVER_SSH_ENABLED

| Arquivo | Valor |
|---------|-------|
| `docker-compose.yml` | `${L2_DISCOVER_SSH_ENABLED:-false}` |
| `.env.example` | `false` |

**Não alterado nesta fase.** Discover live continua bloqueado em runtime até operador setar `true`.

---

## Testes executados

```bash
cd workspace/artifacts/api-server && pnpm typecheck   # OK
cd workspace/artifacts/api-server && pnpm build     # OK
node tools/l2-collector-selftest.mjs                # OK — 5 cmds allowlisted
node tools/l2-dot1q-parser-selftest.mjs             # OK — 131 vlan_local + 6 L2VC/VSI
```

| Teste | Resultado |
|-------|-----------|
| typecheck | pass |
| build | pass |
| collector allowlist | pass (5 cmds) |
| parser offline device 1 | **131** `vlan_local` |
| regressão L2VC/VSI | **6** circuitos |
| SSH real | **não executado** |

---

## Resultado

Critérios FASE 1.3b **atingidos**:

- [x] collector inclui `display current-configuration interface`
- [x] comando allowlisted
- [x] parser recebe chave correta (wire existente FASE 1.3)
- [x] mantém l2vc verbose + vsi verbose + interface description
- [x] offline 131 VLAN_LOCAL + 6 L2VC/VSI sem regressão
- [x] typecheck/build OK
- [x] zero SSH

---

## GO / NO-GO — FASE 1.4 re-smoke device 1

| Gate | Status |
|------|--------|
| Parser dot1q offline | **GO** (FASE 1.3) |
| Collector config interface | **GO** (FASE 1.3b) |
| Allowlist | **GO** |
| Flag SSH default false | **GO** (seguro até smoke) |
| Smoke executado | **NO** (proposital) |

### Decisão FASE 1.4

## **GO** re-smoke device 1

Pré-requisitos operacionais (fora deste commit):

1. `L2_DISCOVER_SSH_ENABLED=true` no `.env`
2. rebuild/restart `netops-api`
3. `POST /api/l2-circuits/discover` `device_id=1`
4. validar `circuit_count > 0` (expect ~131 vlan_local se output ≈ manual)
5. rollback flag → `false` + rebuild

**Risco conhecido:** `display current-configuration interface` é pesado (~22KB+ no BRT-RX); timeout SSH possível — monitorar job duration.

---

## Pendências pós-smoke

- S6730 / `display mpls l2vc` (sem verbose) — fase futura
- MAC `display mac-address vlan <id>` — fora escopo
- Filtro ruído subifs sem description — opcional

---

## Referências

- `reports/l2-circuits/PHASE_1_3_DOT1Q_PARSER_FIX_REPORT.md`
- `collectors/ssh.collector.ts`
- `tools/l2-collector-selftest.mjs`
- `tools/l2-dot1q-parser-selftest.mjs`
