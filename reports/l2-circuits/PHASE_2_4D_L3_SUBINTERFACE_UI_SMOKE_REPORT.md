# FASE 2.4D — L3 Subinterface UI/API Smoke — Report

**Date:** 2026-05-23  
**Status:** **GO**  
**Branch:** `feature/v0.3.4-operational-pilot-noc`  
**Prereq:** FASE 2.4C GO + rebuild `netops-api` / `netops-web`

---

## Veredito

| Critério | Resultado |
|----------|-----------|
| L3 subif ≠ VLAN órfã | **PASS** |
| Órfã real continua órfã | **PASS** |
| Findings por interface coerentes | **PASS** (ver nota info) |
| Zero SSH / discover | **PASS** |
| `L2_DISCOVER_SSH_ENABLED=false` | **PASS** |

---

## Escopo smoke

- Só GET API + UI `/l2-circuits`
- Sem SSH, discovery, migration, NetBox, alteração em equipamento
- Stack local: API `:8085`, Web `:3005`
- Bundle web: `assets/index-CXQ09vVv.js`

---

## API — `GET /api/l2-circuits`

| Check | Resultado |
|-------|-----------|
| HTTP | **200** |
| Total | **261** (inalterado) |
| POST `/discover` | **0** |
| Logs API (tail) | sem discover/ssh/query fail |

### Amostras obrigatórias

| Interface | classification | VLAN_ORPHAN | Outros findings |
|-----------|----------------|-------------|-----------------|
| Eth-Trunk1.93 | `l3_interface` | **não** | `VLAN_USED_IN_L3_VRF`, `DESCRIPTION_MISSING` |
| Eth-Trunk2.152 | `l3_interface` | **não** | `VLAN_USED_IN_L3_VRF`, `DESCRIPTION_MISSING` |
| Eth-Trunk1.891 | `vlan_orphan` | **sim** | `VLAN_ORPHAN`, `CIRCUIT_DOWN`, `DESCRIPTION_MISSING` |

**Nota findings L3:** spec 2.4D citava só `DESCRIPTION_MISSING` em subifs L3. API também emite `VLAN_USED_IN_L3_VRF` (info) quando `l3_interface` + `outerVlan` — regra em `findings.resolver.ts`. Não bloqueia GO; não é órfã.

---

## UI — `/l2-circuits` (Playwright headless)

Script: `/tmp/l2-smoke-2.4d-fixed.mjs` (match exato de linha; evita `Eth-Trunk1.93` ⊂ `Eth-Trunk1.893`).

| Check | Resultado |
|-------|-----------|
| Login + lista | OK |
| Eth-Trunk1.93 detail | badge **Subif L3** / `l3_interface`; **sem** VLAN Órfã / `VLAN_ORPHAN` |
| Eth-Trunk2.152 detail | idem L3; **sem** órfã |
| Eth-Trunk1.891 detail | badge **VLAN Órfã** + finding `VLAN_ORPHAN` |
| Filtro VLAN `152` | OK |
| Export CSV | OK (click) |
| Atualizar lista | OK |
| Raw evidence na lista | **ausente** (só no detalhe) |
| POST discover | **0** |
| Erros JS/API críticos | **0** |

### Falso negativo script v1

`/tmp/l2-smoke-2.4d.mjs` falhou `.93 no orphan` porque:

1. Filtro VLAN `93` amplia lista
2. `hasText('Eth-Trunk1.93')` casa **Eth-Trunk1.893** (substring)

Re-test com match exato → **PASS**. UI real OK.

---

## Segurança / flags

```
L2_DISCOVER_SSH_ENABLED=false  (container netops-api)
```

- Sem SSH nos logs smoke
- Sem discovery trigger
- DB row count preservado (261)

---

## GO / NO-GO

**GO** — classificação L3 pós-2.4C válida em API e UI; órfã real intacta; smoke sem discover/ssh; flag desligada.

### Follow-up opcional (fora 2.4D)

- Ajustar expectativa doc ou suprimir `VLAN_USED_IN_L3_VRF` em `l3_interface` sem VRF se quiser findings “só DESCRIPTION_MISSING”
- Commitar WIP 2.4/2.4C se ainda pendente no branch

---

## Comandos repro (local)

```bash
# API samples (após login cookie)
curl -s -b cookies.txt http://127.0.0.1:8085/api/l2-circuits | jq '.total, (.circuits[] | select(.localInterface=="Eth-Trunk1.93") | {localInterface, classification, findings: [.findings[].code]})'

# UI smoke
node /tmp/l2-smoke-2.4d-fixed.mjs
```
