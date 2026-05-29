# FASE 1.1 — Smoke Test Controlado (1× Huawei VRP)

**Date:** 2026-05-23  
**Refs:** commit `897408c`, `MVP_RUNTIME_HOTFIX_REPORT.md`  
**Status atual:** `L2_DISCOVER_SSH_ENABLED=false` — **NÃO executar smoke ainda**

---

## Objetivo

Validar **um único** device Huawei VRP em produção/lab via API L2:

1. SSH read-only (allowlist apenas).
2. Coleta `display mpls l2vc verbose` + `display vsi verbose` + `display interface brief` + `display interface description`.
3. Parser L2VC/VSI (sem interface brief/mac nesta fase).
4. Job `run_id` consistente, circuitos em `l2_circuits`, `raw_evidence` redigido.

**Fora de escopo:** SNMP, NetBox write, bulk multi-device, `system-view`, comandos write/destrutivos, parser vlan/mac.

---

## Device alvo (recomendado)

| Campo | Valor |
|-------|--------|
| **device_id** | **1** |
| hostname | `4WNET-BVA-BRT-RX` |
| ip_address | `45.169.161.255` |
| vendor / platform | `huawei` / `vrp` |
| status | `active` |
| username | configurado |
| password_encrypted | set |

**Alternativas piloto (mesmo perfil):** `device_id` **2** (`4WNET-BVA-BRT-RA`), **3** (`4WNET-BVA-CDS-RX`).  
**Não usar:** `device_id` **36** (`l2-hotfix-no-cred`) — sem senha (smoke de erro 422 apenas).

---

## Comandos SSH permitidos (allowlist)

Enviados pelo collector (`ssh.collector.ts`), validados antes do SSH:

```text
display mpls l2vc verbose
display vsi verbose
display interface brief
display interface description
```

**Bloqueados (exemplos):** `system-view`, `undo`, `reset`, `clear`, `save`, `commit`, `delete`, `reboot`, `format`, `configure terminal`.

**Parser nesta fase:** apenas saída de **L2VC** e **VSI** (brief/description coletados mas não parseados).

---

## Pré-validação (ambiente atual — 2026-05-23)

Executada **sem** habilitar SSH L2 e **sem** `POST /discover`.

| Check | Resultado |
|-------|-----------|
| `L2_DISCOVER_SSH_ENABLED` no container | `false` → **NO-GO executar smoke** |
| `GET /api/healthz` | **200** |
| Tabelas `l2_circuits`, `l2_discovery_jobs` | **existem** |
| `GET /api/l2-circuits` + auth | **200** `{"circuits":[],"total":0}` |
| Device 1 `ip_address` | **OK** |
| Device 1 `password_encrypted` | **OK** (set) |
| Device 1 vendor/platform | **huawei / vrp** |
| Devices 2, 3 mesmo perfil | **OK** (SQL) |
| Rotas L2 no bundle API | **OK** (hotfix) |
| `run_id` + credenciais + redact | **OK** (hotfix) |

**decrypt:** validar no momento do GO com teste de conexão SSH existente (UI ou endpoint abaixo) — não expor senha em log.

```bash
# Opcional: teste SSH read-only já existente no projeto (NÃO é L2 discover)
curl -s -b cookies.txt -X POST "http://127.0.0.1:8080/api/devices/1/test-connection"
```

---

## Checklist GO — executar smoke real

Marque **todos** antes de `POST /discover`:

- [ ] `L2_DISCOVER_SSH_ENABLED=true` no `.env` (raiz do repo)
- [ ] API reconstruída após alterar flag: `docker compose up -d --build api`
- [ ] Container confirma flag: `docker exec netops-api printenv L2_DISCOVER_SSH_ENABLED` → `true`
- [ ] `GET /api/healthz` → 200
- [ ] `GET /api/l2-circuits` (com auth) → 200
- [ ] Device alvo tem `ip_address` preenchido
- [ ] Device alvo tem `password_encrypted` preenchido
- [ ] `decrypt(passwordEncrypted)` OK (via `test-connection` ou job sem erro de credencial)
- [ ] Device é **Huawei VRP** (`vendor=huawei`, `platform=vrp`)
- [ ] Allowlist validada (4 comandos acima)
- [ ] Auth curl OK (`POST /api/auth/login`)
- [ ] Sem comandos destrutivos / sem `system-view`
- [ ] Sem NetBox write
- [ ] Escopo **1 device** apenas (`device_id=1` recomendado)
- [ ] Janela aprovada por operador NOC
- [ ] Rollback documentado (flag `false` + rebuild)

### Checklist NO-GO (parar)

- [ ] Flag ainda `false`
- [ ] API não rebuildada após mudar flag
- [ ] Device sem IP / sem senha / decrypt falha
- [ ] Vendor não Huawei ou platform não VRP
- [ ] Qualquer comando fora da allowlist planejada
- [ ] Smoke em mais de 1 device na mesma janela

---

## Critério GO — liberar execução

Smoke **só pode rodar** quando:

1. Todos os itens do checklist GO marcados.
2. `L2_DISCOVER_SSH_ENABLED=true` **e** `netops-api` reiniciado com imagem nova.
3. Pré-flight `test-connection` no device 1 retorna `success: true` (recomendado).
4. Operador confirma: **read-only**, sem mudança de config no equipamento.

---

## Critério de sucesso (pós-smoke)

| # | Critério | Como verificar |
|---|----------|----------------|
| 1 | `POST /api/l2-circuits/discover` → **202** | curl + JSON `run_id` |
| 2 | Mesmo `run_id` em `l2_discovery_jobs` | poll + SQL abaixo |
| 3 | Poll → `status: completed` **ou** `failed` com `error_message` claro | GET discovery-jobs |
| 4 | Se `completed`: `circuit_count` ≥ 0 (≥1 se device tem L2VC/VSI) | poll + GET list |
| 5 | Linhas em `l2_circuits` com `discovery_run_id` = `run_id` | SQL / GET list |
| 6 | `raw_evidence` sem password/community/token em claro | GET circuit detail |
| 7 | Logs API sem senha/token/community | `docker logs netops-api` (amostra) |
| 8 | Apenas comandos allowlist | auditoria código + sem erro “Command not allowed” |

**Nota:** status de job é `completed` | `failed` | `running` (não existe `success`).

---

## Procedimento — comandos exatos

**Base URL:** `http://127.0.0.1:8080` (ajuste `API_PORT` no `.env` se diferente)  
**Auth:** cookie `netops_session` ou `Authorization: Bearer <token>`  
**Login body:** `email` + `password` (não `username` — ver `routes/auth.ts`)

Substitua:

- `<ADMIN_EMAIL>` — valor de `ADMIN_EMAIL` no `.env`
- `<ADMIN_PASSWORD>` — valor de `ADMIN_PASSWORD` no `.env`
- `<RUN_ID>` — retornado no POST discover
- `<CIRCUIT_ID>` — id numérico de `GET /api/l2-circuits`

### 0) Pré-flight (flag ainda false — seguro)

```bash
cd /path/to/114-4WNET_NetOps

curl -s http://127.0.0.1:8080/api/healthz

docker exec netops-db psql -U netops -d netops -c '\dt l2_*'

docker exec netops-api printenv L2_DISCOVER_SSH_ENABLED
# esperado hoje: false
```

### 1) Habilitar SSH L2 (só no momento do smoke)

Editar `.env` na raiz:

```bash
L2_DISCOVER_SSH_ENABLED=true
```

### 2) Rebuild API

```bash
docker compose up -d --build api

# aguardar healthy
docker compose ps api
docker exec netops-api printenv L2_DISCOVER_SSH_ENABLED
# deve imprimir: true
```

### 3) Login

```bash
curl -s -c cookies.txt \
  -X POST http://127.0.0.1:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"<ADMIN_EMAIL>","password":"<ADMIN_PASSWORD>"}'
```

Guardar `token` do JSON se preferir Bearer:

```bash
export TOKEN="<token_do_json>"
# curl -H "Authorization: Bearer $TOKEN" ...
```

### 4) Health + lista L2 (pré-discover)

```bash
curl -s http://127.0.0.1:8080/api/healthz

curl -s -b cookies.txt \
  http://127.0.0.1:8080/api/l2-circuits
```

### 5) (Recomendado) Teste SSH genérico — 1 device

```bash
curl -s -b cookies.txt \
  -X POST http://127.0.0.1:8080/api/devices/1/test-connection
```

### 6) Iniciar discovery L2 — **UM device**

```bash
curl -s -b cookies.txt \
  -X POST http://127.0.0.1:8080/api/l2-circuits/discover \
  -H "Content-Type: application/json" \
  -d '{"device_id":1}'
```

Resposta esperada **202**:

```json
{
  "run_id": "disc-l2-1-<timestamp>",
  "device_id": 1,
  "status": "running",
  "started_at": "..."
}
```

Copiar `<RUN_ID>`.

### 7) Polling do job

```bash
# repetir a cada 2–5s até completed ou failed
curl -s -b cookies.txt \
  "http://127.0.0.1:8080/api/l2-circuits/discovery-jobs/<RUN_ID>"
```

Timeout SSH por comando: até **300s** (lib ssh). Planejar poll por **≥5 min** se device lento.

### 8) Listar circuitos do device

```bash
curl -s -b cookies.txt \
  "http://127.0.0.1:8080/api/l2-circuits?device_id=1"
```

### 9) Detalhe de um circuito

```bash
curl -s -b cookies.txt \
  "http://127.0.0.1:8080/api/l2-circuits/<CIRCUIT_ID>"
```

### 10) Verificação SQL (opcional)

```bash
docker exec netops-db psql -U netops -d netops -c \
  "SELECT run_id, device_id, status, circuit_count, findings_count, error_message
   FROM l2_discovery_jobs WHERE run_id = '<RUN_ID>';"

docker exec netops-db psql -U netops -d netops -c \
  "SELECT id, circuit_type, name, vc_id, vsi_name, peer_ip,
          length(raw_evidence) AS ev_len, discovery_run_id
   FROM l2_circuits WHERE device_id = 1
   ORDER BY id DESC LIMIT 20;"
```

---

## Rollback (após smoke)

```bash
# 1) Desligar SSH L2 no .env
L2_DISCOVER_SSH_ENABLED=false

# 2) Rebuild API
docker compose up -d --build api

# 3) Confirmar
docker exec netops-api printenv L2_DISCOVER_SSH_ENABLED
# false

curl -s http://127.0.0.1:8080/api/healthz
```

Nenhum rollback no equipamento é necessário (somente `display`).

---

## Evidências a coletar (operador)

1. JSON completo do POST 202 + poll final.
2. `GET /api/l2-circuits?device_id=1` (contagem).
3. Um `GET /api/l2-circuits/<id>` com `raw_evidence` (confirmar redact).
4. Trecho manual CLI no device (opcional, operador humano):

   ```text
   display mpls l2vc verbose
   display vsi verbose
   ```

5. Comparar `vc_id` / `vsi_name` / `peer_ip` CLI vs API (amostra 2–3 circuitos).

Salvar em: `reports/l2-circuits/PHASE_1_1_HUAWEI_SMOKE_RESULTS.md` (pós-execução).

---

## Falhas esperadas (controladas)

| Sintoma | Causa provável | Ação |
|---------|----------------|------|
| 422 `DEVICE_CREDENTIALS_NOT_CONFIGURED` | senha vazia / decrypt | corrigir device no DB |
| Job `failed` + SSH disabled | flag `false` | habilitar flag + rebuild |
| Job `failed` + auth SSH | credencial/AAA device | `test-connection`, NOC |
| Job `completed`, `circuit_count: 0` | device sem L2VC/VSI | OK se lab sem L2; validar CLI |
| `Command not allowed` | bug allowlist | **abort**, não repetir |
| Timeout | device lento | aumentar janela poll; não re-POST em loop |

---

## Estado GO/NO-GO (agora)

| Fase | Decisão |
|------|---------|
| Executar smoke **agora** | **NO-GO** (`L2_DISCOVER_SSH_ENABLED=false`) |
| Plano + pré-validação Docker/API/DB | **GO** |
| Executar após checklist + flag + rebuild | **GO condicional** |

---

## Referências

- `docs/l2-circuits/MVP.md`
- `reports/l2-circuits/MVP_VALIDATION_REPORT.md`
- `reports/l2-circuits/MVP_RUNTIME_HOTFIX_REPORT.md`
- `tools/l2-api-smoke.mjs`
- `workspace/artifacts/api-server/src/modules/l2circuits/collectors/ssh.collector.ts`
