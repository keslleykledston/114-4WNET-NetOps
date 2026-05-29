# H3 — SNMP_FAST BGP Peers (operational)

**Status:** plano (sem implementação até GO checklist)  
**Depende:** H1 (`HYBRID_COLLECTION_ARCHITECTURE.md`, `COLLECTION_DATA_CONTRACT.md`, `SAFE_COLLECTION_CHECKLIST.md`), lições H2 (`H2_SNMP_FAST_INTERFACES_PLAN.md`, preflight H2.1E)

---

## Objetivo

Coletar **estado operacional BGP** (peers, FSM, contadores leves) via **SNMP read-only rápido** — fonte **`SNMP_FAST`**, destino **`operational_bgp_peers`**.

**Não** nesta fase:

| Proibido | Motivo |
|----------|--------|
| Configuração (running-config, route-policy, community, prefix-list) | Camada SSH / parse — fora SNMP_FAST |
| SSH | H3 = SNMP only |
| Compliance / policy audit | Outro produto |
| Alterar discovery atual | Sem mudar orchestrator BGP SSH existente |
| Drilldown peer (D2–D6) | UI H3 = cards agregados apenas |
| Cache cego sem freshness | Todo GET expõe `freshness` + `collected_at` |

---

## Piloto (fase inicial)

| Campo | Valor sugerido |
|-------|----------------|
| `device_id` | `1` (confirmar hostname/IP no DB) |
| Allowlist | `SNMP_FAST_BGP_PILOT_DEVICE_IDS=1` (espelho H2) |
| Concorrência | 1 device por POST; sem bulk multi-device |

---

## Arquitetura

```text
[devices.snmpCommunity] + NETOPS_SNMP_REAL_ENABLED
        │
        ▼
  preflight: sysDescr.0 + bgpVersion.0
        │
        ▼
  walk BGP peer table(s) — RFC4273 → V2 → Huawei fallback
        │
        ▼
  map → operational_bgp_peers (+ job row)
        │
        ▼
  GET /api/operational/bgp* (freshness no read)
```

**Fonte persistida:** `source = 'snmp'` (contrato `CollectionSource.snmp`, scope futuro `snmp_fast` + subscope `bgp_peers` no job).

**Independência:** jobs/tabelas **BGP** separadas de `operational_interfaces` / `operational_collection_jobs` (interfaces) — evita acoplamento e migração arriscada em H2 estável.

---

## Modelo de dados (`operational_bgp_peers`)

Uma linha = **um peer** observado numa coleta (append-only recomendado; GET “latest” por `(device_id, peer_ip, vrf?)`).

| Campo | Tipo | Origem SNMP / regra |
|-------|------|---------------------|
| `id` | serial PK | — |
| `device_id` | int FK `devices` | request |
| `collection_job_id` | int FK `operational_bgp_collection_jobs` | job atual |
| `peer_ip` | inet / text | remote addr (IPv4 texto; IPv6 ver riscos) |
| `peer_as` | bigint | `bgpPeerRemoteAs` |
| `peer_type` | text | `ebgp` \| `ibgp` \| `unknown` — comparar `peer_as` vs `bgpLocalAs` |
| `vrf` | text nullable | VRF MIB / Huawei; `null` = default/global |
| `afi` | text | default `ipv4` piloto; `ipv6` quando OID V2/Huawei |
| `safi` | text | default `unicast`; extensível |
| `admin_status` | text | enum SNMP → `up` \| `down` \| `unknown` |
| `oper_status` | text | derivado FSM: `up` se established, senão `down` |
| `fsm_state` | text | idle \| connect \| active \| opensent \| openconfirm \| established \| unknown |
| `uptime` | bigint nullable | segundos ou timeticks normalizados |
| `received_prefixes` | int nullable | contador se OID existir; senão `null` |
| `accepted_prefixes` | int nullable | idem |
| `advertised_prefixes` | int nullable | idem |
| `last_change` | timestamptz nullable | se OID uptime/transition disponível |
| `collected_at` | timestamptz | fim da coleta peer-set |
| `freshness_status` | text | `fresh` \| `stale` \| `expired` \| `unknown` |
| `freshness_expires_at` | timestamptz nullable | materializado no insert (opcional) |
| `source` | text | sempre `snmp` |
| `snapshot_row_hash` | text nullable | dedup opcional |

**Unique sugerido (append):** `(device_id, peer_ip, vrf, afi, safi, collected_at)`  
**Latest query:** `DISTINCT ON (device_id, peer_ip, vrf, afi, safi) ORDER BY collected_at DESC`

---

## Tabela `operational_bgp_collection_jobs`

```text
id serial PK
device_id int FK devices
layer text not null default 'snmp_fast'
scope text not null default 'bgp_peers'
status text not null   -- pending | running | succeeded | partial | failed
started_at timestamptz
completed_at timestamptz nullable
peer_count int nullable
error_code text nullable      -- SNMP_* sem community
error_summary text nullable   -- mensagem curta; sem segredo
created_by text               -- user:N ou scheduler
```

Sem armazenar varbind bruto nem walk dump.

---

## Coletores alvo (ordem)

| Prioridade | MIB | Uso |
|------------|-----|-----|
| 1 | **RFC4273 BGP4-MIB** | baseline IPv4 peers |
| 2 | **BGP4-V2-MIB** (se agente expõe) | InetAddressType, IPv6 peers |
| 3 | **Huawei BGP MIB** (fallback) | VRF, prefix counters, gaps VRP |

**Regra:** parar na primeira tabela que retornar ≥1 peer válido; registrar `collector_used` no job (`rfc4273` \| `bgp4v2` \| `huawei`).

---

## OIDs prioritários

### Preflight (antes de walk peer table)

| OID | Nome | Função |
|-----|------|--------|
| `1.3.6.1.2.1.1.1.0` | sysDescr.0 | agente vivo (reuso H2.1E) |
| `1.3.6.1.2.1.15.1.1.0` | bgpVersion.0 | BGP stack presente (RFC4273 `{ bgp 1 }`) |

Se `bgpVersion` timeout/unavailable → fail **`SNMP_BGP_UNAVAILABLE`** (não gastar walk grande).

### RFC4273 BGP4-MIB — escalares

| OID | Campo local |
|-----|-------------|
| `1.3.6.1.2.1.15.1.4.0` | `bgpLocalAs.0` (local AS para peer_type) |
| `1.3.6.1.2.1.15.1.1.0` | `bgpVersion.0` (preflight) |

### RFC4273 — `bgpPeerTable` (`1.3.6.1.2.1.15.2.1` — índice = peer Id conforme agente)

| OID sufixo | Campo | Notas |
|------------|-------|-------|
| `.7` | `bgpPeerRemoteAddr` | **peer_ip** (IPv4 clássico) |
| `.4` | `bgpPeerRemoteAs` | **peer_as** |
| `.2` | `bgpPeerState` | **fsm_state** (1–6) |
| `.3` | `bgpPeerAdminStatus` | **admin_status** |
| `.16` | `bgpPeerFsmEstablishedTime` | **uptime** (timeticks → segundos) |
| `.18` | `bgpPeerLastError` | opcional diagnóstico; não expor em UI cards |

**Mapeamento `bgpPeerState` → `fsm_state`:**

| SNMP | Texto |
|------|-------|
| 1 | idle |
| 2 | connect |
| 3 | active |
| 4 | opensent |
| 5 | openconfirm |
| 6 | established |

**`oper_status`:** `up` se `fsm_state=established`, else `down`.

### Prefix counters (best-effort)

Standard BGP4-MIB **não** define received/accepted/advertised prefix count por peer de forma universal. H3:

1. Tentar colunas vendor (Huawei) se walk peer OK e OIDs documentados no piloto.
2. Se ausente → `received_prefixes` / `accepted_prefixes` / `advertised_prefixes` = **`null`** (não inventar zero).

**Huawei (fallback — validar no piloto, não hardcode sem evidência):**

- Namespace típico: `1.3.6.1.4.1.2011.*` — tabela peer VRF-aware.
- Plano exige **OID inventory report** pós-piloto antes de GO implementação.

### BGP4-V2-MIB (se existir)

- Peer index por `InetAddressType` + address bytes.
- Usar quando RFC4273 peer table vazia e sysDescr indicar agente V2.
- Campos alvo iguais: remote addr, remote AS, state, admin, uptime.

---

## Préflight e falhas

| Código HTTP | `error` / code | Quando |
|-------------|----------------|--------|
| 504 / 422 | `SNMP_PREFLIGHT_TIMEOUT` | sysDescr ou bgpVersion timeout (3–5s budget) |
| 401 / 403 | `SNMP_PREFLIGHT_AUTH` | wrong community / authorizationError |
| 422 | `SNMP_BGP_UNAVAILABLE` | sysDescr OK, bgpVersion missing ou peer table vazia em todos MIB |
| 503 | `SNMP_FAST_DISABLED` | `NETOPS_SNMP_REAL_ENABLED=false` (gate H2) |
| 429 | `SNMP_FAST_RATE_LIMIT` | >1 collect / device / janela |

**Timeout preflight:** `SNMP_FAST_BGP_PREFLIGHT_TIMEOUT_MS` default **4000** (clamp **3000–5000**).  
**Retry preflight:** `SNMP_FAST_BGP_PREFLIGHT_RETRIES` default **1** (clamp **0–1**).

**Timeout walk BGP:** `SNMP_FAST_BGP_TIMEOUT_MS` default **5000** (clamp 3000–8000); retries walk **0–1** (piloto conservador).

---

## Freshness

| Status | Regra H3 |
|--------|----------|
| `fresh` | `now - collected_at` **< 15 min** |
| `stale` | **15 min – 24 h** |
| `expired` | **> 24 h** |
| `unknown` | job failed / peer row parcial |

Env: `SNMP_FAST_BGP_FRESH_MINUTES=15`, `SNMP_FAST_BGP_STALE_HOURS=24`.

Recompute no GET se `collected_at` antigo (mesmo padrão H2).

---

## API futura (contrato)

Auth: `devices.read` (GET), `devices.write` ou `operator` (POST collect — alinhar H2).

| Método | Path | Descrição |
|--------|------|-----------|
| POST | `/api/operational/bgp/collect` | `{ "device_id": 1 }` — dispara job SNMP_FAST BGP |
| GET | `/api/operational/bgp?device_id=X` | lista peers latest + freshness |
| GET | `/api/operational/bgp/summary?device_id=X` | cards UP/DOWN/IDLE/ACTIVE/UNKNOWN |

### POST collect — resposta sucesso (exemplo)

```json
{
  "job_id": 42,
  "device_id": 1,
  "status": "succeeded",
  "peer_count": 12,
  "collector_used": "rfc4273",
  "collected_at": "2026-05-27T12:00:00.000Z",
  "freshness_status": "fresh"
}
```

### GET peers — item (exemplo)

```json
{
  "peer_ip": "172.28.1.138",
  "peer_as": 262663,
  "peer_type": "ebgp",
  "vrf": null,
  "afi": "ipv4",
  "safi": "unicast",
  "admin_status": "up",
  "oper_status": "up",
  "fsm_state": "established",
  "uptime": 86400,
  "received_prefixes": null,
  "accepted_prefixes": null,
  "advertised_prefixes": null,
  "collected_at": "2026-05-27T12:00:00.000Z",
  "freshness_status": "fresh"
}
```

### GET summary — agregação UI

```json
{
  "device_id": 1,
  "collected_at": "2026-05-27T12:00:00.000Z",
  "freshness_status": "fresh",
  "counts": {
    "up": 8,
    "down": 2,
    "idle": 1,
    "active": 0,
    "unknown": 1
  }
}
```

**Mapeamento card → peer:**

| Card | Regra |
|------|-------|
| UP | `oper_status=up` (established) |
| DOWN | `oper_status=down` e `fsm_state` ∉ {idle, active} |
| IDLE | `fsm_state=idle` |
| ACTIVE | `fsm_state=active` |
| UNKNOWN | dados incompletos ou `fsm_state=unknown` |

Sem drilldown; sem link para D4 SSH.

---

## UI futura — BGP Operations

Rota sugerida: `/operational/bgp` ou tile em Operations.

- Seletor device (piloto: só id 1 habilitado).
- Botão **Coletar agora** → POST collect.
- Cards: **UP**, **DOWN**, **IDLE**, **ACTIVE**, **UNKNOWN** + badge freshness.
- Tabela peers opcional (sort por peer_ip) — read-only.
- Banner se `expired` / `stale`: “Dados SNMP antigos — recoletar”.

**Não:** abrir drilldown config, policies, rotas RIB.

---

## Segurança / ops

- Community **nunca** em log/JSON/audit payload.
- SNMP **GET/WALK read-only** apenas.
- Rate limit: 1 collect BGP / device / **5 min** (alinhar H2).
- Audit: `operational_snmp_fast_bgp_collect`.
- Piloto gate: device ∉ allowlist → **403**.

---

## Riscos

| Risco | Mitigação |
|-------|-----------|
| IPv6 gaps | BGP4-V2 + Huawei; senão peer IPv6 omitido com warning no job |
| Vendor MIB divergente | ordem fallback + `collector_used` + piloto OID inventory |
| VRF mapping errado | `vrf` nullable; não fundir peers com VRF diferente no mesmo IP sem índice |
| Peer duplicates | unique key `(device_id, peer_ip, vrf, afi, safi)` + latest query |
| Prefix counters null | UI mostra “—”; não confundir com zero rotas |
| Confundir com config BGP | docs + tabela separada; sem parse config |
| Poller NAT / rede | reutilizar checklist H2.1G (fora escopo código H3) |

---

## Fora de escopo H3

- `route-policy`, `community-list`, `prefix-list`, AS-PATH filters.
- SSH / `display bgp` / drilldown D4.
- Alterar `discovery.orchestrator` ou jobs SSH BGP.
- Compliance reports.
- Walk completo de RIB / `received-routes`.

---

## Critérios GO (fase plano)

- [x] Plano criado (este doc)
- [x] OIDs definidos (baseline RFC4273 + preflight)
- [x] Tabelas definidas
- [x] API definida
- [x] Sem código
- [x] Sem rede

**Próxima fase (H3.1):** schema + migration + collect + API + selftest sem SNMP live → piloto NOC 1 device.

---

## Critérios NO-GO

- Misturar config operacional com snapshot SSH parse na mesma tabela.
- Usar SSH para preencher `operational_bgp_peers`.
- GET sem `freshness` / `collected_at`.
- Bulk multi-device sem rate limit.
- Logar community ou varbind completo.

---

## Referências

- `docs/collection/H2_SNMP_FAST_INTERFACES_PLAN.md`
- `docs/collection/HYBRID_COLLECTION_ARCHITECTURE.md`
- RFC 4273 (BGP4-MIB)
- `reports/collection/PHASE_H2_1E_SNMP_PREFLIGHT_REPORT.md`
