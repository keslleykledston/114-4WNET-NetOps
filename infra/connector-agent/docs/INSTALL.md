# Instalação — NetOps Connector Agent

## Pré-requisitos (host do cliente)

- Docker Engine + Docker Compose v2
- Linux com kernel WireGuard (quando `WG_ENABLED=true`)
- Acesso de rede do host à LAN dos equipamentos (SSH/SNMP/ICMP)
- Acesso HTTP(S) ao **NetOps Server** (via Internet ou túnel WG)
- Connector criado no NetOps UI com **token** (copiado uma vez)

## Passos

```bash
cd infra/connector-agent
cp .env.example .env
# Editar .env: CONNECTOR_TOKEN, NETOPS_SERVER_URL, CONNECTOR_NAME
docker compose up -d --build
docker logs -f netops-connector-agent
```

## Validar heartbeat

1. No NetOps UI: **Infraestrutura → Conectores** — status deve ir para **ONLINE**
2. Ou verificar log local: `grep heartbeat logs/agent.log`

## Validar job PING

No NetOps (detalhe do connector → Diagnóstico), enfileire ping para um IP da LAN do cliente.

No agent:

```bash
grep "executing job" logs/agent.log
grep "job id=" logs/agent.log
```

## Instalação com netops-cli (bastião completo)

O **netops-cli** (UI/VPN) não executa a fila de jobs da API. Instale também o **connector-agent**:

```bash
cd deploy/bastion
./install-from-netops-cli.sh
docker compose up -d --build
```

Ver [docs/connectors/BASTION_CLIENT_PRODUCT.md](../../../docs/connectors/BASTION_CLIENT_PRODUCT.md).

## WireGuard (futuro)

1. Gerar config no NetOps (`GET /api/connectors/{id}/wireguard/config`)
2. Salvar em `config/wireguard/netops.conf`
3. Definir `WG_ENABLED=true` no `.env`
4. Reiniciar: `docker compose up -d`

## Troubleshooting

| Sintoma | Ação |
|---------|------|
| 401 no heartbeat | Verificar `CONNECTOR_TOKEN` |
| Cannot reach healthz | URL, firewall, rota até NetOps |
| Jobs não executam | Confirmar agent ONLINE; ver jobs PENDING no servidor |
| SSH blocked exit 126 | Comando violou política read-only |
| WG DOWN | `WG_CONFIG_PATH`, `modprobe wireguard`, logs `wg-up` |
