# Runbook — L2 Circuit Discovery (NOC)

**Versão:** MVP 1.7 (2026-05-23)  
**Default:** `L2_DISCOVER_SSH_ENABLED=false` — discover **bloqueado** até habilitar flag.

---

## Pré-requisitos

- Docker stack NetOps up (`netops-api`, `netops-db`)
- Device cadastrado: `ip_address`, `password_encrypted`, `vendor=huawei`, `platform=vrp`
- Credenciais admin API (`ADMIN_EMAIL`, `ADMIN_PASSWORD` no `.env`)
- Janela NOC aprovada — **1 device por execução**

---

## 1. Pré-check (flag OFF)

```bash
grep L2_DISCOVER_SSH_ENABLED .env
# esperado: false

docker exec netops-api printenv L2_DISCOVER_SSH_ENABLED
# esperado: false

curl -s http://127.0.0.1:8085/api/healthz
# {"status":"ok"}
```

Checklist completo: `SAFE_EXECUTION_CHECKLIST.md`.

---

## 2. Habilitar SSH L2 (temporário)

Editar `.env` na raiz do repo:

```bash
L2_DISCOVER_SSH_ENABLED=true
```

Rebuild API (**sempre** após mudar flag):

```bash
cd /path/to/114-4WNET_NetOps
docker compose up -d --build api
sleep 5
docker exec netops-api printenv L2_DISCOVER_SSH_ENABLED
# deve retornar: true
```

---

## 3. Login API

```bash
API=http://127.0.0.1:8085

curl -s -c /tmp/netops-cookies.txt -X POST "$API/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"SEU_EMAIL","password":"SUA_SENHA"}'
```

Guardar cookie ou token Bearer para próximos passos.

---

## 4. Teste SSH (recomendado)

```bash
DEVICE_ID=1   # ou 2 para S6730

curl -s -b /tmp/netops-cookies.txt -X POST "$API/api/devices/$DEVICE_ID/test-connection"
# success: true
```

---

## 5. Discover (1 device)

```bash
curl -s -b /tmp/netops-cookies.txt -X POST "$API/api/l2-circuits/discover" \
  -H "Content-Type: application/json" \
  -d "{\"device_id\": $DEVICE_ID}"
```

Resposta **202**:

```json
{
  "run_id": "disc-l2-1-1779575076582",
  "device_id": 1,
  "status": "running",
  "started_at": "..."
}
```

Copiar `run_id`.

---

## 6. Polling job

```bash
RUN_ID=disc-l2-1-1779575076582

curl -s -b /tmp/netops-cookies.txt "$API/api/l2-circuits/discovery-jobs/$RUN_ID"
```

Repetir a cada **5s** até `status` = `completed` ou `failed`.

| status | Ação |
|--------|------|
| `running` | aguardar |
| `completed` | ver `circuit_count`, `findings_count` |
| `failed` | ler `error_message`; não insistir loop |

Timeout sugerido: **10 min** (config interface pesado).

Scripts prontos:

- Device 1 dot1q: `tools/phase-1-4-smoke-run.mjs`
- Device 2 S6730: `tools/phase-1-6-s6730-smoke-run.mjs`

```bash
set -a && source .env && set +a
export API_BASE=http://127.0.0.1:8085
export SMOKE_DEVICE_ID=2
node tools/phase-1-6-s6730-smoke-run.mjs
```

---

## 7. Consultar circuitos

```bash
# todos do device
curl -s -b /tmp/netops-cookies.txt "$API/api/l2-circuits?device_id=$DEVICE_ID&limit=200"

# filtrar DOWN
curl -s -b /tmp/netops-cookies.txt "$API/api/l2-circuits?device_id=$DEVICE_ID&status=DOWN"

# filtrar tipo
curl -s -b /tmp/netops-cookies.txt "$API/api/l2-circuits?device_id=$DEVICE_ID&circuit_type=vpws"

# detalhe
curl -s -b /tmp/netops-cookies.txt "$API/api/l2-circuits/42"
```

SQL ops:

```sql
SELECT circuit_type, count(*) FROM l2_circuits
WHERE device_id = 1 GROUP BY circuit_type;

SELECT run_id, status, circuit_count, findings_count, error_message
FROM l2_discovery_jobs WHERE device_id = 1
ORDER BY started_at DESC LIMIT 5;
```

---

## 8. Rollback obrigatório

**Sempre** após discover, mesmo se job falhou:

```bash
# 1. .env
sed -i 's/L2_DISCOVER_SSH_ENABLED=true/L2_DISCOVER_SSH_ENABLED=false/' .env

# 2. recreate com env explícito (evita override shell)
L2_DISCOVER_SSH_ENABLED=false docker compose up -d --force-recreate api

# 3. confirmar
docker exec netops-api printenv L2_DISCOVER_SSH_ENABLED
# false

curl -s http://127.0.0.1:8085/api/healthz
```

---

## Troubleshooting

### HTTP 404 — circuito ou job

| Sintoma | Causa provável | Ação |
|---------|----------------|------|
| 404 job | `run_id` errado | usar run_id exato do POST discover |
| 404 circuito | id inexistente | listar com `GET /l2-circuits?device_id=N` |

### HTTP 422 — discover

| Sintoma | Causa | Ação |
|---------|-------|------|
| 422 device | sem IP/senha | completar cadastro device |
| 422 cred | decrypt falha | verificar `SESSION_SECRET` + password_encrypted |

### Job `failed`

| error_message (exemplo) | Ação |
|-------------------------|------|
| `L2 SSH discovery is disabled` | flag false no container → rebuild com true |
| `SSH session timed out` | device lento; retry 1x; não loop |
| `Command not allowed` | bug config — escalar dev |
| `SSH collection failed` | rede/cred/firewall; test-connection |

### circuit_count = 0

| Device | Esperado | Se zero |
|--------|----------|---------|
| RX (1) | ~131 vlan_local | flag off, job failed, ou parser sem config interface |
| S6730 (2) | ~82 L2VC + VSI | verbose vazio OK se `display mpls l2vc` OK |

---

## Verificar logs sem segredo

```bash
docker logs netops-api --since 30m 2>&1 | \
  grep -iE 'password|token|community|cipher|simple|secret' | \
  grep -vi redacted
# esperado: vazio
```

Nunca colar output SSH bruto com credenciais em ticket.

---

## Devices piloto validados

| device_id | Hostname NetOps | Perfil | Expectativa |
|-----------|-----------------|--------|-------------|
| 1 | 4WNET-BVA-BRT-RX | NE edge dot1q | ~131 vlan_local |
| 2 | 4WNET-BVA-BRT-RA | S6730 (nome CLI: BRT-A_S6730) | ~82 L2VC/VPWS + VSI |

---

## Referências

- `MVP.md`
- `SAFE_EXECUTION_CHECKLIST.md`
- `SUPPORTED_SCENARIOS.md`
- `reports/l2-circuits/MVP_L2_DISCOVERY_CLOSURE_REPORT.md`
