# Rollback Policy

## Regra

Rollback automático dispara quando update cruza qualquer etapa crítica e falha:

- build backend
- build frontend
- tests/typecheck
- migrations
- restart
- healthcheck
- validation final

## Ordem do rollback

1. Abortar execução ativa.
2. Voltar checkout para commit anterior.
3. Restaurar dump de banco, se criado.
4. Subir containers novamente.
5. Revalidar healthchecks.
6. Registrar resultado em `system_update_runs`.

## Estados

- `rolled_back`
- `rollback_failed`
- `rollback_in_progress`

## Manual rollback

Endpoint: `POST /api/system/update/runs/:id/rollback`

Uso:

- quando update terminou com falha
- quando rollback automático deixou estado inconsistente
- quando admin quer forçar retorno ao commit anterior

## Segurança

- Sem comandos livres do frontend.
- Sem rollback se usuário não for admin.
- Sem rollback manual sem a permissão `systemUpdate.rollback`.
- Logs sanitizados.
