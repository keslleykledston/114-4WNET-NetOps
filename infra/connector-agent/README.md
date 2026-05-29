# NetOps Connector Agent (Fase 2)

Agente Python que roda **no host do cliente** e executa jobs read-only na LAN local. Comunica-se apenas com o NetOps Server (heartbeat + fila de jobs).

```text
NetOps Server  ←HTTP→  Connector Agent (host network)  → SSH/SNMP/ICMP  → Equipamentos
```

## Quick start

```bash
cd infra/connector-agent
cp .env.example .env
# Editar CONNECTOR_TOKEN, NETOPS_SERVER_URL, CONNECTOR_NAME
docker compose up -d --build
docker logs -f netops-connector-agent
```

## Por que `network_mode: host`?

O agent precisa usar as **mesmas rotas e interfaces** do host para alcançar IPs da LAN do cliente (10.x, 192.168.x). Rede bridge Docker isolada impediria SSH/SNMP/ping aos equipamentos reais.

## Por que `privileged` + `NET_ADMIN`?

- **WireGuard** (`wg-quick`, rotas via túnel) exige `NET_ADMIN`
- **`ip route get`** e manipulação de interface WG exigem capacidades de rede do host
- O container é um **bastião dedicado** no cliente — não compartilhar com outros workloads

## Estrutura

```text
infra/connector-agent/
├── Dockerfile
├── docker-compose.yml
├── .env.example
├── agent/           # Python 3 — loop, executor, segurança
├── scripts/         # entrypoint, wg-up/down, healthcheck
└── docs/            # INSTALL, SECURITY, OPERATIONS
```

## Selftest (desenvolvimento)

```bash
python3 tools/connector-agent-selftest.py
```

## Documentação

- [INSTALL.md](docs/INSTALL.md)
- [SECURITY.md](docs/SECURITY.md)
- [OPERATIONS.md](docs/OPERATIONS.md)
- Arquitetura geral: [docs/connectors/ARCHITECTURE.md](../../docs/connectors/ARCHITECTURE.md)

## Limitações (fase 2)

- Sem escrita em equipamentos
- Sem NETCONF ainda (compatível futuro)
- WireGuard opcional (`WG_ENABLED=false` por default)
- Credenciais SSH/SNMP vêm no **payload do job** (servidor não envia secrets em logs)
