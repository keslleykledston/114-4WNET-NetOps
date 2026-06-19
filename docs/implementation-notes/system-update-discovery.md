# System Update Discovery

Data: 2026-06-19

## Achados

- stack do projeto:
  - frontend React/Vite em `workspace/artifacts/netops-manager`
  - backend Express em `workspace/artifacts/api-server`
  - DB Drizzle em `workspace/lib/db`
- migrations safe:
  - `workspace/lib/db/scripts/apply-safe-migrations.mjs`
  - tabela `schema_migrations`
- padrão de auditoria:
  - `audit_logs`
  - helper `logAuditEvent`
- padrão de UI:
  - `Layout` com sidebar admin
  - páginas em `workspace/artifacts/netops-manager/src/pages`

## Decisões

- módulo novo fica em `system-update`
- backend orquestra tudo
- frontend só solicita ação e exibe progresso
- rollback usa commit anterior + backup lógico quando disponível
- permissões separadas por intenção:
  - verify
  - execute
  - rollback

## Limitações conhecidas

- changelog vem de git log
- backup de banco depende de binários `pg_dump` e `pg_restore`
- channel usa branch remoto configurada por env
