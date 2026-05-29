# L2 Circuits — Estado Atual da Feature

**Versão doc:** 2026-05-24  
**Branch:** `feature/v0.3.4-operational-pilot-noc`  
**MVP status:** **Encerrado GO**  
**Frontend NOC:** **FASE 2.3 GO**  
**Flag default:** `L2_DISCOVER_SSH_ENABLED=false`

---

## 1. Resumo

Feature L2 Circuit Discovery coleta circuitos Layer-2 via **SSH read-only** em Huawei VRP, parseia output CLI, normaliza status/findings, persiste em PostgreSQL e expõe REST API.

Frontend NOC em `/l2-circuits` é **read-only** — consulta dados existentes, não dispara discovery.

### Dados validados em lab

| Device ID | Hostname NetOps | Perfil | Circuitos | Tipos |
|-----------|-----------------|--------|-----------|-------|
| 1 | 4WNET-BVA-BRT-RX | NE/RX dot1q edge | 131 | `vlan_local` |
| 2 | 4WNET-BVA-BRT-RA* | S6730 switch | 130 | 82 L2VC/VPWS + 48 VSI |

\* CLI real: `4WNET-BVA-BRT-A_S6730-H48X6C` — divergência cosmética no cadastro.

**Total UI/API:** 261 circuitos | **DOWN:** 71

---

## 2. Arquitetura

```
POST /discover (flag=true)     GET /l2-circuits
        │                              │
        ▼                              ▼
  l2circuits.controller          l2circuits.service
        │                              │
        ▼                              ▼
  SSH collector ──► parsers ──► normalizers ──► PostgreSQL
  (6 cmds RO)      huawei-vrp     status         l2_circuits
                   dot1q-local    findings       l2_discovery_jobs
                   s6730-l2
```

### Módulo backend

`workspace/artifacts/api-server/src/modules/l2circuits/`

| Arquivo/dir | Função |
|-------------|--------|
| `l2circuits.routes.ts` | 4 endpoints |
| `l2circuits.controller.ts` | HTTP handlers, async job start |
| `l2circuits.service.ts` | Business logic, DB, flag gate |
| `collectors/ssh.collector.ts` | Execução SSH allowlist |
| `parsers/huawei-vrp-l2.ts` | Orquestrador parsers NE8000 |
| `parsers/dot1q-local.parser.ts` | dot1q / VE / ve-group |
| `parsers/s6730-l2.parser.ts` | L2VC non-verbose S6730 |
| `parsers/classification.helpers.ts` | Classificação circuit_type |
| `normalizers/status.normalizer.ts` | UP/DOWN/PARTIAL/… |
| `normalizers/findings.resolver.ts` | Finding codes |
| `redact-l2-output.ts` | Truncar/redigir evidence |
| `l2circuits.types.ts` | Types completos |

### Gate SSH

```typescript
// l2circuits.service.ts
if (process.env.L2_DISCOVER_SSH_ENABLED !== "true") {
  // job falha com mensagem explícita — sem SSH
}
```

Comandos passam por `validateReadonlyCommand()` em `modules/netops/huawei-vrp/commands.ts`.

---

## 3. Endpoints REST

Base: `/api` (auth obrigatória)

| Method | Path | Descrição |
|--------|------|-----------|
| **POST** | `/l2-circuits/discover` | Body `{ device_id }` → 202 + `run_id`. **Requer flag.** |
| **GET** | `/l2-circuits/discovery-jobs/:runId` | Status job, counts, error |
| **GET** | `/l2-circuits` | Lista circuitos |
| **GET** | `/l2-circuits/:id` | Detalhe + findings + raw_evidence |

### Query params list (implementados)

| Param | Server-side |
|-------|-------------|
| `device_id` | ✅ |
| `circuit_type` | ✅ (mutuamente exclusivo com outros filtros DB) |
| `vc_id` | ✅ |
| `vsi_name` | ✅ |
| `status`, VLAN, peer_ip | ❌ — só frontend |
| `limit`, `offset` | ❌ — types existem, handler não aplica |

Response list atual:

```json
{ "circuits": [...], "total": <array.length> }
```

---

## 4. Comandos SSH allowlist (collector L2)

Executados **somente** com `L2_DISCOVER_SSH_ENABLED=true`:

1. `display mpls l2vc verbose` — NE8000 L2VC
2. `display mpls l2vc` — S6730 L2VC
3. `display vsi verbose` — VSI
4. `display interface brief`
5. `display interface description`
6. `display current-configuration interface` — dot1q/VE (**pesado**)

Selftest allowlist: `node tools/l2-collector-selftest.mjs`

### Comandos no tipo mas não no MVP collector live

`display ip interface brief`, `display ip vpn-instance`, `display vlan`, `display mac-address vsi/vlan` — preparados para fases futuras (MAC enrichment).

---

## 5. Tipos de circuito

### Validados live

| circuit_type | Cenário | Device |
|--------------|---------|--------|
| `vlan_local` | dot1q subif, VE, ve-group | 1 |
| `l2vc` | MPLS L2VC | 2 |
| `vpws` | Pseudowire point-to-point | 2 |
| `vsi` | VSI multipoint | 2 |
| `vpls` | VPLS-style | 2 (parcial) |

### Parser/types adicionais (schema)

`vlan`, `dot1q_subif`, `vlan_orphan`, `l3_vrf_link`, `l3_interface`, `config_only`

### Classifications (migration 0014)

`vlan_local`, `vpws`, `l2vc`, `vsi`, `vpls`, `vlan_orphan`, `classification_conflict`, etc.

Dry-run classification (read-only): `reports/l2-circuits/PHASE_2_CLASSIFICATION_DRYRUN_REPORT.md`

---

## 6. Status operacionais

| Status | Significado |
|--------|-------------|
| `UP` | Circuito operacional |
| `DOWN` | Circuito down |
| `PARTIAL` | Estado parcial (ex.: AC up, VC down) |
| `CONFIG_ONLY` | Só config, sem estado operacional claro |
| `UNKNOWN` | Indeterminado |

Normalização: `normalizers/status.normalizer.ts`

---

## 7. Findings

| Code | Validado | Notas |
|------|----------|-------|
| `CIRCUIT_DOWN` | ✅ device 1+2 | |
| `REMOTE_NOT_FORWARDING` | ✅ device 2 VC 15 | |
| `DESCRIPTION_MISSING` | ✅ device 1 vlan_local | skip l2vc/vsi |
| `INCOMPLETE_L2_CONFIG` | 🔶 fixtures | |
| `DUPLICATED_VC_ID` | 🔶 | |
| `VLAN_CONFLICT` | 🔶 QinQ futuro | |
| `VLAN_ORPHAN` | parser | |
| `CLASSIFICATION_CONFLICT` | classification | |
| Outros VLAN_* | classification engine | |

Severities: `info`, `warning`, `error`

---

## 8. Banco de dados

### `l2_circuits`

Campos principais: device_id, circuit_type, name, vlans, vc_id, vsi_name/id, interfaces, peer_ip, admin/oper status, findings JSON, raw_evidence (redigida ~240 chars), classification, discovery_run_id, first/last_seen.

Índices: device_id, circuit_type, vc_id, vsi_name, discovery_run_id.

### `l2_discovery_jobs`

run_id (unique), device_id, status (pending|running|completed|failed), counts, error_message, timestamps.

Schema: `workspace/lib/db/src/schema/l2circuits.ts`  
Migration: `workspace/lib/db/migrations/0014_l2_circuit_classification.sql`

---

## 9. Frontend NOC

### Rota

`/l2-circuits` — sidebar "L2 Circuits"

### Arquivos

```
src/pages/l2-circuits.tsx
src/features/l2-circuits/
  l2-circuits-api.ts          # GET hooks only
  l2-circuit-badges.tsx
  l2-circuit-detail-sheet.tsx # raw evidence aqui
  l2-circuits-empty-state.tsx
  l2-circuits-export.ts       # CSV filtered
  l2-circuits-filter-storage.ts
  l2-circuits-utils.ts        # sort NOC, filters client
```

### Comportamento

| Ação | Comportamento |
|------|---------------|
| Carregar página | `GET /api/l2-circuits` |
| Filtro device | `GET /api/l2-circuits?device_id=N` |
| Filtros status/tipo/VLAN/VC/peer | Client-side |
| Atualizar lista | `refetch()` — **sem discovery** |
| Export CSV | Dados filtrados/ordenados visíveis |
| Detail sheet | `GET /api/l2-circuits/:id` |
| Discovery | **Não disponível na UI** |

Sort NOC: DOWN → PARTIAL → CONFIG_ONLY → UP → UNKNOWN; depois findings count desc.

UX FASE 2.2 | Deploy smoke FASE 2.3 GO.

---

## 10. Cenários suportados (matriz)

Ver detalhe: [`SUPPORTED_SCENARIOS.md`](./SUPPORTED_SCENARIOS.md)

| Perfil | Cenários GO |
|--------|-------------|
| NE/RX (device 1) | dot1q, VE, ve-group, description merge |
| S6730 (device 2) | L2VC non-verbose, VPWS, VSI, remote not forwarding |
| NE8000 verbose | Fixtures offline only |

**Fora MVP:** bulk, SNMP L2, NetBox sync, MAC tables, multi-vendor.

---

## 11. Validações em campo

| Fase | Report | Resultado |
|------|--------|-----------|
| 1.1 | `PHASE_1_1_HUAWEI_SMOKE_*` | Plan + smoke |
| 1.3–1.3B | dot1q collector/parser | GO |
| 1.4 | `PHASE_1_4_DEVICE1_RESMOKE_RESULT.md` | 131 vlan_local GO |
| 1.5 | `PHASE_1_5_S6730_L2VC_PARSER_REPORT.md` | Parser GO |
| 1.6 | `PHASE_1_6_S6730_*` | 130 circuitos GO |
| 1.7 | `MVP_L2_DISCOVERY_CLOSURE_REPORT.md` | MVP GO |
| 2.1 | `PHASE_2_1_FRONTEND_NOC_REPORT.md` | UI read-only GO |
| 2.2 | `PHASE_2_2_FRONTEND_NOC_UX_REPORT.md` | UX GO |
| 2.3 | `PHASE_2_3_WEB_DEPLOY_SMOKE_REPORT.md` | Deploy GO |
| 2.x class | `PHASE_2_CLASSIFICATION_*` | Dry-run GO |

### Selftests (safe)

```bash
node tools/l2-collector-selftest.mjs
node tools/l2-dot1q-parser-selftest.mjs
node tools/l2-s6730-parser-selftest.mjs
node tools/l2-classification-selftest.mjs
node tools/l2-classification-dryrun.mjs   # read-only DB
node tools/l2-api-smoke.mjs               # precisa API
```

---

## 12. Limitações atuais

| Item | Status |
|------|--------|
| Bulk discovery | ❌ Não validado |
| SNMP enrichment | ❌ |
| NetBox correlation | ❌ |
| MAC VLAN/VSI dinâmico | ❌ |
| Paginação API | ❌ |
| Filtros combinados server-side | ❌ |
| Frontend carrega lista completa | ⚠️ OK para 261; escala mal |
| UI discovery button | ❌ Intencional (runbook only) |
| Hostname device 2 vs CLI | ⚠️ Cosmético |

---

## 13. Riscos operacionais

1. **`display current-configuration interface`** — comando pesado; usar janela NOC
2. **Flag esquecida true** — rollback imediato após discovery
3. **Bulk sem controle** — não executar multi-device sem FASE 3
4. **Credenciais/logs** — evidence redigida; não logar passwords
5. **SSH timeout** — monitorar job error_message
6. **Crescimento dados** — paginação urgente em FASE 2.4

---

## 14. Discovery controlado (quando aprovado)

**Nunca** pelo frontend L2 atual.

Procedimento oficial:

1. Ler [`SAFE_EXECUTION_CHECKLIST.md`](./SAFE_EXECUTION_CHECKLIST.md)
2. Seguir [`RUNBOOK_L2_DISCOVERY.md`](./RUNBOOK_L2_DISCOVERY.md)
3. Set `L2_DISCOVER_SSH_ENABLED=true` temporário
4. `POST /api/l2-circuits/discover` **1 device**
5. Poll `GET /api/l2-circuits/discovery-jobs/:runId`
6. Validar counts
7. **Rollback flag false**

---

## 15. Próximas fases

| Fase | Escopo | Prioridade |
|------|--------|------------|
| **2.4** | Filtros server-side + paginação API/UI | Alta |
| **2.5** | Botão discovery protegido (checklist + flag visual) | Média — precisa aprovação |
| **2.6** | Histórico/delta status entre runs | Média |
| **2.7** | SNMP enrichment | Baixa |
| **2.8** | NetBox read-only correlation | Baixa |
| **3** | Bulk discovery controlado | Futuro |

### Blocker FASE 2.4?

**Nenhum blocker.** Typecheck OK, MVP+UI GO. WIP classification na branch — alinhar escopo antes de merge.

---

## 16. Referências rápidas

| Documento | Path |
|-----------|------|
| MVP scope | `docs/l2-circuits/MVP.md` |
| Runbook | `docs/l2-circuits/RUNBOOK_L2_DISCOVERY.md` |
| Checklist | `docs/l2-circuits/SAFE_EXECUTION_CHECKLIST.md` |
| Cenários | `docs/l2-circuits/SUPPORTED_SCENARIOS.md` |
| Closure | `reports/l2-circuits/MVP_L2_DISCOVERY_CLOSURE_REPORT.md` |
| Project analysis | `reports/project/PROJECT_STATUS_ANALYSIS.md` |
