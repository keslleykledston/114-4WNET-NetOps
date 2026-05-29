# PHASE H3.2A.1 — SNMP Credential Resolution (device_id=1)

**Date:** 2026-05-27  
**Status:** **NO-GO diagnóstico** (sem rede)

---

## 1) Entrada

- `device_id`: **1**
- `hostname`: **4WNET-BVA-BRT-RX**
- **source tested:** `devices.snmp_community` (campo usado pelo backend SNMP read-only e pelo gate de coleta SNMP_FAST/BGP)

---

## 2) Resultado por camada (FOUND / EMPTY / DISABLED / NOT_CONFIGURED / UNKNOWN)

### 2.1 Cadeia pretendida (do pedido)

| Camada | Como seria | Resultado |
|--------|-------------|-----------|
| 1. `device.snmp_community` | campo direto do device | **EMPTY** |
| 2. `device.credentials` | tabela/camadas extras de credencial | **NOT_CONFIGURED** (não existe mapeamento separado; SNMP usa só `devices.snmp_community`) |
| 3. Tenant defaults | herança por tenant | **DISABLED** (sem implementação no backend para community) |
| 4. Credential profile | profile/shaper de credenciais | **DISABLED** (sem tabela/camadas usadas para SNMP community) |
| 5. Env fallback | fallback via env | **NOT_CONFIGURED** (não há fallback de community por env no fluxo SNMP_FAST/BGP) |
| 6. Legacy snapshot | snapshot legado → extrair community | **NOT_CONFIGURED** (snapshots guardam dados coletados, não community) |

### 2.2 Evidência (DB read-only)

- `devices.snmp_community` (device_id=1): **NULL/empty**
- `credentialLength`: **0**

DB query (tamanho):

```text
COALESCE(length(trim(snmp_community)),0) = 0
```

---

## 3) Campos esperados do relatório (sem expor segredo)

| Campo | Valor |
|-------|-------|
| `device_id=1` | OK |
| `hostname` | 4WNET-BVA-BRT-RX |
| `credentialSource` | `devices.snmp_community` |
| `credentialAvailable` | **false** |
| `credentialLength` | **0** |
| redaction confirmada | **OK** (nenhum segredo/valor foi exposto) |

---

## 4) Diagnóstico (no modelo pedido)

- não existe: **SIM** (`snmp_community` está vazio)
- não carrega: **SIM** (backend só usa `device.snmpCommunity?.trim()`)
- não mapeia: **NÃO existe mapeamento** adicional de credenciais para community (NOT_CONFIGURED)
- não exporta: **N/A** (não há valor para exportar)
- bloqueado por gate: **NÃO** (o gate foi pensado para SNMP/BGP real, mas o bloqueio real aqui é ausência de community no device)

---

## 5) Critério GO / NO-GO

### GO
- [x] origem identificada (campo `devices.snmp_community` vazio)
- [x] sem expor valor (redaction OK)
- [x] sem persistência
- [x] sem rede (somente leitura DB + leitura de código)

### NO-GO
- [x] não precisa inserir segredo manual em runtime smoke
- [x] não precisa editar DB agora (diagnóstico só)
- [x] não precisa executar SNMP/SSH/discovery

---

## 6) Resultado esperado (para próximo passo)

Como o resultado é **EMPTY**:
- **abrir ticket NOC / credencial**

Ticket NOC deve exigir:
- community SNMP read-only provisionada para `device_id=1`
- ACL/UDP/161 + source IP corretos para retorno SNMP

Após isso:
- repetir H3.2A (sysDescr.0 + bgpVersion.0)
- se GO, liberar H3.2B (coleta real peers)

