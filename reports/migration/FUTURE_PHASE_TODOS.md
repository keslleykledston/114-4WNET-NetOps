# Future Phase TODOs

## Estado atual

- FASE 0 concluida: auditoria frontend e relatorio baseline.
- FASE 1 concluida: UX guardrails.
- FASE 2 concluida: arvore operacional com placeholders, sem mudar layout global.
- FASE 3 concluida: APIs read-only, frontend ligado, container aplicado.
- FASE 4 concluida: safety guard, adapters SNMP/SSH read-only stub, parsers Huawei VRP iniciais, botoes BGP, containers aplicados.
- FASE 4.x concluida: filtros BGP no painel (busca, estado, papel, iBGP), role override local (`bgp_peer_role_overrides`), precedencia `manual_override > classifier > snapshot > customer(default)`.
- FASE 4.x.b concluida: contrato BGP de role override e peers VRF-aware documentado em `docs/netops/BGP_ROLE_OVERRIDE_AND_VRF_CONTRACT.md`.
- FASE 4.y concluida: AF filter, Down state, localStorage por device, arvore BGP expandida (CDN/IX/iBGP/Unknown legado), Sheet peer actions, contadores 12, relatorio `PHASE_4Y_BGP_UX_PARITY_REPORT.md`.
- FASE 4.1 pendente: migrar favicon/icone K3G do `60-bgp_manager`.
- FASE 5 concluida: SNMP read-only real ativo, 78 BGP peers IPv4 coletados, schemas + diagnostics.
- FASE 5.1.fix concluida: IF-MIB agora coleta 164 interfaces. Root cause: net-snmp doneCallback passa varbind array em error param. Fix: type-check error antes de rejeitar.
- FASE 5.2 planejada: inventario persistido (interfaces/vrfs/config), SSH config collection read-only.
- FASE 5.3 concluida: Device Discovery persistente com `discovery_runs`, `discovery_snapshots`, `discovery_evidence`, OpenAPI atualizado e client Orval regenerado.
- **FASE 5.4 planejada (2026-05-30):** backup automático de config no SSH via connector — ver `docs/connectors/SSH_CONFIG_BACKUP_PLAN.md`.
- v0.4.0 preview MVP concluida: Provisioning preview & approval workflow — templates L2/L3/BGP (5 tipos), `POST /api/provisioning/preview`, estados draft→approved, UI `/provisioning`, apply bloqueado, docs `PROVISIONING_PREVIEW_WORKFLOW.md`.
- v0.4.x planejada: Provisioning operacional seguro — ver `reports/V0_4_PROVISIONING_OPERATIONAL_PLAN.md` (v0.4.0 engine → v0.4.4 apply readiness doc only).

---

# v0.4.x — Provisioning Operacional Seguro

Plano completo: `reports/V0_4_PROVISIONING_OPERATIONAL_PLAN.md`

## v0.4.0 — Provisioning Preview Engine

- [ ] Completar templates: interface/subinterface, route-policy, community, prefix-list
- [ ] Schema Zod por template + validação PT
- [ ] Render config + rollback preview unificado
- [ ] Selftest `tools/provisioning-preview-selftest.mjs`
- [ ] Seed idempotente `config_templates` ↔ `SERVICE_TEMPLATES`
- [ ] Manter `CONFIG_APPLY_ENABLED=false`

## v0.4.1 — Provisioning UI

- [ ] Wizard `/provisioning` com RBAC por botão
- [ ] `/templates`: view read-only (viewer), edit (operator/admin)
- [ ] Formulário dinâmico driven by `parameterSchema`
- [ ] Preview side-by-side config/rollback
- [ ] Export plano Markdown/JSON

## v0.4.2 — Approval Workflow

- [ ] Estados: draft, validated, pending_approval, approved, rejected, cancelled
- [ ] Permissão `provisioning.approve` (admin ou dedicada)
- [ ] Janela manutenção obrigatória
- [ ] Rollback plan textual obrigatório
- [ ] Audit timeline por job na UI

## v0.4.3 — Dry-run Validation

- [ ] Pré-check read-only vs `discovery_snapshots`
- [ ] Comparar com compliance findings (BLOCKER_REAL bloqueia)
- [ ] Detectar conflito VLAN/VRF/BGP/policy
- [ ] Validar refs route-policy/community/prefix-list na config coletada

## v0.4.4 — Controlled Apply Readiness (doc only)

- [ ] Documentar requisitos para `CONFIG_APPLY_ENABLED=true`
- [ ] Design dupla aprovação + janela manutenção
- [ ] Substituir execute path legado Cisco por adapter Huawei
- [ ] **Não habilitar apply default; sem SSH write em piloto**

---

- FASE 6 planejada: BGP import policy editor preview (seguro, sem apply), route-policy parser, community library read-only.
- FASE 7 planejada: apply real com RBAC, duplo check, auditoria completa, SSH write controlado.
- FASE 8+ pendente: export policy, provisioning seguro com aprovacao.
- FASE 4.1 pendente: migrar favicon/icone K3G do `60-bgp_manager`.

# FASE 5.1.fix: IF-MIB Debugging ✅ CONCLUIDA

## Problema
- BGP4-MIB OK: 78 peers coletados
- IF-MIB falha: 0 interfaces retornadas
- Manual snmpwalk provou IF-MIB funciona no device
- Logo: bug na aplicacao, nao no device

## Root Cause (ENCONTRADO)
net-snmp library callback signature differs from TypeScript interface:
- doneCallback receives varbind array in error param on success
- Code assumed error param = null or Error object
- Any truthy value was treated as error → rejected → data lost

## Solucao (IMPLEMENTADA)
Modified snmp-session.ts feedCallback + doneCallback:
- Type-check error param: Array vs Error vs null
- Only reject on actual Error instances
- Arrays indicate valid response → resolve

## Resultado
✅ interfaces: 0 → 164  
✅ bgpPeers: 51 collected  
✅ OID diagnostics: all status=ok  
✅ No SNMP-WALK-ERROR logs  

Commit: `fix: resolve IF-MIB collection returning 0 interfaces`  
Report: `reports/migration/PHASE_5_1_FIX_IFMIB_RESOLVED.md`

---

# FASE 5.4 — Backup automático de config no SSH (via Connector)

**Checkpoint:** NetOps CLI + SSH/SNMP probe OK; BGP e L2 **não** são coletados no teste atual.

**Plano detalhado:** `docs/connectors/SSH_CONFIG_BACKUP_PLAN.md`

## Objetivo

Toda conexão SSH bem-sucedida (via connector) dispara coleta read-only completa, persistência em `collected_configs`, parsers Huawei VRP, e alimentação dos módulos BGP / L2 Circuits.

## Fase A — Contrato e executor (P0)

- [x] Job type `SSH_CONFIG_BUNDLE` (batch correlacionado no connector).
- [x] Payload: `commands[]`, `vendor`, `device_id`, timeout 300s.
- [x] NetOps CLI: bundle com `screen-length 0 temporary` + comandos allowlist.
- [x] Agregar stdout com separadores `! === command ===`.

## Fase B — Hook pós-SSH OK (P0)

- [x] `POST /devices/:id/test-connection` (connector): após SSH OK → enfileirar coleta (não bloquear HTTP).
- [x] `POST /devices/:id/test-connectivity`: idem quando SSH OK.
- [x] Resposta API inclui `configCollect: queued | failed` + `jobId`.
- [x] Servidor grava bundle bruto em `collected_configs` ao receber resultado.
- [x] Parse assíncrono inicial via `parseConfig()` (Fase C expande parsers L2/BGP dedicados).

## Fase C — Persistência e parse (P0)

- [ ] Serviço `connector-config-collect.service.ts`: parse + `INSERT collected_configs`.
- [ ] Preencher `parsed_vlans`, `parsed_interfaces`, `parsed_bgp`, `parsed_l2vpn`, `parsed_l3vpn`.
- [ ] Audit `device_config_collected_via_connector`.
- [ ] `device.status = active` após coleta+parse (não só após probe).

## Fase D — BGP e L2 a partir da config (P1)

- [ ] Refresh L2 Circuits discovery a partir de `parsed_l2vpn` + interface config.
- [ ] Sincronizar peers BGP parseados com painel BGP (`source: ssh|snapshot`).
- [ ] UI device detail: timestamp última config, contadores BGP/L2.

## Fase E — Histórico, diff, consulta (P1)

- [ ] Listar versões anteriores de config por device.
- [ ] Endpoint diff entre duas coletas (`collected_configs` a vs b).
- [ ] UI diff side-by-side; export Markdown/JSON.

## Fase F — Scheduler e retenção (P2)

- [ ] Re-coleta agendada (diária/semanal) por device ou site.
- [ ] Política de retenção de histórico (ex.: 90 dias).

## Comandos Huawei (bundle mínimo)

```text
display current-configuration
display interface brief
display bgp peer
display mpls l2vc verbose
display vsi verbose
display ip vpn-instance
```

## Critérios de aceite

- [ ] Device 43 (4WNET-BVA): após test-connection OK → linha em `collected_configs` com raw > 10 KB.
- [ ] `parsed_bgp` / `parsed_l2vpn` populados quando aplicável.
- [ ] Painéis BGP e L2 Circuits refletem dados sem SSH manual.
- [ ] Segunda coleta gera histórico; diff funcional.

---

# FASE 5.2: Inventario Persistido

## Objetivo
Coletar e persistir inventario completo via SSH read-only

## Scope
- Interfaces (IF-MIB + config display)
- VRFs (lista)
- BGP config snapshot
- Route-policies (lista nomes + nodes)
- Communities (lista + lists)

## Dados
```json
{
  "collector": "snmp",
  "collectorVersion": "phase5",
  "interfaces": [],
  "bgpPeers": [],
  "vrfs": [{"name": "Public"}],
  "configSnapshot": {
    "bgpConfiguration": "...",
    "routePolicies": {...},
    "ipPrefixes": {...},
    "communities": {...}
  }
}
```

## Commands
```
display current-configuration configuration bgp
display route-policy
display ip ip-prefix
display ip community-filter
```

---

# FASE 6: Import Policy Editor (Preview Only)

## Objetivo
Safe import policy editing com preview visual, sem SSH execute

## Componentes

### 6.1 Route-Policy Parser
- Parse Huawei VRP output
- Extract nodes, if-match, apply actions
- Identify edit constraints (no if-match, no deny final)

### 6.2 Community Library
- Central registry de communities individuais
- Named community-lists
- Discovery from config + SNMP
- Read-only endpoints para UI picker

### 6.3 Policy Preview Engine
- Validar mudanca proposta (community existe? list existe?)
- Gerar diff lógico
- Gerar commands esperados (sem executar)
- Mostrar warnings (mode change impact)

### 6.4 UI Preview Modal
- Selecionar mode: individual vs list
- Picker de communities/lists
- Mostrar diff antes/depois
- Botao apply DESABILITADO (FASE 7)
- Auditoria loga tentativa (sem apply)

## Constraints
- ✅ Editar: apply community/community-list
- ✅ Validar: community existe na library
- ✅ Validar: community-list existe em config
- ❌ Nao editar: if-match
- ❌ Nao editar: local-preference
- ❌ Nao editar: node 65535 (final deny)

## Endpoints
```
GET /bgp-peers/:id?role=customer
GET /route-policies/:name
GET /route-policies/:name/nodes/:id
GET /bgp-communities
GET /bgp-communities/:community
GET /bgp-communities/lists/:name
POST /policy-editor/preview (no execute)
```

## Docs
- `docs/netops/BGP_IMPORT_POLICY_EDITOR_PLAN.md`
- `docs/netops/ROUTE_POLICY_PARSER_SPEC.md`
- `docs/netops/COMMUNITY_LIBRARY_SPEC.md`

---

# FASE 7: Apply Real (Futuro)

## Prerequisitos
- ✅ RBAC: `bgp:edit:import-policy:customer`
- ✅ SSH write credentials (encrypted)
- ✅ Duplo check: user + admin approval
- ✅ Network change window (não apply fora de horario)
- ✅ Ticket integration (audit trail)

## Flow
1. User submits change → stored as pending
2. Admin reviews diff → approves/rejects
3. System schedules SSH write
4. SSH session → send commands
5. Device validates → ack/nack
6. Rollback automático se erro
7. Notificacao final (email)

## Safety
- Max 3 edits por peer por hora
- Max 1 simultaneous edit por device
- Rollback automático se device invalida config
- Manual rollback interface para operator

---

# v0.3.0 — Gestão de usuários e autorizações

## Objetivo
Implementar tela de gestão de usuários com CRUD, reset de senha, permissões granulares e sessão aprimorada.

## Scope

### Tela `/users` (Admin-only)
- Listagem com nome, email, role, criação, último acesso, status
- Botões: Editar, Desabilitar, Reset senha
- Criação via form modal

### CRUD de Usuários
- Criar: nome, email, role, salvar senha (hash bcrypt)
- Editar: nome, role (email imutável por segurança)
- Desabilitar: soft delete, preserve audit trail
- Reabilitar: admin only

### Reset de Senha
- Token temporário (validade 1 hora)
- Email de reset com link
- Nova senha sem enviar plaintext
- Audit log: quem resetou, quando

### Permissões Granulares
- Schema: module (devices, compliance, scheduler, reports, users) × action (view, create, edit, delete, execute)
- Associadas a role ou usuário específico
- Override: usuário pode ter permissão > role
- Audit: mudanças de permissão registradas

### Session Hardening
- Timeout: 24h (padrão), configurável
- Session revoke manual por admin
- Session list: show active sessions, kill button
- Audit trail: login, logout, timeout, revoke

## Tabelas Novas
```sql
-- ja existentes:
users, user_sessions

-- novos:
user_permissions (user_id, module, action, granted_at, granted_by)
user_sessions_revoked (session_id, revoked_at, revoked_by, reason)
```

## Endpoints Novos
```
GET /api/users (admin-only)
POST /api/users (admin-only)
PUT /api/users/:id (admin-only)
DELETE /api/users/:id (soft delete, admin-only)
POST /api/users/:id/reset-password (admin-only)
GET /api/auth/me/sessions
DELETE /api/auth/sessions/:id (revoke)
GET /api/auth/me/permissions
```

## UI
- Tela clean com tabela, filtros por role/status
- Form modal para CRUD
- Confirmação para desabilitar/reset
- Dark mode preservado

## Validação
- `pnpm run typecheck`
- `BASE_PATH=/ PORT=5000 pnpm run build`
- `docker compose up -d --build`
- Testar login após reset password
- Testar session revoke

---

# v0.3.1 — Import/Export de dispositivos

## Objetivo
Importar lotes de dispositivos (CSV/XLSX/TXT) com preview, deduplicação e validação.

## Scope

### Import
- Formatos: CSV, XLSX, TXT (um IP/hostname por linha)
- Campos: hostname, ip, vendor, platform, site, role, ssh_port, ssh_user
- Validação: IP válido, hostname único, vendor suportado
- Deduplicação: por hostname e/ou IP
- Preview: mostrar antes de aplicar, allow/skip conflicts
- Não sobrescrever credenciais existentes
- Preservar tags, metadata

### Export
- Formato: CSV, XLSX, JSON
- Seleção: todos ou filtered (por site, vendor, status)
- Campos: hostname, ip, vendor, platform, site, role, ssh_port, status, last_seen, created_at
- Sem secrets: ssh_password, snmp_community não exportados
- JSON: estrutura completa com metadata

### Histórico
- Rastrear imports: arquivo, usuário, timestamp, contagem
- Auditoria: antes/depois de cambios
- Rollback simples: desfazer import anterior

## Tabelas Novas
```sql
device_imports (id, imported_by, file_name, format, total_count, success_count, error_count, imported_at, rollback_at)
device_import_items (import_id, device_id, action, error_message)
```

## Endpoints Novos
```
POST /api/devices/import/preview (file, return: list + conflicts)
POST /api/devices/import/apply (import_id, confirm: bool)
GET /api/devices/export (format: csv|xlsx|json, filter?: {site, vendor, status})
GET /api/device-imports (list)
POST /api/device-imports/:id/rollback
```

## UI
- Botão Upload na tela de dispositivos
- Form modal: choose file, select format, preview conflicts
- Export: menu button na listagem, checkboxes para multi-select

---

# v0.3.2 — Download/export de relatórios de compliance

## Objetivo
Permitir download de relatórios de compliance com filtros aplicados e evidence sanitizada.

## Scope

### Download Compliance
- Filtro: por job, device, severidade, categoria, status
- Formatos: Markdown, JSON, CSV
- Campos: finding_id, object, severity, category, status, recommendation, evidence (sanitized)
- Include: timestamp, job info, device info, contagem

### Evidence Sanitização
- Remover payloads brutos > 1KB
- Sanitizar IPs/ASNs públicos apenas
- Mask: secrets, passwords, internal IPs
- Keep: summarized evidence (e.g., "3 security issues found")

### Relatório Markdown
```markdown
# Compliance Report — Device X, Job Y

**Generated:** 2026-05-22  
**Job:** job_id  
**Device:** hostname  
**Filter:** Actionable, Severity > warning  
**Total findings:** 42  

## Summary
- Critical: 3 (BLOCKER_REAL)
- High: 8 (RISCO_OPERACIONAL)
- Medium: 15 (PADRONIZACAO)
- Low: 16 (CUSTOMIZACAO)

## Findings

### [BLOCKER_REAL] BGP Security Issue — AS-PATH Filtering
**Object:** peer 1.2.3.4  
**Status:** Open  
**Recommendation:** Enable AS-PATH filtering  
**Evidence:** No prefix-list configured

---
```

## Endpoints Novos
```
GET /api/compliance/export?job_id=X&format=markdown|json|csv&filter={...}
GET /api/compliance/jobs/:id/export
POST /api/compliance/findings/:id/export
```

## UI
- Botão Download na tabela/painel compliance
- Menu: export as markdown/json/csv
- Preview antes de download

---

# v0.3.3 — Pilot operacional NOC

## Objetivo
Validar plataforma com operadores reais em NOC e coletar feedback de UX/performance.

## Scope

### Validação Operacional
- Teste com 3-5 operadores reais por 1-2 semanas
- Feedback: UX, densidade visual, performance, confiança
- Métricas: tempo de resposta, uptime, alerts SLA

### Melhorias Coletadas
- Ajustes dark mode (contraste, legibilidade)
- Tabelas mais compactas se necessário
- Filtros frequentes persisted
- Keyboard shortcuts para ações rápidas

### Dashboard de Uptime
- Widget mostrando status de devices (últimas 24h)
- Alerts em tempo real para findings críticos
- Notificações push para failures

### Alerts Críticos
- Findings BLOCKER_REAL disparam notificação
- Email para on-call
- Integração com webhook (Slack, PagerDuty)

## Dados Coletados
- Log de ações de operador
- Query count/latency
- Error rate
- Feature usage (qual painel, quantas vezes)

## Relatório
- `reports/V0_3_3_PILOT_NOC_REPORT.md`
- Findings, recommendations, next steps

---

# BGP Operational Abstractions — vindo do 60-bgp_manager

Nas proximas fases, abstrair do projeto 60-bgp_manager as funcionalidades operacionais de BGP, mantendo o design atual do 114-4WNET-NetOps.

## Objetivo

Transformar o painel BGP em uma visao operacional segmentada por papel do peer:

- Clientes
- Operadoras
- CDN
- IX
- iBGP
- Unknown

Cada categoria deve suportar peers IPv4 e IPv6.

## Regras

- Nao copiar layout do 60-bgp_manager.
- Copiar comportamento, abstracoes, filtros e fluxos.
- Preservar design atual.
- Tudo read-only nas fases iniciais.
- Nenhum comando destrutivo.
- Nenhum comando de configuracao.
- Nenhum apply.
- Nenhum commit/save.

## Campos normalizados do Peer BGP

Cada peer deve ser normalizado no backend como:

```json
{
  "peerIp": "192.0.2.1",
  "remoteAs": 65000,
  "description": "CLIENTE XPTO",
  "state": "Established",
  "role": "customer",
  "addressFamily": "ipv4",
  "vrf": null,
  "importPolicy": "RP-IN-CLIENTE",
  "exportPolicy": "RP-OUT-CLIENTE",
  "receivedPrefixes": null,
  "advertisedPrefixes": null,
  "activePrefixes": null,
  "uptime": null,
  "source": "snmp|ssh|snapshot|mock"
}
```

## Classificacao obrigatoria

Implementar classificador de role:

```text
provider  -> Operadoras
customer  -> Clientes
cdn       -> CDN
ix        -> IX
cdn_ix    -> CDN/IX quando nao for possivel separar
ibgp      -> iBGP
unknown   -> Nao classificado (fallback interno; nao expor na UI)
```

## IPv4 / IPv6

Todo peer deve identificar:

```text
addressFamily:
- ipv4
- ipv6
- unknown
```

Criterio:

- IPv4 se peerIp for IPv4.
- IPv6 se peerIp for IPv6.
- Unknown se parser nao conseguir determinar.

## Filtros no frontend

Adicionar filtros:

- Todos
- Established
- Down
- IPv4
- IPv6
- Clientes
- Operadoras
- CDN
- IX
- iBGP
- Unknown

## Botoes por peer

Cada linha/card de peer BGP deve ter acoes read-only:

- Detalhes
- Prefixos recebidos
- Prefixos exportados/anunciados
- Policies
- Communities
- Diagnostico

## Endpoints futuros

Criar ou planejar:

```text
GET /api/netops/devices/:id/bgp-peers
GET /api/netops/devices/:id/bgp-peers?role=customer
GET /api/netops/devices/:id/bgp-peers?role=provider
GET /api/netops/devices/:id/bgp-peers?role=cdn
GET /api/netops/devices/:id/bgp-peers?role=ix
GET /api/netops/devices/:id/bgp-peers?af=ipv4
GET /api/netops/devices/:id/bgp-peers?af=ipv6

GET /api/netops/devices/:id/bgp-peers/:peerIp
GET /api/netops/devices/:id/bgp-peers/:peerIp/received-prefixes
GET /api/netops/devices/:id/bgp-peers/:peerIp/advertised-prefixes
GET /api/netops/devices/:id/bgp-peers/:peerIp/policies
GET /api/netops/devices/:id/bgp-peers/:peerIp/communities
GET /api/netops/devices/:id/bgp-peers/:peerIp/diagnostics
```

## Comandos Huawei VRP permitidos futuramente

Somente read-only:

```text
display bgp peer
display bgp ipv6 peer
display bgp routing-table peer <PEER> received-routes
display bgp routing-table peer <PEER> advertised-routes
display bgp ipv6 routing-table peer <PEER> received-routes
display bgp ipv6 routing-table peer <PEER> advertised-routes
display current-configuration configuration bgp
display current-configuration | include <PEER>
display route-policy
display ip ip-prefix
display ip community-filter
```

## Comandos proibidos

```text
system-view
commit
save
undo
reset bgp
refresh bgp
clear bgp
peer ... enable
peer ... route-policy
route-policy ...
ip ip-prefix ...
ip community-filter ...
```

## Criterio de aceite

- BGP separado por Cliente, Operadora, CDN, IX.
- IPv4 e IPv6 identificados.
- Botoes de prefixos recebidos e exportados aparecem.
- Modal de prefixos pagina resultados reais em blocos de ate 200 itens, sem truncar a navegacao apos a primeira pagina.
- Se ainda nao houver backend real, mostrar estado vazio amigavel.
- Nenhum comando altera estado.
- Design atual preservado.

## Prompt para proximo agente

```text
MODO CAVEMAN.

Atualize o plano das proximas fases para incluir abstracoes BGP vindas do 60-bgp_manager.

Objetivo:
Trazer para o 114-4WNET-NetOps os filtros e comportamentos BGP operacionais do 60-bgp_manager, sem quebrar o design atual.

Escopo:
- Clientes
- Operadoras
- CDN
- IX
- CDN/IX
- iBGP
- Unknown
- IPv4
- IPv6
- Prefixos recebidos
- Prefixos exportados/anunciados
- Policies import/export
- Communities
- Diagnostico read-only

Nao implementar coleta real ainda se a fase atual for so planejamento.
Nao executar SSH real.
Nao executar SNMP real.
Nao alterar roteador.
Nao mexer em configuracao.

Acoes:
1. Atualizar reports/migration/FUTURE_PHASE_TODOS.md.
2. Criar docs/netops/BGP_OPERATIONAL_ABSTRACTIONS.md.
3. Definir tipo normalizado BgpPeer.
4. Definir tipo BgpPeerRole.
5. Definir tipo AddressFamily.
6. Definir endpoints planejados.
7. Definir botoes frontend por peer.
8. Definir comandos Huawei VRP permitidos somente read-only.
9. Definir comandos proibidos.
10. Preservar UX_GUARDRAILS.md.

Criterio:
- Documento claro.
- Sem alteracao destrutiva.
- Sem mudanca visual.
- Sem backend real ainda, exceto se ja houver FASE 3 aprovada.
```

## Decisao

Para as proximas fases, o BGP deve virar isto:

```text
BGP
├── Todos
├── Operadoras
│   ├── IPv4
│   └── IPv6
├── Clientes
│   ├── IPv4
│   └── IPv6
├── CDN
│   ├── IPv4
│   └── IPv6
├── IX
│   ├── IPv4
│   └── IPv6
├── iBGP
└── Unknown
```

E cada peer precisa abrir:

```text
Detalhes
Prefixos recebidos
Prefixos exportados
Policies
Communities
Diagnostico
```

## FASE 3 - APIs read-only

Objetivo: expor dados operacionais sem alterar schema destrutivamente.

- [x] FASE 3 iniciada.
- [x] Criar contratos OpenAPI para:
  - [x] `GET /api/netops/devices/:id/summary`
  - [x] `GET /api/netops/devices/:id/interfaces`
  - [x] `GET /api/netops/devices/:id/bgp-peers`
  - [x] `GET /api/netops/devices/:id/bgp-peers?role=provider`
  - [x] `GET /api/netops/devices/:id/bgp-peers?role=customer`
  - [x] `GET /api/netops/devices/:id/bgp-peers?role=cdn_ix`
  - [x] `GET /api/netops/devices/:id/communities`
  - [x] `GET /api/netops/devices/:id/filters`
  - [x] `GET /api/netops/devices/:id/logs`
  - [x] `GET /api/netops/devices/:id/snmp-snapshots/latest`
- [x] Implementar rotas Express read-only.
- [x] Usar `snmp_snapshots` como fonte inicial para interfaces/BGP/VRFs.
- [x] Gerar Orval/Zod.
- [x] Ligar placeholders ao client gerado.
- [x] Validar `pnpm run typecheck`.
- [x] Validar `BASE_PATH=/ PORT=5000 pnpm run build`.
- [x] Aplicar ao container `api web` sem remover volume de banco.
- [x] Reaplicar ajuste backend ao container `api` sem remover volume de banco.
- [x] Smoke test em `/api/netops/devices/1/summary`.
- [x] Smoke test em `/api/netops/devices/1/bgp-peers`.
- [x] Smoke test em `/netops-operations`.
- [x] Confirmar banco preservado via count de `devices`.
- [x] FASE 3 concluida.

## FASE 4 - Adapters SNMP/SSH read-only

Objetivo: criar safety guard, contratos de adapters, parsers iniciais e botoes BGP. Nao executar coleta real nesta fase.

- [x] Adicionar fallback SSH `keyboard-interactive` para login Huawei/VRP.
- [x] Manter FASE 4 read-only estrita:
  - [x] permitir somente comandos `show`/`display` em allowlist.
  - [x] proibir `system-view`.
  - [x] proibir `configure terminal`.
  - [x] proibir `commit`.
  - [x] proibir `save`.
  - [x] proibir `undo`.
  - [x] proibir `reset`.
  - [x] proibir `clear bgp`.
  - [x] proibir `refresh bgp`.
- [x] Criar modulos TypeScript conforme arquitetura real do 114:
  - [x] `workspace/artifacts/api-server/src/modules/netops/adapters/snmp-readonly-adapter.ts`
  - [x] `workspace/artifacts/api-server/src/modules/netops/adapters/ssh-readonly-adapter.ts`
  - [x] `workspace/artifacts/api-server/src/modules/netops/adapters/adapter-types.ts`
  - [x] `workspace/artifacts/api-server/src/modules/netops/huawei-vrp/commands.ts`
  - [x] `workspace/artifacts/api-server/src/modules/netops/huawei-vrp/parsers/*`
  - [x] `workspace/artifacts/api-server/src/modules/netops/bgp/*`
- [x] Adaptar parsers Huawei VRP iniciais:
  - [x] BGP peers.
  - [x] interfaces.
  - [x] VRFs.
  - [x] route-policy/ip-prefix.
  - [x] community-filter.
- [ ] Adicionar diagnostico SSH detalhado por etapa na FASE 5:
  - [ ] TCP connect
  - [ ] handshake
  - [ ] auth methods offered
  - [ ] shell/exec ready
- [x] Implementar fallback IPv6 para peers via `addressFamily`.
- [x] Criar classificacao defensiva de BGP:
  - [x] provider
  - [x] customer
  - [x] cdn
  - [x] ix
  - [x] cdn_ix
  - [x] ibgp
  - [x] unknown
- [x] Expandir tipo normalizado `BgpPeer`:
  - [x] `vrf`
  - [x] `receivedPrefixes`
  - [x] `advertisedPrefixes`
  - [x] `activePrefixes`
  - [x] `source` como `snmp|ssh|snapshot|mock|db`
- [x] Adicionar filtros read-only por `role`, `af`, `state`.
- [x] Criar endpoints stub de detalhe por peer:
  - [x] `/bgp-peers/:peerIp`
  - [x] `/bgp-peers/:peerIp/received-prefixes`
  - [x] `/bgp-peers/:peerIp/advertised-prefixes`
  - [x] `/bgp-peers/:peerIp/policies`
  - [x] `/bgp-peers/:peerIp/communities`
  - [x] `/bgp-peers/:peerIp/diagnostics`
- [x] Criar endpoints de coleta/status stub:
  - [x] `POST /api/netops/devices/:id/collect/read-only`
  - [x] `GET /api/netops/devices/:id/collection-status`
- [x] Adicionar botoes BGP read-only no frontend.
- [x] Gerar OpenAPI/Orval/Zod.
- [x] Validar `pnpm run typecheck`.
- [x] Validar `BASE_PATH=/ PORT=5000 pnpm run build`.
- [x] Validar `tools/netops-audit.sh`.
- [x] Aplicar containers `api web` sem remover volume de banco.
- [x] Smoke `/netops-operations`.
- [x] Smoke APIs FASE 3/4.
- [x] Confirmar comandos destrutivos aparecem somente no denylist do safety guard/docs.
- [x] FASE 4 concluida.

## FASE 4.1 - Identidade K3G controlada

Objetivo: migrar favicon/icone K3G do `60-bgp_manager` sem trocar layout, tema ou padrao visual.

- [ ] Localizar assets no `60-bgp_manager`:
  - [ ] `../60-bgp_manager/frontend/public/favicon-light.png`
  - [ ] `../60-bgp_manager/frontend/public/favicon-dark.png`
  - [ ] `../60-bgp_manager/frontend/public/apple-touch-icon-light.png`
  - [ ] `../60-bgp_manager/frontend/public/apple-touch-icon-dark.png`
  - [ ] confirmar se existe logo/icone K3G adicional fora de `public`.
- [ ] Registrar origem, destino e decisao em `reports/migration/K3G_ASSETS_MIGRATION_PLAN.md`.
- [ ] Copiar/adaptar assets com nomes claros.
- [ ] Nao sobrescrever `favicon.svg`/`opengraph.jpg` sem backup.
- [ ] Aplicar favicon na aba do navegador.
- [ ] Aplicar icone K3G discreto na dashboard ou sidebar conforme padrao atual.
- [ ] Validar typecheck/build/audit e aplicar container `web`.

## FASE 5 - Coleta real controlada read-only

- [x] Habilitar SNMP GET/WALK real atras de flag/config segura (`NETOPS_SNMP_REAL_ENABLED`, default false).
- [ ] Habilitar SSH real atras de flag/config segura.
- [ ] Executar somente allowlist `display/show` (SSH — FASE 5.1).
- [x] Persistir snapshot em `snmp_snapshots` via collect/read-only.
- [x] Logs operacionais SNMP em collect + GET logs (snapshot message).
- [ ] Diagnostico SSH detalhado por etapa:
  - [ ] TCP connect
  - [ ] handshake
  - [ ] auth methods offered
  - [ ] shell/exec ready
- [ ] Nenhum comando altera estado.

## FASE 6 - Paineis BGP completos

- [ ] Interfaces: listar nome, admin/oper, alias, speed, IPv4/IPv6, counters.
- [ ] BGP geral: peer, ASN, VRF, state, role, address family, policies.
- [ ] BGP Todos: listar peers IPv4/IPv6 com filtros por estado e papel.
- [ ] BGP Operadoras: filtro `role=provider`.
- [ ] BGP Clientes: filtro `role=customer`.
- [ ] BGP CDN: filtro `role=cdn`.
- [ ] BGP IX: filtro `role=ix`.
- [ ] BGP CDN/IX legado: filtro `role=cdn_ix` quando nao for possivel separar.
- [ ] BGP iBGP: filtro `role=ibgp`.
- [ ] BGP Unknown legado: manter compatibilidade apenas para dados antigos, sem categoria navegavel.
- [ ] Modais/drawers read-only por peer:
  - [ ] Detalhes
  - [ ] Prefixos recebidos
  - [ ] Prefixos exportados/anunciados
  - [ ] Policies
  - [ ] Communities
  - [ ] Diagnostico
- [ ] Filters: route-policy, prefix-filter e community-filter detectados.
- [ ] Communities: community-filter, community-list, apply community refs.

## Validacao continua por fase

- [ ] Screenshot desktop da rota `/netops-operations`.
- [ ] Screenshot mobile/tablet se layout for alterado.
- [ ] Confirmar sidebar global intacta.
- [ ] Confirmar rotas antigas intactas.
- [ ] `pnpm run typecheck`.
- [ ] `BASE_PATH=/ PORT=5000 pnpm run build`.
- [ ] `docker compose config`.
- [ ] `docker build --pull --no-cache -t netops-manager-ci .`.

## v0.2.8 Compliance findings grouping UI

- [x] Consumir endpoint de grupos de findings no frontend.
- [x] Alternar `/compliance` entre lista e grupos.
- [x] Exibir cards de top criticos, top por quantidade, bloqueadores reais e riscos operacionais.
- [x] Abrir drawer read-only com findings do grupo, objetos afetados e evidencias sanitizadas.
- [x] Manter filtros por actionable, severity, context, operationalCategory, source e confidence.

## v0.2.9 Stale findings handling

- [x] Classificar findings como current, stale, legacy ou superseded.
- [x] Adicionar filtros `latestJobOnly` e `freshness` na API.
- [x] Expor summary de freshness e ultimo job por device.
- [x] Fazer `/compliance` mostrar somente ultimo job por device por padrao.
- [x] Manter historico acessivel por toggle sem apagar evidencias antigas.

## FASE 7 - Pre-check de servico

- [ ] Validar conectividade e permissao read-only.
- [ ] Validar comandos permitidos por vendor.
- [ ] Validar backup/snapshot antes de qualquer plano write futuro.

## D4 - BGP drilldown next phase

- [ ] Definir se API `source` deve expor `snapshot` ou evidencia (`ssh_full_config`) sem ambiguidade na UI.
- [ ] Planejar consultas de rotas com confirmacao explicita, limite, auditoria e timeout.
- [ ] Adicionar smoke browser automatizado quando Playwright estiver disponivel no workspace.

## FASE 8 - Plano de configuracao

- [ ] Gerar plano textual.
- [ ] Gerar diff/comandos previstos.
- [ ] Nao executar comandos.

## FASE 9 - Aprovacao humana

- [ ] Exigir aprovacao explicita.
- [ ] Registrar operador, alvo, comandos e janela.

## FASE 10 - Apply controlado

- [ ] Executar somente apos FASE 9.
- [ ] Usar timeout e parada em erro.
- [ ] Nao salvar config automaticamente sem regra explicita.

## FASE 11 - Pos-validacao

- [ ] Validar estado operacional.
- [ ] Comparar antes/depois.
- [ ] Registrar logs e resultado.

## Regras para outros agentes

- Nao copiar frontend do `60-bgp_manager`.
- Nao copiar Python para TypeScript.
- Nao trocar tema ou tokens CSS.
- Nao remover rotas ou componentes existentes.
- Nao sobrescrever assets existentes sem backup ou novo nome claro.
- Nao criar migrations destrutivas.
- Toda alteracao de runtime deve ser aplicada ao container especifico antes de encerrar a tarefa.
- Nunca usar `docker compose down -v`, `docker volume rm`, reset de banco ou apagar migrations sem pedido explicito e backup confirmado.
- Antes de FASE 4, escrever testes/fixtures para parser.
- Antes de qualquer acao SSH write, exigir preview, auditoria e confirmacao explicita.

## Discovery SSH/SNMP implementado nesta fase

- [x] Adicionar modulo read-only `device-discovery` com SSH primary e SNMP fallback/complement.
- [x] Expor peers BGP e detalhes normalizados sem CLI/OID cru para o frontend.
- [x] Proteger consultas de rotas contra full dump automatico.
- [x] Persistir discovery/evidencias em tabelas dedicadas.
- [x] Enfileirar discovery direto apos SSH OK na aba Devices para alimentar compliance, parse e cache.
- [x] Corrigir UI de coleta SSH para aguardar o endpoint assíncrono antes de resumir resultado.
- [ ] Completar parsers Huawei VRP para nodes de route-policy, community-list, L2VC e VSI.
