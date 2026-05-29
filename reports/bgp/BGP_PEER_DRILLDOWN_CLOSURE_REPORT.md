# BGP Peer Drilldown — Relatório de fechamento (D2–D6B)

**Date:** 2026-05-26

**Audience:** agentes, devs, NOC

**Escopo deste documento:** consolidação das fases D2–D6B. Apenas documentação; nenhuma execução de rede nesta entrega.

---

## 1. Resumo executivo

O **BGP Peer Drilldown** entrega análise **read-only** de **um** peer BGP a partir de **snapshot + raw_config** já persistidos no NetOps. A UI consome a API; há **cache/histórico** com TTL; **reparse local** via `force_recompute`; **comparação** entre duas entradas de histórico; **SSH detail** existe mas fica **desligado por padrão** (503 até NOC habilitar). **Rotas received/accepted/advertised** continuam fora de escopo (fase futura).

**Veredito final:** **GO** para uso operacional em modo snapshot + cache, com SSH detail e SNMP poll **desligados** quando exigido por política de laboratório.

---

## 2. Commits por fase (referência git)

| Fase | Tema | Commit (hash curto) | Mensagem resumida |
|------|------|----------------------|-------------------|
| D2 | API snapshot drilldown | `97cfcf6` | `feat(bgp): add snapshot-based peer drilldown endpoint` |
| D3 | UI snapshot | `2ca9a7c` | `feat(bgp): add snapshot peer drilldown UI` |
| D4 | SSH detail + guard | `0a5d5eb` | `feat(bgp): guard SSH detail for peer drilldown` |
| D4 docs | Smoke flag off | `8cf5d55` | `docs(bgp): document peer drilldown SSH detail flag-off smoke` |
| D5 | Cache + history | `b8ee973` | `feat(bgp): cache peer drilldown snapshots and history` |
| D5B docs | Runtime smoke cache | `d53008a` | `docs(bgp): document peer drilldown cache runtime smoke` |
| D6 | UX cache/history | `043bfda` | `feat(bgp): improve drilldown cache and history UX` |
| D6B docs | Runtime smoke UX | `41d183b` | `docs(bgp): document drilldown cache UX runtime smoke` |

**Schema DB (cache):** migration `0017` — tabela `bgp_peer_drilldown_snapshots` (ver relatório D5B).

---

## 3. Endpoints (API)

| Método | Caminho | Auth | Comportamento |
|--------|---------|------|----------------|
| GET | `/api/bgp/peers/:deviceId/:peer/drilldown` | `devices.read` | Monta resultado a partir de snapshot + `collected_configs`; pode servir **cache fresh**; suporta `force_recompute=true` (reparse local, nova linha de histórico). |
| GET | `/api/bgp/peers/:deviceId/:peer/drilldown/history` | `devices.read` | Lista histórico; campos enriquecidos (D6): `warningsCount`, `freshnessStatus`, ordenação por `collected_at` desc. |
| GET | `/api/bgp/peers/:deviceId/:peer/drilldown/history/compare` | `devices.read` | Compara dois `id` de histórico: policies import/export, AFI enabled, warnings (sem diff de raw evidence). |
| POST | `/api/bgp/peers/:deviceId/:peer/drilldown/detail` | `devices.read` | SSH detail leve; **503** se `BGP_DRILLDOWN_SSH_DETAIL_ENABLED=false`. |

**Query comuns (drilldown):**

- `source=snapshot` (obrigatório na versão atual)
- `include_policies`, `include_policy_objects` (default true)
- `snapshot_id`, `job_id` (opcional)
- `force_recompute=true` (D6): ignora cache fresh, rebuild + persist

**Resposta drilldown (D6):** campo opcional `cache` com `status` (`fresh` | `expired` | `miss` | `recomputed`), `servedFromCache`, `rowId`, `expiresAt`, `configBuildSource`.

---

## 4. UI

| Item | Detalhe |
|------|---------|
| Rota | `/bgp/peer-drilldown` |
| Smoke | `?deviceId=1&peer=<peer>&auto=1` |
| Navegação | Link a partir do painel BGP (peer row) |
| Abas | Drilldown + **Histórico** |
| D6 | Banner de status de cache; botão **Recalcular snapshot** (aviso: não executa comandos no equipamento); tabela de histórico com freshness; **Comparar** duas linhas |
| Rotas | Slots `requested=false` até fase futura |
| SSH | Painel “SSH detail leve”; com gate off → 503 e estado `disabled` |

---

## 5. Cache e histórico

- **TTL:** `BGP_DRILLDOWN_CACHE_TTL_SECONDS` (default 7 dias em `env.ts`).
- **Fresh cache:** GET drilldown idêntico pode retornar payload persistido sem recomputar (D6 expõe `cache.status=fresh`).
- **Histórico:** cada build bem-sucedido pode inserir linha em `bgp_peer_drilldown_snapshots`; histórico lista metadados + freshness.

---

## 6. force_recompute

- **Sem rede:** apenas relê DB (snapshot + raw_config) e roda builder de novo.
- **Uso:** query `force_recompute=true` ou botão na UI.
- **Efeito:** `cache.status=recomputed` na resposta; nova entrada de histórico.

---

## 7. Compare

- **Query:** `left=<id>&right=<id>` (ids da tabela de snapshots).
- **Mesmo id:** API retorna **400** (proposital).
- **Diff:** policies efetivas import/export por AFI, enabled por família, warnings adicionados/removidos — **não** inclui raw config nem evidence blobs.

---

## 8. SSH detail guard

- **Env:** `BGP_DRILLDOWN_SSH_DETAIL_ENABLED` (default **false**).
- **Desligado:** POST detail → **503** + código `BGP_DRILLDOWN_SSH_DETAIL_DISABLED`.
- **Ligado (futuro NOC):** apenas comandos allowlist (ver D4 report); **sem** route-table peer commands na lista permitida.

---

## 9. Flags e ambiente

| Variável | Default típico | Notas |
|----------|----------------|-------|
| `BGP_DRILLDOWN_SSH_DETAIL_ENABLED` | false | Gate SSH detail |
| `BGP_DRILLDOWN_CACHE_TTL_SECONDS` | 604800 | TTL cache drilldown |
| `SNMP_POLL_ENABLED` | true em compose genérico | Smoke D6B usou override **efêmero** `false` para “zero SNMP poll”; não é requisito funcional do drilldown snapshot |
| `NETOPS_SNMP_REAL_ENABLED` | produto separado | Não necessário para drilldown GET snapshot |

---

## 10. Comandos permitidos / proibidos (SSH detail — quando habilitado)

Resumo alinhado ao relatório D4:

**Permitidos (exemplos):** `display bgp peer`, `display bgp peer … verbose`, `display route-policy`, prefix/community/as-path filters conforme allowlist.

**Bloqueados:** route-table peer received/accepted/advertised; metacaracteres perigosos; tokens `system-view`, `undo`, `reset`, `clear`, `save`, `reboot`, etc.

Detalhe completo: `reports/bgp/PHASE_BGP_PEER_DRILLDOWN_D4_SSH_DETAIL_PLAN_AND_GUARD_REPORT.md`.

---

## 11. Safety

- Drilldown GET: **sem** SSH, **sem** SNMP obrigatório, **sem** discovery, **sem** write NetBox/dispositivo.
- Cache/compare: leitura DB + CPU local.
- SSH detail: só após gate + allowlist; default off.
- Logs/reports: não colar community/password/token; usar pilot peer como exemplo apenas se já público no relatório de fase.

---

## 12. Validações realizadas (referência)

| Fase | Artefato |
|------|----------|
| D2 | `PHASE_BGP_PEER_DRILLDOWN_D2_SNAPSHOT_REPORT.md` + selftest snapshot |
| D3 | `PHASE_BGP_PEER_DRILLDOWN_D3_UI_REPORT.md` |
| D4 | `PHASE_BGP_PEER_DRILLDOWN_D4_*` + selftest SSH detail sem SSH |
| D5/D5B | `PHASE_BGP_PEER_DRILLDOWN_D5B_CACHE_RUNTIME_SMOKE_REPORT.md` |
| D6 | `PHASE_BGP_PEER_DRILLDOWN_D6_CACHE_UX_REPORT.md` + selftests |
| D6B | `PHASE_BGP_PEER_DRILLDOWN_D6B_CACHE_UX_RUNTIME_SMOKE_REPORT.md` |

---

## 13. Limitações

- **Um peer por request;** não é sweep multi-peer.
- **Fonte v1:** `source=snapshot` apenas.
- **Rotas:** não implementadas; `routeTables.requested=false`.
- **SSH detail:** desligado por padrão; habilitar só com janela NOC e escopo mínimo.
- **Compare:** não substitui diff textual de config completa; foco em policies/AFI/warnings.
- **Primeiro boot compose:** se `SNMP_POLL_ENABLED` não estiver false, poller pode subir — smoke válido D6B documentou override efêmero + segundo run.

---

## 14. Próximos passos (backlog sugerido)

1. **D4.2C — SSH detail real:** um peer, janela NOC, `BGP_DRILLDOWN_SSH_DETAIL_ENABLED=true`, evidência em relatório; sem bulk.
2. **D7 — route-table:** comandos **protegidos** + confirmação explícita + rate limit; fase futura.
3. **Integração UX:** atalho drilldown a partir da lista BGP peers (refinar deep-link e estado).

---

## 15. GO / NO-GO final

| Área | Status |
|------|--------|
| Snapshot drilldown API + UI | **GO** |
| Cache + histórico + UX D6 | **GO** |
| SSH detail default safe | **GO** |
| Rotas on-demand | **NO-GO** (não entregue; esperado) |
| Documentação de fechamento | **GO** |

**Fechamento geral D2–D6B:** **GO** para baseline snapshot + cache; SSH detail e rotas ficam **explicitamente fora** até fases futuras com controlo NOC.

---

## 16. Documentos relacionados

- `docs/bgp/BGP_PEER_DRILLDOWN_CURRENT_STATE.md` (estado atual resumido)
- `docs/bgp/BGP_PEER_DRILLDOWN_ARCHITECTURE.md`
- `docs/bgp/BGP_PEER_DRILLDOWN_DATA_CONTRACT.md`
- `docs/bgp/BGP_PEER_DRILLDOWN_SAFE_CHECKLIST.md`
- Relatórios por fase em `reports/bgp/PHASE_BGP_PEER_DRILLDOWN_*.md`
