# PHASE H3.2A-retry — SNMP BGP Preflight Result

**Date:** 2026-05-27
**Base:** `320555f` (`feat(operational): add SNMP credential resolver`)
**Pilot:** `device_id=1` — `4WNET-BVA-BRT-RX` @ `45.169.161.255`
**Status:** **GO**

---

## 1) Objetivo

Repetir H3.2A após NOC configurar `snmp_community` no device 1. Somente preflight SNMP:

| OID | Nome |
|-----|------|
| `1.3.6.1.2.1.1.1.0` | sysDescr.0 |
| `1.3.6.1.2.1.15.1.1.0` | bgpVersion.0 |

Sem peer walk, sem IF-MIB, sem SSH, sem discovery, sem alteração no NE.

---

## 2) Pré-check

| Check | Resultado |
|-------|-----------|
| HEAD | `320555f` |
| device_id | `1` |
| `snmp_community` no DB | **yes** (length **9**, valor **nunca** impresso) |
| `resolveSnmpCredential` | `available=true`, `length=9`, `source=device` |
| `describeSnmpCredentialResolution` | sem campo `value` |
| `GET /api/healthz` | **200** `{"status":"ok"}` |

---

## 3) Flags temporárias (janela de teste)

| Flag | Valor |
|------|-------|
| `SNMP_POLL_ENABLED` | `false` |
| `NETOPS_SNMP_BGP_REAL_ENABLED` | `true` |
| `BGP_DRILLDOWN_SSH_DETAIL_ENABLED` | `false` |

Override: `.h3.2a-compose.override.yml` + `docker compose up -d api --force-recreate`.

---

## 4) Execução SNMP (container `netops-api`)

Ferramenta: `tools/snmp-bgp-preflight-retry-diag.mjs` (copiada para `/tmp/`, sem community no stdout).

| Teste | OID | Status | elapsedMs | Notas |
|-------|-----|--------|-----------|-------|
| sysDescr.0 | `1.3.6.1.2.1.1.1.0` | **ok** | 209 | preview Huawei VRP 8.230 (truncado) |
| bgpVersion.0 | `1.3.6.1.2.1.15.1.1.0` | **ok** | 11 | GET OK; valor vazio/null no preview (sem falha SNMP) |

**Veredito preflight:** **GO** — H3.2B RFC4273 desbloqueado para piloto (rede + credencial OK nesta janela).

sysDescr falhou → não aplicável (não entrou em loop bgpVersion após fail).

---

## 5) Não persistência

| Tabela | Count |
|--------|-------|
| `operational_bgp_collection_jobs` | 0 |
| `operational_bgp_peers` | 0 |

Nenhum `POST /api/operational/bgp/collect` com gate true durante preflight (somente GET SNMP direto).

---

## 6) Rollback

1. `docker compose -f docker-compose.yml up -d api --force-recreate` (sem override H3.2A).
2. `NETOPS_SNMP_BGP_REAL_ENABLED` efetivo **false** (unset no container).
3. `POST /api/operational/bgp/collect` `{ "device_id": 1 }` → **503** `SNMP_FAST_BGP_DISABLED`.

---

## 7) Segurança

| Check | Resultado |
|-------|-----------|
| community em stdout/logs | **não** |
| `value` no describe resolver | **não** |
| SSH | **não** |
| discovery | **não** |
| BGP peer walk | **não** |
| IF-MIB | **não** |
| poller legado | disabled (`SNMP_POLL_ENABLED=false`) |

---

## 8) GO / NO-GO

### GO

- [x] credencial resolvida sem expor segredo
- [x] sysDescr OK
- [x] bgpVersion OK
- [x] zero SSH
- [x] zero discovery
- [x] rollback OK

### Próximo

- **H3.2B:** implementar `runBgpPreflightLive` + walk RFC4273 real com gate e rollback documentado
- Manter piloto `device_id=1` apenas; sem bulk

---

## 9) Contraste H3.2A original

| Fase | sysDescr | bgpVersion | Motivo |
|------|----------|------------|--------|
| H3.2A (primeira) | não executado | não executado | `snmp_community` MISSING |
| H3.2A-retry | **ok** | **ok** | credencial no DB + rede OK |
