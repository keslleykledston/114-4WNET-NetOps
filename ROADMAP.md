# Roadmap

## v0.3.0 — Gestão de usuários e autorizações

- Tela `/users` com listagem CRUD.
- Criar/editar/desabilitar usuários locais.
- Reset de senha com token temporário.
- Papéis: viewer, operator, admin (existentes).
- Permissões granulares por módulo (devices, compliance, scheduler, reports).
- Audit log de ações de usuário (criação, disable, senha, role change).
- Sessão com timeout configurável.
- Session revoke manual por admin.

## v0.3.1 — Import/Export de dispositivos

- Import: CSV/XLSX/TXT com preview pré-aplicação.
- Validação de IP/hostname.
- Deduplicação por hostname/IP.
- Não sobrescrever credenciais criptografadas.
- Export: CSV/XLSX/JSON de selecionados (sem secrets).
- Preservar metadata (site, role, vendor, platform).
- Histórico de imports (audit trail).

## v0.3.2 — Download/export de relatórios de compliance

- Botão download no painel compliance.
- Export por job (findings filtrados).
- Formatos: Markdown, JSON, CSV (PDF futuro).
- Evidence sanitizada (sem payloads brutos).
- Incluir summary de severidade, contexto e categoria operacional.
- Timestamp e versão do job.

## v0.3.3 — Pilot operacional NOC

- Validação com operadores reais em NOC.
- Feedback de UX, performance e operabilidade.
- Ajustes de densidade visual (dark mode, tabelas compactas).
- Monitoramento de uptime dashboard.
- Alerts em tempo real para findings críticos.

---

## v0.2.9+ Roadmap (Em Andamento)

- Apply discovery persistence migration in managed environments and wire it into the deployment process.
- Expand Huawei VRP parsers beyond first-pass route-policy nodes, community-list, VSI and L2VC detail.
- Add live protected route search with mandatory filters and 50-route sample cap.
- Add CI tests once a test runner is introduced for API and frontend packages.
- Expand compliance v2 thresholds and per-customer policy tuning after source/confidence baseline.
- Formalize audit/report retention and export policies.
- Keep provisioning apply locked behind an explicit safety flag until safe allowlisted apply steps are designed and tested.
- Finish RBAC hardening: session expiry policy, password reset flow, and richer permission UI.
- Expand scheduler support later with cron parser and richer run history filters.
- Validate NetBox read-only sync against a real NetBox instance when `NETBOX_URL` and `NETBOX_TOKEN` are available.
- Add dedicated local columns for NetBox tenant/site/role IDs if the next release needs richer inventory lineage.
