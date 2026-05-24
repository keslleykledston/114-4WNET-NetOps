# FASE 2.3B — L2 Circuits Schema Hotfix — Report

**Date:** 2026-05-24  
**Status:** **GO**  
**Branch:** `feature/v0.3.4-operational-pilot-noc`

---

## Resumo

Tela `/l2-circuits` quebrava com HTTP 500 — Drizzle SELECT incluía colunas de classificação que **não existiam** no PostgreSQL live. Hotfix idempotente aplicado; **261 circuitos preservados**; API e UI OK.

---

## Causa raiz

Migration `0014_l2_circuit_classification.sql` existia no repo mas **não foi aplicada** no banco do container `netops-db`.

- `docker compose` migrate usa `drizzle-kit push` — não executa SQL numerado em `migrations/`
- Schema Drizzle (`l2circuits.ts`) + API passaram a SELECT colunas novas
- Tabela live ficou na versão anterior (26 colunas)

**Erro API (antes):**

```
List error: Failed query: select ... "raw_evidence", "classification", "l2_transport",
"device_role_family", "evidence_flags", "anomaly_tags", "role_context", "findings" ...
from "l2_circuits"
GET /api/l2-circuits → 500
```

---

## Colunas — antes vs depois

### Antes (26 colunas)

Presentes: `id`, `device_id`, `circuit_type`, …, `source`, `raw_evidence`, `findings`, timestamps, `discovery_run_id`.

### Faltantes (6)

| Coluna | Tipo Drizzle |
|--------|--------------|
| `classification` | text |
| `l2_transport` | text |
| `device_role_family` | text |
| `evidence_flags` | jsonb NOT NULL DEFAULT `{}` |
| `anomaly_tags` | jsonb NOT NULL DEFAULT `[]` |
| `role_context` | text |

**Nota:** `raw_evidence` e `findings` **já existiam** — erro vinha das 6 acima no meio do SELECT.

### Depois (32 colunas)

Todas as 8 colunas alvo confirmadas:

```
anomaly_tags, classification, device_role_family, evidence_flags,
findings, l2_transport, raw_evidence, role_context
```

---

## SQL aplicado

**Arquivo:** `tools/l2-circuits-schema-hotfix.sql`  
**Migration repo:** `workspace/lib/db/migrations/0015_l2_circuits_schema_hotfix.sql`

```sql
ALTER TABLE l2_circuits ADD COLUMN IF NOT EXISTS classification text;
ALTER TABLE l2_circuits ADD COLUMN IF NOT EXISTS l2_transport text;
ALTER TABLE l2_circuits ADD COLUMN IF NOT EXISTS device_role_family text;
ALTER TABLE l2_circuits ADD COLUMN IF NOT EXISTS evidence_flags jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE l2_circuits ADD COLUMN IF NOT EXISTS anomaly_tags jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE l2_circuits ADD COLUMN IF NOT EXISTS role_context text;
ALTER TABLE l2_circuits ADD COLUMN IF NOT EXISTS raw_evidence text;
ALTER TABLE l2_circuits ADD COLUMN IF NOT EXISTS findings jsonb NOT NULL DEFAULT '[]'::jsonb;
```

**Comando (non-interactive):**

```bash
docker exec -i netops-db psql -U netops -d netops -v ON_ERROR_STOP=1 \
  < tools/l2-circuits-schema-hotfix.sql
```

- Sem DROP / TRUNCATE / recreate
- Re-run safe (IF NOT EXISTS)
- API **não** precisou rebuild — só DB mudou

---

## Count antes/depois

| Métrica | Antes | Depois |
|---------|-------|--------|
| `SELECT count(*) FROM l2_circuits` | **261** | **261** |

Dados intactos.

---

## Smoke API

| Request | Resultado |
|---------|-----------|
| `GET /api/l2-circuits` | **200** — 261 circuitos |
| `GET /api/l2-circuits/1` | **200** |
| `POST /discover` | **não executado** |

Logs pós-fix: `GET /api/l2-circuits` → 200, sem "Failed query".

---

## Smoke UI (Playwright)

| Check | GO |
|-------|-----|
| `/l2-circuits` load | ✅ |
| Cards total | ✅ |
| Tabela 261 rows | ✅ |
| Filtros + refresh GET | ✅ |
| Detail sheet | ✅ |
| Zero POST discover | ✅ |

---

## Flags / SSH / discovery

| Item | Valor |
|------|-------|
| `L2_DISCOVER_SSH_ENABLED` | **false** (inalterado) |
| SSH executado | **zero** |
| Discovery executado | **zero** |
| NetBox | **não tocado** |

---

## Arquivos entregues

```
tools/l2-circuits-schema-hotfix.sql
workspace/lib/db/migrations/0015_l2_circuits_schema_hotfix.sql
reports/l2-circuits/PHASE_2_3B_SCHEMA_HOTFIX_REPORT.md
```

---

## Veredito

**GO** — mismatch schema vs DB corrigido; `/l2-circuits` operacional; 261 circuitos preservados.

### Recomendação follow-up

Garantir que novos ambientes apliquem `0014`/`0015` no bootstrap (ou documentar hotfix no runbook deploy) — `drizzle-kit push` sozinho não roda migrations numeradas.
