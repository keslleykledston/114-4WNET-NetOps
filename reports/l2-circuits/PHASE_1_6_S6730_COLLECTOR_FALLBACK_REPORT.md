# FASE 1.6 — Collector Fallback S6730 (Pré-smoke)

**Date:** 2026-05-23  
**Scope:** collector + validações offline — smoke condicionado a device no inventário  
**Refs:** FASE 1.5 parser S6730

---

## Resumo

Collector L2 atualizado com fallback **`display mpls l2vc`** (non-verbose) logo após `verbose`.  
Chave `display mpls l2vc` já consumida por `huawei-vrp-l2.ts` → `parseS6730MplsL2vc()`.

**Allowlist:** 6/6 comandos OK.  
**Regressão:** dot1q 131, NE8000 6, S6730 offline 1+1 — OK.  
**typecheck/build:** OK.

**Smoke live:** executado em **`device_id=2`** (`4WNET-BVA-BRT-RA` = S6730 real `4WNET-BVA-BRT-A_S6730-H48X6C`). Ver `PHASE_1_6_S6730_SMOKE_RESULT.md`.

---

## Arquivos alterados

| Arquivo | Mudança |
|---------|---------|
| `collectors/ssh.collector.ts` | + `display mpls l2vc` (posição 2) |
| `tools/l2-collector-selftest.mjs` | exige `display mpls l2vc` |

---

## Comandos collector (ordem)

| # | Comando | Papel |
|---|---------|-------|
| 1 | `display mpls l2vc verbose` | NE8000 / fallback primário |
| 2 | **`display mpls l2vc`** | **S6730 dialect** |
| 3 | `display vsi verbose` | VSI NE8000 + S6730 |
| 4 | `display interface brief` | contexto (não parseado MVP) |
| 5 | `display interface description` | merge dot1q status |
| 6 | `display current-configuration interface` | dot1q VLAN_LOCAL |

Parser usa **ambos** outputs L2VC quando presentes; dedupe por `vcId`/tipo.

---

## Allowlist

`validateReadonlyCommand("display mpls l2vc")` → **allowed** (`commands.ts` regex `/^display mpls l2vc$/i`).

Selftest `l2-collector-selftest.mjs`: **6 comandos allowlisted**.

---

## Validações executadas

```bash
pnpm typecheck                              # OK
pnpm build                                  # OK
node tools/l2-collector-selftest.mjs        # OK — 6 cmds
node tools/l2-dot1q-parser-selftest.mjs    # OK — 131 + 6
node tools/l2-s6730-parser-selftest.mjs    # OK
```

---

## Pré-check smoke (inventário)

```sql
SELECT id, hostname FROM devices
WHERE hostname ILIKE '%S6730%' OR hostname ILIKE '%BRT-A%';
-- 0 rows
```

Inventário atual:

| id | hostname |
|----|----------|
| 1 | 4WNET-BVA-BRT-RX |
| 2 | 4WNET-BVA-BRT-RA |
| 3 | 4WNET-BVA-CDS-RX |
| 36 | l2-hotfix-no-cred |

**S6730 ausente** — smoke FASE 1.6 **não iniciado** (sem `device_id`, sem IP/credenciais).

`L2_DISCOVER_SSH_ENABLED` permanece **false** (smoke não executado).

---

## GO / NO-GO smoke

| Gate | Status |
|------|--------|
| Collector fallback código | **GO** |
| Parser wire | **GO** |
| Selftests | **GO** |
| S6730 no DB | **NO-GO** |
| Smoke live agora | **NO-GO** |

### Próximo passo operacional

1. Cadastrar `4WNET-BVA-BRT-A_S6730-H48X6C` em `devices` (IP + cred SSH read-only).
2. Reexecutar smoke FASE 1.6 (flag true → discover → rollback).

---

## Referências

- `reports/l2-circuits/PHASE_1_5_S6730_L2VC_PARSER_REPORT.md`
- `collectors/ssh.collector.ts`
- `tools/l2-collector-selftest.mjs`
