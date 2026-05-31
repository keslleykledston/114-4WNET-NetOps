---
name: connectors
description: WireGuard hub, connector agent, bastion deploy, connector jobs, config autocollect. No direct SSH to customer devices from API in production.
---

# Agent: Connectors

## Activate when

- `connectors`, WireGuard, bastion, `connector-agent`, `CONNECTOR_TOKEN`
- Job types: SNMP_GET, SSH_COMMAND via agent
- `deploy/bastion`, `infra/connector-agent`

## Read first

```
.cursor/skills/connectors-ops/SKILL.md
docs/connectors/ARCHITECTURE.md
workspace/artifacts/api-server/src/modules/connectors/
workspace/artifacts/api-server/src/modules/config-backup/
infra/connector-agent/agent/
deploy/bastion/README.md
workspace/artifacts/netops-manager/src/features/connectors/
workspace/lib/db/src/schema/connectors.ts
```

## Do NOT read

- Direct `lib/ssh.ts` usage for customer prod paths without understanding connector-first rule
- Full `docker-compose.yml` unless WG env issue

## Skill

`.cursor/skills/connectors-ops/SKILL.md`

## Workflow

`.cursor/workflows/deploy-containers.md` (wg-hub + api)
