# BGP Peer Drilldown — D4 SSH Detail Closure Report

**Date:** 2026-05-27  
**Scope:** D4.1 guard → D4.2A flag-off → D4.2B plan → D4.2C real SSH  
**Base (drilldown trunk):** `37db208` — `docs(bgp): close peer drilldown phases D2 through D6B`  
**Veredito final:** **`SSH_DETAIL = CONTROLLED_GO`**

---

## 1. Objetivo

Adicionar caminho **SSH read-only leve** para **um peer BGP**, complementando drilldown snapshot (D2–D3), sem:

- coleta de rotas (received / accepted / advertised),
- `display current-configuration` global,
- execução SSH com feature gate desligado,
- SNMP poll / discovery durante janela controlada.

Default produção: **gate false** — SSH só após janela NOC explícita.

---

## 2. Linha do tempo (fases)

| Fase | Artefato | Commit / data | O que provou |
|------|----------|---------------|--------------|
| **D4.1** guard | `PHASE_BGP_PEER_DRILLDOWN_D4_SSH_DETAIL_PLAN_AND_GUARD_REPORT.md` | `0a5d5eb` (2026-05-26) | Allowlist, builder, sanitização, endpoint, UI, selftest; **zero SSH real** |
| **D4.2A** flag false | `PHASE_BGP_PEER_DRILLDOWN_D4_2A_FLAG_FALSE_RUNTIME_SMOKE_REPORT.md` | `0a5d5eb` runtime | `POST /detail` → **503** antes de cred/SSH; snapshot OK; SNMP poll off no run conforme |
| **D4.2B** plano | `PHASE_BGP_PEER_DRILLDOWN_D4_2B_SSH_DETAIL_REAL_SMOKE_PLAN.md` | 2026-05-26 | Plano NOC 1 peer / 1 POST / rollback — **sem execução** |
| **D4.2C** real | `PHASE_BGP_PEER_DRILLDOWN_D4_2C_REAL_SSH_SMOKE_REPORT.md` | 2026-05-27 | **1 POST SSH** piloto GO; rollback **503** |

---

## 3. Endpoint e gate

```http
POST /api/bgp/peers/:deviceId/:peer/drilldown/detail
```

| Item | Valor |
|------|-------|
| Env | `BGP_DRILLDOWN_SSH_DETAIL_ENABLED` |
| Default | **`false`** |
| Gate false | **503** `BGP_DRILLDOWN_SSH_DETAIL_DISABLED` — **antes** de ler credencial e **antes** de `runSSHCommands` |
| Resposta sucesso | `source: "ssh_detail"`, `contractVersion: bgp-peer-drilldown-ssh-detail-v1` |

Body API (não usar `includeRuntime` / `commandsProfile` — **não implementados**):

```json
{
  "includePeerVerbose": true,
  "includeRoutePolicies": true,
  "includePolicyObjects": false
}
```

Perfil **light** (D4.2C): peer + verbose + route-policy; **sem** objetos de dependência (`includePolicyObjects: false`).

---

## 4. Comandos permitidos (allowlist D4.1)

Somente `display` read-only com nomes validados (`isSafePeerIdentifier`, `isSafePolicyObjectName`):

| Comando | Tier |
|---------|------|
| `display bgp peer <PEER>` | light |
| `display bgp peer <PEER> verbose` | light |
| `display route-policy <POLICY>` | light |
| `display ip ip-prefix <NAME>` | object (se `includePolicyObjects: true`) |
| `display ip ipv6-prefix <NAME>` | object |
| `display ip as-path-filter <NAME>` | object |
| `display ip community-filter <NAME>` | object |
| `display ip extcommunity-filter <NAME>` | object |

Builder usa snapshot drilldown para escolher policies/objetos — **não inventa** nomes fora do parse.

**Não implementado** (mesmo em spec escrita D4.2B/C):

- `display current-configuration configuration bgp | begin <peer>`

---

## 5. Comandos e tokens proibidos

**Route-table (sempre bloqueados):**

```text
display bgp routing-table peer <PEER> received-routes
display bgp routing-table peer <PEER> accepted-routes
display bgp routing-table peer <PEER> advertised-routes
```

**Config / mutação / destrutivo:**

```text
display current-configuration          (global — fora do allowlist)
system-view | undo | reset | clear | save | commit | delete | reboot | format
```

**Injeção / shell:**

```text
;  |  &  `  $  >  <  newline
```

Qualquer comando fora regex allowlist → **warning** + **não executa** (`Command blocked by D4 allowlist`).

---

## 6. Runtime real (D4.2C)

**Piloto:** `device_id=1`, peer `172.28.1.138` (`4WNET-BVA-BRT-RX`).

**Janela (efêmera, não commitada):**

```text
BGP_DRILLDOWN_SSH_DETAIL_ENABLED=true
SNMP_POLL_ENABLED=false
```

**Pré-flight snapshot:**

```http
GET /api/bgp/peers/1/172.28.1.138/drilldown?source=snapshot&include_policies=true&include_policy_objects=true
→ 200, cache fresh, runtime null, routeTables.*.requested=false
```

**Única execução SSH (smoke formal):**

| Métrica | Valor |
|---------|-------|
| HTTP | **200** |
| Duração API | **~3709 ms** (log `responseTime` ~3708 ms) |
| Comandos (4) | ver §7 |
| Evidence | 4 blocos; tamanhos ~50 / 1954 / 367 / 88 chars |
| Segredos em output | **não** (sanitizer + grep smoke) |
| Route tables | **não consultadas** |

**Timeouts configurados (serviço D4):**

| Limite | ms |
|--------|-----|
| `sessionTimeoutMs` | 120000 |
| `commandTimeoutMs` | 30000 |
| `setupTimeoutMs` | 10000 |
| Budget operacional NOC (D4.2B) | 60000 |

Smoke ficou **bem abaixo** do budget.

---

## 7. Comandos executados no piloto (D4.2C)

Somente nomes (output **não** arquivado neste closure):

```text
display bgp peer 172.28.1.138
display bgp peer 172.28.1.138 verbose
display route-policy AS262663-WIFIZAO.BRT-Import-IPv4
display route-policy AS262663-WIFIZAO.BRT-Export-IPv4
```

---

## 8. Rollback

Imediato após 1 POST:

```bash
# override local .d4.2c-rollback.override.yml
BGP_DRILLDOWN_SSH_DETAIL_ENABLED=false
docker compose -f docker-compose.yml -f .d4.2c-rollback.override.yml up -d --no-deps api
```

**Pós-rollback:**

```http
POST /api/bgp/peers/1/172.28.1.138/drilldown/detail
→ 503 BGP_DRILLDOWN_SSH_DETAIL_DISABLED
```

Estado estável produção: **gate false**.

---

## 9. Segurança

| Controle | Status |
|----------|--------|
| Feature gate default false | OK |
| 503 antes de SSH se false | OK (D4.2A + D4.2C pós) |
| Allowlist + safe-name | OK |
| Sem route-table | OK |
| Redaction output (`password`, `cipher`, `community`, `secret`) | OK |
| Logs API: request line + `responseTime`; **sem** dump output SSH | OK |
| Credenciais: decrypt só em memória; **não** logar senha | OK |
| 1 peer / 1 exec formal | OK |
| Sem write device / NetBox | OK |

**Operacional:** após muitas falhas SSH, Huawei pode devolver `read ECONNRESET` temporário (rate-limit). UI mostra `message` da API — não é necessariamente falha nginx. Aguardar cooldown antes de novo teste.

**Histórico piloto:** tentativa anterior D4.2C **NO-GO** (auth fail) antes de correção senha no DB; execução formal **GO** após `PASSWORD_DB_MATCH` + janela.

---

## 10. Limitações

1. **`includeRuntime` / `commandsProfile`** — spec operacional; API usa `includePeerVerbose` / `includeRoutePolicies` / `includePolicyObjects`.
2. **`display current-configuration … begin <peer>`** — não no allowlist implementado.
3. **UI default mutation** envia `includePolicyObjects: true` — mais comandos que perfil light; operador deve alinhar body se quiser mínimo.
4. **Erro SSH não mapeado** — falha auth/reset pode retornar **500** HTML; ideal futuro: **502** estruturado.
5. **Browser E2E** — D4.2A validou bundle estático; D4.2C validou contrato JSON + 1 POST API (clique UI = nova exec SSH).
6. **nginx** — `proxy_read_timeout` 180s em `infra/nginx/default.conf` para SSH longo via `:3005` (mitigação; smoke formal usou `:8085` direto).
7. **community-list** dependências — sem comando allowlist; warning only.
8. **Piloto único** — generalização multi-peer exige nova janela NOC cada vez.

---

## 11. Tempos (resumo)

| Cenário | Tempo observado |
|---------|-----------------|
| D4.2A `POST /detail` gate false | ~12 ms (503, sem SSH) |
| D4.2C `POST /detail` real (4 cmds) | **~3,7 s** |
| D4.2C pré `GET drilldown` | sub-segundo (cache fresh) |
| Limite NOC recomendado | 60 s (não atingido) |
| Limite sessão SSH serviço | 120 s |

---

## 12. Exemplos de uso

### 12.1 Consulta snapshot (sempre permitida)

```http
GET /api/bgp/peers/1/172.28.1.138/drilldown?source=snapshot&include_policies=true&include_policy_objects=true
Authorization: Bearer <token>
```

### 12.2 SSH detail — gate **desligado** (default)

```http
POST /api/bgp/peers/1/172.28.1.138/drilldown/detail
Content-Type: application/json

{"includePeerVerbose":true,"includeRoutePolicies":true,"includePolicyObjects":false}
```

→ **503** `{ "error": "BGP_DRILLDOWN_SSH_DETAIL_DISABLED", ... }`

### 12.3 SSH detail — janela NOC (1 peer, 1 vez)

1. Aprovar janela NOC.  
2. Override efêmero: `BGP_DRILLDOWN_SSH_DETAIL_ENABLED=true`, `SNMP_POLL_ENABLED=false`.  
3. `GET /api/healthz` → 200.  
4. `GET .../drilldown?source=snapshot` → peer + policies + `routeTables.requested=false`.  
5. **Um** `POST .../detail` com body light (§3).  
6. Validar `source=ssh_detail`, comandos ⊆ allowlist, sem segredos.  
7. Rollback flag false + `POST` → 503.

### 12.4 UI

Rota: `/bgp/peer-drilldown?deviceId=1&peer=172.28.1.138`  
Painel **SSH detail leve** → botão **Atualizar detalhe via SSH** (equivale a POST; respeitar regra 1 exec por janela).

---

## 13. Checklist NOC (reutilizável)

- [ ] Janela aprovada e operador identificado  
- [ ] Device/peer piloto confirmados  
- [ ] `BGP_DRILLDOWN_SSH_DETAIL_ENABLED=false` antes da janela  
- [ ] `SNMP_POLL_ENABLED=false` durante janela  
- [ ] Sem discovery / jobs bulk  
- [ ] Containers healthy (`/api/healthz` 200)  
- [ ] Credencial SSH testada (`test-connection` ou procedimento operador)  
- [ ] Snapshot drilldown 200; `routeTables.*.requested=false`  
- [ ] **Exatamente 1** `POST /detail`  
- [ ] Tail logs API durante POST (sem output completo)  
- [ ] Validar lista de comandos = allowlist  
- [ ] Rollback imediato + `POST` → 503  
- [ ] Parar se timeout, comando inesperado, segredo em log, ou alerta device  

---

## 14. Critérios de veredito

| Critério | D4.1 | D4.2A | D4.2B | D4.2C |
|----------|------|-------|-------|-------|
| Guard / allowlist | PASS | — | plano | PASS |
| Flag false → 503 | PASS | PASS | — | PASS (pós) |
| Zero SSH indevido | PASS | PASS | N/A | PASS (1 só na janela) |
| Real SSH controlado | — | — | plano | PASS |
| Rollback | — | — | plano | PASS |
| Route tables off | PASS | PASS | plano | PASS |

---

## 15. Decisão final

**`SSH_DETAIL = CONTROLLED_GO`**

Racional:

- Gate **default false** e **503 pré-SSH** comprovados (D4.1, D4.2A, D4.2C rollback).  
- Allowlist, redaction e bloqueio route-table implementados e testados (selftest + piloto real).  
- Plano NOC (D4.2B) seguido na execução formal (D4.2C): 1 peer, 1 POST, ~3,7 s, rollback OK.  
- Risco residual **operacional** (rate-limit SSH, body spec vs API, 500 em erro SSH) — mitigável por processo NOC; **não** bloqueia fechamento controlado.

**Produção:** manter `BGP_DRILLDOWN_SSH_DETAIL_ENABLED=false` até nova janela. SSH detail = capacidade **opt-in**, não comportamento default.

---

## 16. Referências

| Documento |
|-----------|
| `reports/bgp/PHASE_BGP_PEER_DRILLDOWN_D4_SSH_DETAIL_PLAN_AND_GUARD_REPORT.md` |
| `reports/bgp/PHASE_BGP_PEER_DRILLDOWN_D4_2A_FLAG_FALSE_RUNTIME_SMOKE_REPORT.md` |
| `reports/bgp/PHASE_BGP_PEER_DRILLDOWN_D4_2B_SSH_DETAIL_REAL_SMOKE_PLAN.md` |
| `reports/bgp/PHASE_BGP_PEER_DRILLDOWN_D4_2C_REAL_SSH_SMOKE_REPORT.md` |
| `docs/bgp/BGP_PEER_DRILLDOWN_SAFE_CHECKLIST.md` |
| `docs/bgp/BGP_PEER_DRILLDOWN_ARCHITECTURE.md` |
| `reports/bgp/BGP_PEER_DRILLDOWN_CLOSURE_REPORT.md` (D2–D6B) |
