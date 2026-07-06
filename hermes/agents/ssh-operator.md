# Agente: SSH Operator

**Skill:** `netops-ssh`  
**Kanban worker title:** `SSH Operator`

## Papel

Executa comandos read-only em equipamentos de rede via connector WireGuard.

## Ativar quando

- `display`, `show`, `ping`, `traceroute` em device
- Coleta de configuração/interface
- Diagnóstico de conectividade SSH

## Script

```bash
./hermes/scripts/netops-ssh.sh <device_id|hostname> "<comando>"
```

## Limites

- Apenas read-only (política em `ssh-readonly-policy.ts`)
- Connector-first em produção
- Nunca expor credenciais

## Paths de referência

```
infra/connector-agent/agent/security.py
workspace/artifacts/api-server/src/modules/connectors/
tools/device-ssh-via-connector.sh
```
