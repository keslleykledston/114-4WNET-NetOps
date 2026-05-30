# NetOps Bastion — produto cliente

O **bastião NetOps** é o software instalado no **host do cliente** para que o NetOps Server alcance equipamentos em redes privadas (10.x / 192.168.x) sem expor SSH/SNMP na internet.

## Componentes

| Componente | Função | Obrigatório |
|------------|--------|-------------|
| **netops-cli** | UI local, L2TP/IPsec, WireGuard, diagnósticos manuais, provisionamento WG | Recomendado (VPN + operação) |
| **connector-agent** | Heartbeat + **execução da fila de jobs** (ping, SSH, SNMP) para o NetOps Server | **Obrigatório** para coletas automáticas |
| **NetOps Server** | API central, UI, fila `connector_jobs`, credenciais cifradas | SaaS / seu datacenter |

```text
┌─────────────────────┐         HTTPS          ┌──────────────────────┐
│   NetOps Server     │ ◄──── heartbeat ────── │  connector-agent     │
│   (API + UI)        │ ◄──── jobs/result ──── │  (host network)      │
└─────────────────────┘                        └──────────┬───────────┘
                                                            │ L2TP / LAN
                                                            ▼
                                                 ┌──────────────────────┐
                                                 │ 10.200.3.1, .4.1, …  │
                                                 │ routers / switches     │
                                                 └──────────────────────┘
```

### O que estava quebrado

O **netops-cli** enviava heartbeat e provisionava WireGuard, mas **não consumia** `GET /api/connectors/jobs/pending`. Jobs ficavam `PENDING`/`TIMEOUT` e devices permaneciam `unreachable`.

A correção é rodar o **connector-agent** (este repositório, `infra/connector-agent`) no mesmo host, com o **mesmo token** do connector.

## Instalação rápida (cliente)

```bash
cd deploy/bastion
cp .env.example .env
# Editar CONNECTOR_NAME, CONNECTOR_TOKEN, NETOPS_SERVER_URL

docker compose up -d --build
docker logs -f netops-connector-agent
```

### Com netops-cli já configurado

```bash
cd deploy/bastion
./install-from-netops-cli.sh   # lê token/URL de /etc/netops-cli/runtime/wireguard_provision.json
docker compose up -d --build
```

### Variáveis críticas

| Variável | Exemplo |
|----------|---------|
| `CONNECTOR_NAME` | `4WNET_BVA` (igual ao cadastro no NetOps) |
| `CONNECTOR_TOKEN` | `nc_…` (copiado uma vez na criação do connector) |
| `NETOPS_SERVER_URL` | `https://4wnet.devops.k3gsolutions.com.br` |
| `JOB_POLL_INTERVAL` | `10` (segundos) |

Use **`network_mode: host`** — o agent precisa das mesmas rotas que o L2TP (`ppp0`) do netops-cli.

## Fluxo operacional (como deve funcionar)

1. **Admin** cria tenant + connector no NetOps → recebe **token** (uma vez).
2. **Cliente** instala bastião: netops-cli (VPN) + connector-agent (jobs).
3. **Cliente** associa devices ao tenant → NetOps grava `devices.connector_id`.
4. **Operador** dispara teste/coleta → API enfileira job `SSH_COMMAND` / `PING` / `SNMP_*` com credenciais no payload (cifrado no servidor).
5. **Agent** faz poll → executa na LAN → `POST /api/connectors/jobs/:id/result`.
6. **API** marca job `SUCCESS` e atualiza device `active` + `lastSeen`.

### Tipos de job suportados

`PING`, `TRACEROUTE`, `TCP_CHECK`, `ROUTE_CHECK`, `SNMP_GET`, `SNMP_WALK`, `SSH_COMMAND`, `WG_STATUS`

Política SSH: **somente leitura** (`display`, `show`, etc.) — ver `infra/connector-agent/docs/SECURITY.md`.

## Validação pós-instalação

```bash
# No servidor NetOps (com sessão admin)
curl -b cookies.txt -X POST "$NETOPS/api/devices/43/test-connectivity"

# No host do bastião
docker logs netops-connector-agent | tail -20
```

Esperado: job `SSH_COMMAND` com `success: true` e device saindo de `unreachable`.

## Roadmap — produto cliente

### MVP (atual + esta correção)

- [x] Fila de jobs na API
- [x] connector-agent com poll + executor
- [x] Deploy `deploy/bastion/`
- [x] Atualizar `lastSeen` / `active` ao concluir job com sucesso
- [ ] Instalador único (CLI + agent no mesmo compose)
- [ ] Token rotation sem reinstalar

### v1 — Instalável “como appliance”

- Pacote `.deb` / script `install.sh` (Docker + systemd)
- Wizard: URL NetOps + colar token + teste automático ping 10.200.3.1
- Health endpoint local `:9100/health` para NOC
- Métricas Prometheus (jobs/s, falhas, RTT médio)
- Atualização in-place (`docker compose pull`)

### v1.1 — Operação

- UI netops-cli: status da fila (“último job”, “agent online”)
- Logs centralizados opcionais (syslog / Loki forward)
- Modo **split tunnel** WG (não capturar 10.200.0.0/16 no túnel se L2TP já cobre)
- Documentação PDF / runbook por tenant

### v2 — Escala e segurança

- Assinatura de jobs (HMAC job_id + payload)
- mTLS connector ↔ server
- Rate limit e concorrência configurável
- Suporte a múltiplos connectors no mesmo host (namespaces)
- NETCONF / gNMI read-only (além de SSH)

### v2+ — Comercial

- Licenciamento por connector / device count
- Telemetria de uso anonimizada (opt-in)
- Suporte a HA (dois agents, leader election)
- Integração ITSM (webhook job failed)

## Referências

- [PHASE_2_CONNECTOR_AGENT.md](./PHASE_2_CONNECTOR_AGENT.md)
- [DEVICE_ACCESS_MODES.md](./DEVICE_ACCESS_MODES.md)
- [WIREGUARD_HUB.md](./WIREGUARD_HUB.md)
- [infra/connector-agent/README.md](../../infra/connector-agent/README.md)
- [deploy/bastion/README.md](../../deploy/bastion/README.md)
