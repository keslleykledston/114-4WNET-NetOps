# PHASE H3.2A — SNMP BGP Prefight Runtime Smoke

**Date:** 2026-05-27  
**Base context:** `f7f8461` (`H3.1B` runtime smoke report)  
**Status:** **NO-GO** (preflight real bloqueado por pré-requisito)

---

## 1) Objetivo

Validar conectividade SNMP mínima para liberar H3.2B (coleta real), usando **somente**:

- `sysDescr.0`
- `bgpVersion.0`

Sem coletar peers, sem BGP walk, sem persistência.

---

## 2) Regras aplicadas

- Sem SNMP walk de peers (`bgpPeerTable`)  
- Sem IF-MIB  
- Sem SSH  
- Sem discovery  
- Sem alteração de dispositivo/NetBox  
- Sem persistir peers/jobs

---

## 3) Pré-condição de runtime (API)

Flags aplicadas no runtime:

| Flag | Valor |
|------|-------|
| `SNMP_POLL_ENABLED` | `false` |
| `NETOPS_SNMP_BGP_REAL_ENABLED` | `true` |
| `BGP_DRILLDOWN_SSH_DETAIL_ENABLED` | `false` |

Health:

```http
GET /api/healthz -> 200
```

---

## 4) Resultado do pré-check de credencial

Consulta do `device_id=1`:

| Campo | Valor |
|------|-------|
| hostname | `4WNET-BVA-BRT-RX` |
| ip | `45.169.161.255` |
| `snmp_community` | **MISSING** |

Sem community/profile disponível no DB, o preflight SNMP real (sysDescr/bgpVersion) fica bloqueado por segurança operacional (não injetar segredo manual em smoke controlado).

---

## 5) Execução H3.2A (runtime smoke)

### O que foi executado

1. API subida com flags de H3.2A.
2. `GET /api/healthz` validado.
3. Verificação de pré-requisito SNMP profile do device.

### O que **não** foi executado

- `snmpget` real de `sysDescr.0` / `bgpVersion.0` (bloqueado por `snmp_community` ausente no device).
- qualquer BGP walk.
- qualquer persistência de peers/jobs.

---

## 6) Evidência de não persistência

Estado das tabelas BGP operacionais manteve sem dados:

- `operational_bgp_collection_jobs`: `0`
- `operational_bgp_peers`: `0`

---

## 7) Logs e segurança

Checklist de segurança mantido:

- zero SSH
- zero discovery
- zero BGP walk
- zero exposição de community/password/token
- poller legado mantido disabled (`SNMP_POLL_ENABLED=false`)

Formato de log esperado para H3.2A mantido no plano:

- `device`, `ip`, `elapsed`, `code`

---

## 8) GO/NO-GO

### Critério esperado para GO

- `sysDescr.0` responde
- `bgpVersion.0` responde

### Resultado real H3.2A

- `sysDescr.0`: **não executado** (profile SNMP ausente)
- `bgpVersion.0`: **não executado** (profile SNMP ausente)

**Veredito: NO-GO**

Motivo operacional: ausência de `snmp_community`/profile no `device_id=1`, impedindo preflight real seguro.

---

## 9) Ação requerida (NOC)

Abrir ticket NOC para liberar próxima tentativa:

1. Confirmar profile/community SNMP read-only do `device_id=1` no inventário.
2. Confirmar ACL para source IP real do poller/origem de coleta.
3. Validar UDP/161 e retorno para:
   - `1.3.6.1.2.1.1.1.0` (`sysDescr.0`)
   - `1.3.6.1.2.1.15.1.1.0` (`bgpVersion.0`)

Somente após isso: repetir H3.2A; se GO, liberar H3.2B coleta real.

