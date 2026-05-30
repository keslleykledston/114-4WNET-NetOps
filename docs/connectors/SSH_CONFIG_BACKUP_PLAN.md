# Plano — Backup automático de config no SSH (via Connector)

## Checkpoint (2026-05-30)

| Item | Estado |
|------|--------|
| NetOps CLI (bastião) | OK — UI, L2TP, rotas, job poll, heartbeat |
| SSH probe (`display version`) | OK — autentica e retorna VRP |
| SNMP probe | OK — quando community configurada |
| Coleta BGP / L2 Circuits no teste SSH | **Não executada** — `test-connection` só valida reachability |
| Inventário persistido (config, BGP, L2) | **Pendente** — tabelas e parsers existem, fluxo não está ligado ao connector |

**Conclusão:** “SSH conectou” ≠ “dados operacionais coletados”. O operador não tem garantia visual de BGP/L2 até existir backup + parse automático.

---

## Objetivo

Sempre que houver **SSH bem-sucedido** para um device via connector (`connector_id` setado):

1. Coletar **config completa read-only** (Huawei: `display current-configuration` + comandos complementares).
2. **Persistir** em `collected_configs` (histórico, diff, consulta).
3. **Executar parsers** Huawei VRP e gravar colunas `parsed_*`.
4. **Alimentar** módulos BGP, L2 Circuits e Device Discovery a partir do snapshot parseado.
5. Registrar **audit** e **correlation_id** ligando teste → coleta → parse.

---

## Gatilhos (quando disparar coleta)

| Gatilho | Prioridade | Notas |
|---------|------------|-------|
| `POST /api/devices/:id/test-connection` success (connector) | P0 | Substituir probe único por probe + coleta assíncrona |
| `POST /api/devices/:id/test-connectivity` SSH OK | P0 | Idem; SNMP continua paralelo |
| Device create + primeiro teste OK | P1 | Garantir inventário inicial |
| Scheduler / job manual “Collect config” | P2 | Já existe `POST /collected-configs`; adaptar para connector |
| Reconnect após CLI restart (opcional) | P3 | Só se policy aprovar re-coleta |

**Regra:** probe rápido (`display version`) permanece para latência; coleta completa roda em **job separado** (não bloquear UI 2–5 min).

---

## Comandos Huawei VRP (allowlist — read-only)

Ordem sugerida no bundle (NetOps CLI / job executor):

```text
screen-length 0 temporary
display current-configuration
display interface brief
display bgp peer
display bgp ipv6 peer
display vlan
display mpls l2vc verbose
display vsi verbose
display ip vpn-instance
display route-policy
display ip ip-prefix
display ip community-filter
```

Comandos **proibidos** (já no `ssh_policy` / safety guard): `system-view`, `commit`, `save`, `undo`, etc.

**Nota operacional:** usar prefixo `screen-length 0 temporary` + newline antes de cada bloco longo (padrão já validado no CLI para evitar pager `---- More ----`).

---

## Fluxo técnico

```text
NetOps API                    NetOps CLI (connector)
     |                                |
     |-- test-connection SSH OK ----->|  (job: display version)
     |                                |
     |-- create SSH_CONFIG_BUNDLE ---->|  (job: multi-command ou script)
     |                                |-- sshpass + comandos allowlist
     |                                |
     |<-- POST /jobs/:id/result ------|  stdout agregado
     |                                |
     |-- parseConfig() + parsers L2 --|
     |-- INSERT collected_configs ----|
     |-- INSERT/UPDATE snmp_snapshots -|  (opcional: metadados SSH)
     |-- trigger L2/BGP refresh -------|  (fase posterior)
     |-- device.status = active ------|
```

---

## Persistência (schema existente)

### `collected_configs`

| Campo | Uso |
|-------|-----|
| `raw_config` | Texto completo (com separadores `! === command ===`) |
| `parsed_vlans` | JSON |
| `parsed_interfaces` | JSON |
| `parsed_bgp` | JSON peers |
| `parsed_l2vpn` | JSON L2VC/VSI |
| `parsed_l3vpn` | JSON VRF/VPN |
| `collected_at` | Timestamp para histórico e diff |

### Histórico e diff

- **Histórico:** manter N versões por device (sem delete automático); UI lista por `collected_at`.
- **Diff:** comparar duas entradas `collected_configs` (raw ou parsed); endpoint futuro `GET /collected-configs/diff?a=&b=`.
- **Consulta:** reutilizar `GET /devices/:id/collected-config` (latest) e `GET /collected-configs/:id`.

### Integração discovery

- Opcional: criar `discovery_run` + `discovery_snapshot` linkado ao `collected_configs.id` para rastreabilidade unificada.

---

## Parsers (reuso)

| Módulo | Path |
|--------|------|
| Config genérico | `workspace/artifacts/api-server/src/lib/ssh.ts` → `parseConfig()` |
| Huawei L2 | `workspace/artifacts/api-server/src/modules/l2circuits/parsers/huawei-vrp-l2.ts` |
| BGP normalizado | `workspace/artifacts/api-server/src/modules/netops/bgp/*` |
| Discovery adapter | `workspace/artifacts/api-server/src/modules/netops/adapters/discovery-netops.adapter.ts` |

---

## Fases de implementação

### Fase A — Contrato e job type (P0)

- [ ] Definir `SSH_CONFIG_BUNDLE` (ou sequência de `SSH_COMMAND` com `correlation_id` compartilhado).
- [ ] Documentar payload: `commands[]`, `vendor`, `device_id`, `timeout_seconds` (default 300).
- [ ] Estender `job_executor.py` (116-NetOps_CLI) para executar bundle com `screen-length` + timeout por comando.
- [ ] Masking de secrets em `masked_payload_json` (já existe no server).

### Fase B — Hook pós-SSH OK (P0)

- [ ] Em `devices.ts` `test-connection`: se connector + SSH OK → `enqueueConfigCollect(device)`.
- [ ] Em `test-connectivity`: idem quando `sshExec.success`.
- [ ] Retornar resposta imediata ao UI: `{ ssh: OK, configCollect: "queued", jobId }`.
- [ ] Não bloquear HTTP aguardando bundle completo.

### Fase C — Persistência e parse (P0)

- [ ] Novo serviço `connector-config-collect.service.ts`: agregar stdout, chamar `parseConfig`, inserir `collected_configs`.
- [ ] Atualizar `device.status = active`, `lastSeen` somente após parse OK (ou parcial com warnings).
- [ ] Audit: `device_config_collected_via_connector`.

### Fase D — BGP e L2 a partir da config (P1)

- [ ] Após parse: popular/refrescar dados L2 (`l2circuits` discovery) a partir de `parsed_l2vpn` + raw interface config.
- [ ] Sincronizar peers BGP parseados com painel BGP (fonte `ssh|snapshot`).
- [ ] UI device detail: badge “Config coletada em …”, contagem peers BGP, circuitos L2.

### Fase E — Histórico, diff e UI (P1)

- [ ] Listagem de versões anteriores em device detail.
- [ ] Diff side-by-side (raw ou structural JSON).
- [ ] Export Markdown/JSON do diff para NOC.

### Fase F — Scheduler e re-coleta (P2)

- [ ] Job agendado por device/connector (ex.: diário).
- [ ] Política de retenção (ex.: 90 dias, configurable).

---

## Critérios de aceite

- [ ] Após test-connection OK no device 43 (4WNET-BVA), existe nova linha em `collected_configs` com `raw_config` > 10 KB.
- [ ] `parsed_bgp` e `parsed_l2vpn` não nulos quando device tem BGP/L2 configurados.
- [ ] Painel BGP e L2 Circuits mostram dados sem SSH manual adicional.
- [ ] Segunda coleta gera novo histórico; diff entre duas versões funciona.
- [ ] Nenhum comando fora da allowlist; audit completo.

---

## Referências

- `docs/connectors/PHASE_4_DEVICE_COLLECTIONS.md`
- `reports/migration/FUTURE_PHASE_TODOS.md` — FASE 5.4
- `116-NetOps_CLI/netops_cli_connector/app/services/job_executor.py`
- `workspace/artifacts/api-server/src/routes/collected_configs.ts`
