# Deploy — NetOps Bastion (cliente)

Instala o **connector-agent** no host do cliente para executar jobs do NetOps Server (SSH/SNMP/ping) na rede local.

## Pré-requisitos

- Docker Engine + Compose v2
- Connector criado no NetOps (nome + token)
- Rotas até a LAN dos equipamentos (ex.: L2TP `ppp0` via netops-cli)

## Instalação

```bash
cd deploy/bastion
chmod +x install-from-netops-cli.sh

# Opção A — a partir do netops-cli já configurado
./install-from-netops-cli.sh
docker compose up -d --build

# Opção B — manual
cp .env.example .env
nano .env
docker compose up -d --build
```

## Verificar

```bash
docker logs -f netops-connector-agent
# Deve aparecer: processed N job(s), job id=... completed success=true
```

No NetOps UI: connector **ONLINE**, device com `accessMode: connector` deve passar em **Test connectivity**.

## Diretórios

| Path | Uso |
|------|-----|
| `.env` | Token e URL (não commitar) |
| `config/` | Config opcional WG |
| `logs/` | Logs do agent |

## Coexistência com netops-cli

| netops-cli | connector-agent |
|------------|-----------------|
| UI, L2TP, WG provision | Fila de jobs da API |
| Heartbeat (opcional duplicado) | Heartbeat + poll |

Recomendação: manter heartbeat no CLI; agent foca em **jobs**. Ambos usam `network_mode: host`.

Documentação completa: [docs/connectors/BASTION_CLIENT_PRODUCT.md](../../docs/connectors/BASTION_CLIENT_PRODUCT.md)
