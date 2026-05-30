# Hub WireGuard — configuração do NetOps

O endpoint `POST /api/connectors/wireguard/provision` devolve a chave **pública do servidor VPN (hub)**, não a chave do connector.

| Chave | Onde fica | Uso |
|-------|-----------|-----|
| **Hub** (`NETOPS_WG_SERVER_PUBLIC_KEY`) | Servidor WireGuard central | Vai no `[Peer] PublicKey` do `netops.conf` do cliente |
| **Connector** (`wireguard_public_key` no banco) | Gerada ao criar o connector | Peer no `wg0` do hub (`AllowedIPs = 10.255.x.x/32`) |

Se `NETOPS_WG_SERVER_PUBLIC_KEY` estiver vazio no processo da API, o provisionamento retorna **503** `WG_SERVER_PUBLIC_KEY_MISSING`.

## 1. Gerar par de chaves do hub (no servidor VPN)

No host que escuta UDP **51820** (hub):

```bash
umask 077
wg genkey | tee /etc/wireguard/netops-hub.private | wg pubkey | tee /etc/wireguard/netops-hub.public
cat /etc/wireguard/netops-hub.public
```

Copie a linha base64 (44 caracteres, termina em `=`).

## 2. Configurar o NetOps API

No `.env` do deploy (Docker Compose, systemd, Kubernetes Secret, etc.):

```bash
NETOPS_WG_SERVER_PUBLIC_KEY=<conteúdo de netops-hub.public>
NETOPS_WG_ENDPOINT=<hostname-ou-ip-publico-do-hub>:51820
NETOPS_WG_DEFAULT_ALLOWED_IPS=10.0.0.0/8,192.168.0.0/16
NETOPS_WG_SERVER_ADDRESS=10.255.0.1
NETOPS_WG_IP_POOL_BASE=10.255.0.
```

Reinicie **apenas** o serviço da API para carregar as variáveis.

**Docker Compose (stack completa neste repositório)**

Serviços relevantes: `api` (provisionamento) e `wg-hub` (hub UDP 51820).

O Compose lê o `.env` na **raiz do projeto** (mesmo diretório que `docker-compose.yml`) e injeta no serviço `api`:

```bash
cd /caminho/114-4WNET_NetOps

# 1) Editar .env (criar a partir de .env.example se não existir)
nano .env
```

Adicione ou descomente (sem aspas, uma linha):

```bash
NETOPS_WG_SERVER_PUBLIC_KEY=<chave pública base64 do hub>
NETOPS_WG_HUB_PRIVATE_KEY=<chave privada correspondente — só no .env, não commitar>
NETOPS_WG_ENDPOINT=4wnet.devops.k3gsolutions.com.br:51820
NETOPS_WG_DEFAULT_ALLOWED_IPS=10.0.0.0/8,192.168.0.0/16
NETOPS_WG_PORT=51820
```

```bash
# 2) Sincronizar peers no hub e subir serviços
./tools/wireguard-hub-sync-peers.sh
docker compose up -d api wg-hub

# 3) Confirmar dentro do container
docker exec netops-api printenv NETOPS_WG_SERVER_PUBLIC_KEY
docker exec netops-api printenv NETOPS_WG_ENDPOINT
```

Deve imprimir a chave e o endpoint. Se `NETOPS_WG_SERVER_PUBLIC_KEY` vier vazio:

- o `.env` não está na raiz do `docker compose`, ou
- a linha está comentada/vazia, ou
- foi editado `.env` mas não rodou `docker compose up -d api` (recria o container).

**Importante:** o hub WireGuard **não** precisa rodar dentro do mesmo `docker compose` do NetOps. Só a **chave pública** e o **endpoint** entram no `.env` da API. O processo `wg` fica em outra VM/host com UDP 51820 aberto.

## 3. Exemplo mínimo de `wg0` no hub

```ini
[Interface]
Address = 10.255.0.1/24
ListenPort = 51820
PrivateKey = <conteúdo de netops-hub.private>

# Um bloco [Peer] por connector (chave pública do connector no NetOps UI)
[Peer]
PublicKey = x/4rGEb6luoozWLmqHUpqq4oLlSkhe+onJxtIRQJy1w=
AllowedIPs = 10.255.0.83/32
```

A `PublicKey` do peer é a chave **do connector** (visível no NetOps ou no log do agente). O IP `/32` é o `wireguard_ip` atribuído na criação do connector.

```bash
wg-quick up wg0
# ou
systemctl enable --now wg-quick@wg0
```

## 4. Validar provisionamento

```bash
curl -sS -X POST 'https://SEU-NETOPS/api/connectors/wireguard/provision' \
  -H "Authorization: Bearer <CONNECTOR_TOKEN>" \
  | jq '{server_public_key, endpoint, wireguard_ip, code}'
```

Sucesso esperado:

- `server_public_key` preenchido (igual a `NETOPS_WG_SERVER_PUBLIC_KEY`)
- `endpoint` e `wireguard_ip` preenchidos
- sem campo `code`

## 5. Erro que você viu

```json
{
  "code": "WG_SERVER_PUBLIC_KEY_MISSING",
  "error": "WireGuard server public key is not configured..."
}
```

**Causa:** o processo Node da API não tem `NETOPS_WG_SERVER_PUBLIC_KEY`.

**Não confundir** com `public_key` no log do agente (`x/4rGEb6luoozWLmqHUpqq4oLlSkhe+onJxtIRQJy1w=`): essa é a chave **do cliente**; ela deve ser cadastrada como `[Peer]` no hub, não no `.env` do NetOps.

## 6. Produção (`4wnet.devops.k3gsolutions.com.br`)

1. Definir onde o hub WG roda (VM, firewall, mesmo cluster com hostNetwork, etc.).
2. Publicar `NETOPS_WG_*` no ambiente do **deployment da API** (não só no `.env` do connector).
3. Garantir que `NETOPS_WG_ENDPOINT` seja alcançável **do host do connector** (DNS/firewall UDP 51820).
4. Após restart da API, repetir o provisionamento no agente.

O NetOps **não** sobe o hub WireGuard automaticamente; só entrega credenciais e config para o connector agent montar o túnel.
