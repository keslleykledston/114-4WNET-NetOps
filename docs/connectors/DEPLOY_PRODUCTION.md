# Deploy Production

## Pré-requisitos

- `SESSION_SECRET` forte e estável
- `CONFIG_APPLY_ENABLED=false`
- `NETOPS_SNMP_REAL_ENABLED` e `L2_*` habilitados apenas quando o ambiente estiver pronto
- banco PostgreSQL com migrations SQL aplicáveis automaticamente pelo serviço `migrate`

## Ordem de deploy

1. Atualizar imagem `api` e `web`.
2. Subir o compose.
3. Esperar o container `migrate` terminar com sucesso.
4. Validar `GET /api/healthz`.
5. Validar `tools/connectors-release-smoke.mjs`.
6. Só então liberar tráfego ou jobs agendados.

## Rollback seguro

- Se a migration nova falhar antes de concluir, corrigir o SQL idempotente e reiniciar o container `migrate`.
- Se a aplicação já foi publicada com problema funcional, reverter a imagem do `api` e `web` para a versão anterior e reaplicar as migrations compatíveis.
- Nunca remova o volume do banco em produção.
- Para rollback de schema incompatível, use backup point-in-time do PostgreSQL.
- O rollback seguro deve preservar `schema_migrations`; nunca remova entradas manualmente sem reconstruir o histórico completo.

## Notas operacionais

- Não há mais passo manual via `psql` para subir o schema.
- O histórico de migrations fica em `schema_migrations`.

## Phase 8.1: Secure Connector Onboarding

A partir da versão com PHASE 8.1, o fluxo de bootstrap de connectors mudou:

### Antes (Phase 7)
```
POST /api/connectors → retorna connector_token no JSON
Admin copia token manualmente
```

### Depois (Phase 8.1)
```
POST /api/connectors → não retorna token
POST /api/connectors/:id/bootstrap-package → download .env (admin only, one-shot)
Agent usa CONNECTOR_TOKEN do .env
```

### Alterações operacionais

1. **Criação de connector:** mesmo endpoint, resposta agora inclui `bootstrap_pending: true` sem token
2. **Entrega de segredo:** novo endpoint `/api/connectors/:id/bootstrap-package` (admin-only)
3. **TTL de token:** 15 minutos após geração
4. **Auditoria:** `connector_bootstrap_issued` registrado para cada download
5. **UI:** novo card "PENDING BOOTSTRAP" com botão de download

### Migração de deployments existentes

- Connectors já ativos continuam funcionando (token herdado permanece válido)
- Novos connectors **devem** usar bootstrap-package (POST sem token no response)
- Não é necessário mudar o agente Python (`CONNECTOR_TOKEN` ainda é lido do env)

Para mais detalhes, veja [SECURE_ONBOARDING.md](./SECURE_ONBOARDING.md).
