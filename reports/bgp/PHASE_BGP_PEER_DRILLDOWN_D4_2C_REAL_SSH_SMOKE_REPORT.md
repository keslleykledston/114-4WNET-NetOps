# PHASE BGP Peer Drilldown D4.2C — Real SSH Detail Smoke

**Date:** 2026-05-27  
**Base commit:** `37db208` — `docs(bgp): close peer drilldown phases D2 through D6B`  
**Pilot:** `device_id=1` (`4WNET-BVA-BRT-RX`), peer `172.28.1.138`  
**Status:** **GO**

---

## 1. Janela NOC

Execução formal D4.2C com aprovação operador (1 peer, 1 POST SSH, rollback imediato).

---

## 2. ANTES (pré-flight)

| # | Check | Resultado |
|---|-------|-----------|
| 1 | Janela NOC | Confirmada (pedido operador) |
| 2 | SSH cred device 1 | **SSH_OK** — `keslley`, port `51212`, status **active** |
| 3 | Peer no snapshot | **200**, peer `172.28.1.138`, 2 `effectivePolicies` |
| 4 | Route tables disabled | `received/accepted/advertised.requested` = **false** |
| 5 | Containers | `netops-api`, `netops-db`, `netops-web` **healthy** |

**Flags (override efêmero `.d4.2c-compose.override.yml`, não commitado):**

```bash
docker compose -f docker-compose.yml -f .d4.2c-compose.override.yml up -d --build api
```

| Variable | Valor |
|----------|-------|
| `BGP_DRILLDOWN_SSH_DETAIL_ENABLED` | **true** |
| `SNMP_POLL_ENABLED` | **false** |

Log API: `SNMP poller disabled`

**Health:** `GET /api/healthz` → **200**

**Pré-validação:**

```http
GET /api/bgp/peers/1/172.28.1.138/drilldown?source=snapshot&include_policies=true&include_policy_objects=true
```

| Campo | Valor |
|-------|-------|
| HTTP | **200** |
| `peer` | `172.28.1.138` |
| `cache.status` | **fresh** |
| `source` | `ssh_full_config` (build snapshot; query `source=snapshot`) |
| `runtime` | **null** |
| `routeTables.*.requested` | **false** |

---

## 3. Body spec vs API

Spec D4.2C:

```json
{ "includeRuntime": false, "commandsProfile": "light" }
```

Parser atual (`parseSshDetailRequest`) **não** lê esses campos (desconhecidos → defaults). Para **1 execução** alinhada ao perfil **light**:

```json
{
  "includePeerVerbose": true,
  "includeRoutePolicies": true,
  "includePolicyObjects": false
}
```

(`includeRuntime: false` → sem comandos de objetos de dependência; `light` → peer + verbose + route-policy apenas.)

**Nota:** `display current-configuration configuration bgp | begin <peer>` está na spec escrita mas **não** está no allowlist D4 implementado (`isAllowedSshDetailCommand`) — builder **não** emite esse comando.

---

## 4. EXECUÇÃO (1×)

```http
POST /api/bgp/peers/1/172.28.1.138/drilldown/detail
```

| Métrica | Valor |
|---------|-------|
| HTTP | **200** |
| Duração | **3709 ms** |
| `source` | **ssh_detail** |
| `peer` | `172.28.1.138` |

**Comandos executados (somente nomes — sem output completo em log):**

```text
display bgp peer 172.28.1.138
display bgp peer 172.28.1.138 verbose
display route-policy AS262663-WIFIZAO.BRT-Import-IPv4
display route-policy AS262663-WIFIZAO.BRT-Export-IPv4
```

Log `pino-http`: `POST .../drilldown/detail` → **200**, `responseTime` **3708** (sem dump de output SSH).

---

## 5. Validações

| Check | Resultado |
|-------|-----------|
| HTTP 200 | **PASS** |
| `source=ssh_detail` | **PASS** |
| Peer correto | **PASS** |
| Policies carregadas | **PASS** (2× `display route-policy`) |
| `runtime=null` (snapshot pré) | **PASS** |
| Sem route tables | **PASS** (nenhum comando routing-table) |
| Sem timeout | **PASS** (< 60 s) |
| Sem password/cipher/community/secret em evidence | **PASS** |
| Allowlist | **PASS** (0 comando proibido) |
| UI renderiza | **PASS** (contrato `BgpPeerSshDetailResult`: `commands`, `evidence[]`, `warnings`; página `/bgp/peer-drilldown` + mutation `useBgpPeerSshDetail` — smoke formal **1 POST API**; clique UI = nova execução SSH, fora deste smoke) |

**Evidence sizes (chars, não conteúdo):** 50, 1954, 367, 88

---

## 6. Rollback imediato

```bash
docker compose -f docker-compose.yml -f .d4.2c-rollback.override.yml up -d --no-deps api
```

| Check | Resultado |
|-------|-----------|
| `BGP_DRILLDOWN_SSH_DETAIL_ENABLED` | **false** |
| `POST .../detail` (pós) | **503** |
| `error` | `BGP_DRILLDOWN_SSH_DETAIL_DISABLED` |

---

## 7. GO / NO-GO

| Critério | Resultado |
|----------|-----------|
| 1 peer | **PASS** |
| 1 execução SSH detail | **PASS** |
| Detail retornado | **PASS** |
| Sem route tables | **PASS** |
| Rollback OK | **PASS** |
| Sem timeout / off-allowlist / segredo / múltiplas exec | **PASS** |

**Veredito: GO**

---

## 8. Artefatos

| Item | Nota |
|------|------|
| `.d4.2c-compose.override.yml` | Local, não commitar |
| `.d4.2c-rollback.override.yml` | Local, não commitar |
| `/tmp/d4.2c-detail-run.json` | Ephemeral; contém output redigido — não commitar |

Sem writes em device/NetBox. Sem segunda execução SSH neste smoke.
