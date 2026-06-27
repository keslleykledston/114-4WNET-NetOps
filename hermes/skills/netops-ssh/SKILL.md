---
name: netops-ssh
description: >-
  SSH read-only em equipamentos de rede via connector WireGuard. Use para
  display/show/ping/traceroute em devices Huawei e similares na plataforma NetOps.
---

# NetOps SSH Operator

Executa comandos **read-only** em equipamentos via connector agent (produção) ou path direto (lab).

## Política read-only

Comandos permitidos:
- `display ...` (Huawei)
- `show ...` (outros vendors)
- `ping ...`, `traceroute ...`, `tracert ...`

**Bloqueados:** `configure`, `commit`, `system-view`, `undo`, pipes com `|`, redirecionamentos, subshell.

Política espelhada em:
- `workspace/artifacts/api-server/src/modules/connectors/ssh-readonly-policy.ts`
- `infra/connector-agent/agent/security.py`

## Script principal

```bash
# Via connector (recomendado)
./hermes/scripts/netops-ssh.sh <device_id|hostname> "<comando>"

# Exemplos
./hermes/scripts/netops-ssh.sh 1 "display version"
./hermes/scripts/netops-ssh.sh router-core-01 "display interface brief"
```

## Pré-requisitos

1. API NetOps rodando (`docker compose up -d`)
2. Connector agent ativo e conectado via WireGuard
3. Device com `connector_id` configurado
4. Flags SSH habilitadas se necessário (`L2_DISCOVER_SSH_ENABLED`, `BGP_DRILLDOWN_SSH_DETAIL_ENABLED`)

## Alternativas internas

| Método | Quando |
|--------|--------|
| `tools/device-ssh-via-connector.sh` | Bash direto (mesma lógica) |
| `workspace/artifacts/api-server/scripts/run-device-ssh.mjs` | Dentro do container `netops-api` |
| API `POST /api/devices/:id/diagnostics` | Diagnóstico estruturado |

## Comandos Huawei úteis (read-only)

```text
display version
display interface brief
display ip routing-table
display bgp peer
display mpls l2vc
display vsi
display current-configuration interface <iface>
```

## Troubleshooting

| Sintoma | Causa provável |
|---------|----------------|
| Job TIMEOUT | Device inacessível ou WG down |
| FAILED policy | Comando bloqueado pela política read-only |
| 503 | Feature flag OFF |
| Device not found | ID/hostname incorreto no DB |

Nunca logar senhas ou `password_encrypted`.
