# H2 — SNMP_FAST interfaces + freshness

**Status:** plano (sem implementação até GO checklist)  
**Depende:** H1 docs (`HYBRID_COLLECTION_ARCHITECTURE.md`, `COLLECTION_DATA_CONTRACT.md`, `SAFE_COLLECTION_CHECKLIST.md`)

---

## Objetivo

Persistir estado operacional de interfaces via **SNMP read-only**, **1 device piloto**, com **freshness** explícito. **Não** compliance configuracional. **Não** SSH nesta fase.

---

## Piloto (1 device)

| Campo | Valor sugerido |
|-------|----------------|
| `device_id` | `1` (lab: `4WNET-BVA-BRT-RX` — confirmar hostname no DB antes) |
| Limite | `PILOT_DEVICE_IDS=1` ou allowlist única no código até H2.1 |

**Regra:** coleta SNMP_FAST rejeita `device_id` ∉ piloto (403 ou 400).

---

## Credenciais (sem expor segredo)

- Fonte: campo `devices.snmpCommunity` (já usado por `snmp-readonly-adapter`).
- **Nunca** logar community; **nunca** retornar em JSON de API.
- `NETOPS_SNMP_REAL_ENABLED=true` só em lab compose; prod default `false`.
- Perfil: v2c read-only GET/WALK (já doc `docs/netops/SNMP_READONLY_COLLECTION.md`).

---

## OIDs / campos (IF-MIB + ifXTable)

| Campo | OID / nota |
|-------|------------|
| ifIndex | chave da walk (sufixo) |
| ifDescr | `1.3.6.1.2.1.2.2.1.2` |
| ifName | `1.3.6.1.2.1.31.1.1.1.1` |
| ifAlias | `1.3.6.1.2.1.31.1.1.1.18` |
| ifAdminStatus | `1.3.6.1.2.1.2.2.1.7` |
| ifOperStatus | `1.3.6.1.2.1.2.2.1.8` |
| ifHighSpeed | `1.3.6.1.2.1.31.1.1.1.15` (Mbps; 0 = usar ifSpeed fallback) |
| ifLastChange | `1.3.6.1.2.1.2.2.1.9` (timeticks; já em `oids.ts`, **não** populado hoje em `collect.ts` — H2 adiciona walk + coluna) |
| ifHCInOctets | `1.3.6.1.2.1.31.1.1.1.6` |
| ifHCOutOctets | `1.3.6.1.2.1.31.1.1.1.10` |

Hoje `collect.ts` já faz maior parte; H2 = **ifHighSpeed** + **ifLastChange** + persistência relacional + job + freshness.

---

## Tabela `operational_interfaces` (proposta)

```text
id serial PK
device_id int FK devices
collection_job_id int FK nullable (operational_collection_jobs)
if_index int not null
if_name text
if_descr text nullable
if_alias text nullable
admin_status text
oper_status text
if_high_speed_mbps int nullable   -- from ifHighSpeed
if_speed_bps bigint nullable      -- legacy ifSpeed quando útil
if_last_change_ticks bigint nullable
hc_in_octets bigint nullable
hc_out_octets bigint nullable
source text not null default 'snmp'
collected_at timestamptz not null
freshness_status text not null   -- fresh | stale | expired | unknown
freshness_expires_at timestamptz nullable
snapshot_row_hash text nullable  -- opcional dedup

unique (device_id, if_index, collected_at) -- ou latest-only + upsert por device+if_index
```

**Estratégia de linhas:** opção A) append-only + view “latest per if_index”; opção B) upsert última linha por `(device_id, if_index)`. Recomendado **A** para auditoria; GET latest via query.

---

## `operational_collection_jobs` (proposta mínima)

```text
id, device_id, layer='snmp_fast', scope='interfaces',
status, started_at, completed_at, error_summary,
created_by (user id ou 'scheduler')
```

`collection_job_id` nas linhas de interface aponta para este job.

---

## Freshness

| Status | Regra (default piloto) |
|--------|------------------------|
| `fresh` | `now - collected_at < 15 min` |
| `stale` | 15 min – 2 h |
| `expired` | > 2 h |
| `unknown` | coleta falhou parcial ou sem dados |

TTLs via env: `SNMP_FAST_INTERFACE_FRESH_MINUTES`, `SNMP_FAST_INTERFACE_STALE_HOURS`.

Computar no **read** (GET) ou materializar `freshness_status` no insert (recompute lazy).

---

## Timeout / rate-limit

| Parâmetro | Default sugerido |
|-----------|------------------|
| SNMP session timeout | 60s (igual `collect.ts` hoje) |
| Retries | 4 |
| Rate limit API | max **1** coleta SNMP_FAST / device / **5 min** (429) |
| Concorrência | 1 walk global piloto (sem fila massa) |

---

## Endpoint (read-only)

```http
GET /api/operational/interfaces?device_id=1
```

- Auth + permissão `device.read` (ou equivalente existente).
- Resposta: array + envelope:

```json
{
  "deviceId": 1,
  "collectionJobId": 123,
  "collectedAt": "2026-...",
  "freshness": "fresh",
  "interfaces": [ ... ]
}
```

**Não** incluir `compliance` / `policy` / `raw_config` neste endpoint.

---

## Coleta (quando implementar)

1. `POST /api/operational/collection/snmp-fast` **ou** estender `POST /api/netops/devices/:id/collect/read-only` com query `?scope=interfaces-only` + piloto guard.
2. `NETOPS_SNMP_REAL_ENABLED` gate inalterado.
3. Após walk: insert `operational_collection_jobs` + N rows `operational_interfaces`.
4. Falha: não apagar último snapshot bom (mesma regra `snmp_snapshots`).

**Opcional:** continuar gravando `snmp_snapshots.interfaces_json` para compat até deprecar.

---

## Fora de escopo H2

- Compliance engine / `bgp-checks` / route-policy
- SSH / discovery orchestrator
- BGP SNMP (H3)
- UI completa (endpoint only OK no PR1)
- NetBox
- Bulk multi-device

---

## PRs sugeridos

| PR | Conteúdo |
|----|-----------|
| H2.1 | migration + Drizzle schema + service insert + GET read |
| H2.2 | extend collect walk (ifHighSpeed, ifLastChange) + pilot guard + rate limit |
| H2.3 | UI badge “SNMP · fresh” (opcional) |

---

## Referências código atual

- `workspace/artifacts/api-server/src/modules/netops/snmp/collect.ts` — `collectInterfaces`
- `workspace/artifacts/api-server/src/modules/netops/snmp/oids.ts` — `ifLastChange` OID existe
- `workspace/lib/db/src/schema/snmp_snapshots.ts`
- `docs/netops/SNMP_READONLY_COLLECTION.md`
- `docs/collection/SAFE_COLLECTION_CHECKLIST.md` §2

---

## Critério GO implementação (checklist)

- [ ] Piloto `device_id` fixado e enforced
- [ ] Community só em DB; zero log/response leak
- [ ] Timeout + retries documentados
- [ ] Rate-limit por device
- [ ] Tabela + contrato API alinhados `COLLECTION_DATA_CONTRACT.md`
- [ ] Checklist segurança revisado
- [ ] Zero bulk / sem scheduler fleet-wide

Quando todos ✅ → implementar conforme PRs acima.
