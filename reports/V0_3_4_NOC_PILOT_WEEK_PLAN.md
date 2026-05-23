# Plano de Piloto NOC — 1 Semana v0.3.4-rc1

**Data:** 2026-05-23  
**Status:** Ready for Deployment  
**Version:** v0.3.4-rc1  
**Escopo:** Piloto assistido NOC por 1 semana

---

## Objetivo

Validar uso do NetOps Manager em operação real assistida, sem alterar dispositivos, com objetivo de:
1. Confirmar workflows operacionais funcionam em cenário real
2. Coletar feedback dos operadores
3. Identificar mejoras antes de produção controlada
4. Validar RBAC em prática
5. Validar audit trail completa

---

## Escopo Permitido (Read-Only + Safe Operations)

### ✅ Permitido durante piloto

**Device Management:**
- ✅ Visualizar devices (GET)
- ✅ Listar devices com filtros
- ✅ Ver detalhes do device
- ✅ Testar conectividade SSH/SNMP (POST test-connectivity)
- ✅ Importar devices (CSV preview + apply com aprovação)
- ✅ Exportar devices (CSV/JSON)

**Discovery & Inspection:**
- ✅ Rodar device discovery (full mode, read-only)
- ✅ Ver discovery snapshots
- ✅ Inspecionar interfaces
- ✅ Consultar BGP peers (list + detail)
- ✅ Consultar prefixos recebidos/advertidos (route query)
- ✅ Ver VRF/L3VPN configuration (read-only)

**Compliance:**
- ✅ Criar compliance jobs (com profiles selecionadas)
- ✅ Rodar compliance scans
- ✅ Ver findings (current, stale, legacy)
- ✅ Exportar relatórios (markdown, CSV, JSON)
- ✅ Agrupar findings por policy

**Audit & Monitoring:**
- ✅ Consultar audit logs
- ✅ Filtrar por ator, ação, data
- ✅ Exportar audit (futura v0.3.6)
- ✅ Verificar últimos eventos

**User & Session:**
- ✅ Ver sessões ativas
- ✅ Revogar sessão própria

### ❌ Proibido durante piloto

**Configuração (Apply):**
- ❌ Aplicar configuração em device (apply bloqueado)
- ❌ Rollback de configuração
- ❌ Entrar em modo config
- ❌ Criar template real com apply

**NetBox Integration:**
- ❌ Sincronizar com NetBox real
- ❌ Escrever em NetBox
- ❌ Modificar mapeamento de fields

**User Management:**
- ❌ Criar usuários (apenas admin via backend)
- ❌ Alterar permissões
- ❌ Resetar senhas de outros

**Fora dos Devices Piloto:**
- ❌ Operar em devices fora da lista (exceto visualização)
- ❌ Importar devices em massa sem aprovação
- ❌ Deletar devices do banco

---

## Devices Piloto Autorizados

| ID | Hostname | Vendor | Platform | Role | Site | Status |
|----|----------|--------|----------|------|------|--------|
| 1 | 4WNET-BVA-BRT-RX | Huawei | VRP | RX | BVA-BRT | Active |
| 2 | 4WNET-BVA-BRT-RA | Huawei | VRP | RX | BVA-BRT | Active |
| 3 | 4WNET-BVA-CDS-RX | Huawei | VRP | RX | BVA-CDS | Active |

**Nota:** Operadores podem visualizar outros devices mas não devem executar operações em devices fora desta lista sem aprovação.

---

## Papéis & Permissões Piloto

### Viewer Role
- Visualizar devices, discovery, compliance (read-only)
- Não rodar operações
- Não exportar relatórios completos

### Operator Role (Principal)
- Tudo que viewer + testar conectividade, discovery, compliance
- Exportar relatórios
- Consultar audit logs
- Não importar/deletar em massa

### Admin Role (Suporte)
- Acesso completo
- Gerenciar usuários
- Monitor overall
- Resolver blockers

---

## Métricas a Acompanhar

### KPIs Diárias
- **Logins:** Quantidade de logins/dia por papel
- **Discoveries:** Total rodados, sucesso/falha rate
- **SSH/SNMP:** Falhas por device/causa
- **BGP Queries:** Route queries executadas, timeout rate
- **Compliance:** Jobs/dia, tempo médio, findings por profile
- **Exports:** Relatórios baixados, formatos usados
- **Audit Events:** Total/dia, sensíveis detectadas

### Métricas de Qualidade
- **Discovery Time:** Média por device (target: < 30sec)
- **Route Query Time:** Média por peer (target: < 5sec)
- **False Positives:** Compliance findings não-acionáveis
- **Permission Errors:** 403s não-esperados
- **Secret Exposure:** Nenhum
- **Availability:** Uptime containers

### Feedback Operacional
- Usabilidade (1-5 score)
- Relatórios úteis (sim/não)
- Fricções encontradas (lista)
- Features faltantes (lista)
- Recomendações (lista)

---

## Checklist Diário (NOC)

### Morning (início de turno)
- [ ] Verificar containers healthy (`docker compose ps`)
- [ ] Health check API (`curl /api/healthz`)
- [ ] Listar devices
- [ ] Revisar últimos audit events
- [ ] Revisar scheduled jobs status
- [ ] Verificar se há alerts/warnings

### Daily Operations
- [ ] Rodar connectivity test em devices críticos (ID 1, 2, 3)
- [ ] Rodar discovery em 1 device (rotativo)
- [ ] Consultar BGP peers em device com BGP
- [ ] Consultar prefixos em 1-2 peers
- [ ] Rodar compliance em 1-2 devices
- [ ] Exportar relatório de compliance (se needed)
- [ ] Revisar compliance findings críticos
- [ ] Registrar tempo de operações

### Evening (fim de turno)
- [ ] Revisar audit log do dia
- [ ] Exportar audit log do dia (backup)
- [ ] Listar issues/blockers encontrados
- [ ] Anotar feedback operacional
- [ ] Atualizar planilha de métricas
- [ ] Preparar handoff para próximo turno

---

## Critério de Sucesso (Go/No-Go Produção)

### Blocker (Fail Imediato)
❌ Secret exposto  
❌ Data loss ou corrupção  
❌ Crash crítico não-recuperável  
❌ RBAC bypass  
❌ Apply acidental (se bloqueado)  

### Critério de Pass (1 semana)
✅ Nenhum blocker encontrado  
✅ NOC consegue executar 80% de operações sem assistência  
✅ Relatórios úteis e corretos  
✅ Compliance findings acionáveis  
✅ BGP routes validadas  
✅ Audit log completo e legível  
✅ Feedback positivo 4+/5  

### Critério de Deferral (Melhoras Pendentes)
⚠️ Falsos positivos > 20%  
⚠️ Fricções operacionais detectadas  
⚠️ Permissões incompletas  
⚠️ Performance < esperada  

---

## Runbook Emergência

Se encontrar blocker durante piloto:

1. **Não aplicar workarounds sem aprovação**
2. **Documentar issue exato:**
   - O que tentou fazer
   - O que deu errado (erro exato)
   - Device/data afetado
   - Timestamp do evento

3. **Escalar:**
   - Slack #netops-pilot
   - On-call engineer
   - Aguardar fix ou guidance

4. **Continuar:**
   - Use workaround aprovado ou pause operação
   - Não tente contornar RBAC/segurança
   - Não delete/modify sem confirmação

---

## Recursos de Suporte

- **Documentação:** docs/NOC_OPERATIONAL_CHECKLIST.md, docs/NOC_INCIDENT_RUNBOOK.md
- **Feedback:** reports/V0_3_4_UX_FEEDBACK_CHECKLIST.md
- **Contato:** Slack #netops-pilot, email netops-eng@company
- **On-Call:** Escalation path na runbook

---

## Timeline

| Dia | Atividade |
|----|-----------|
| 1 (Thu) | Onboarding, setup, familiarizar com UI |
| 2-4 (Fri-Sun) | Daily ops, operador principal toma lead, feedback |
| 5-7 (Mon-Wed) | Operações independentes, coleta métrics finais |
| Final (Thu) | Review, go-live decision, retrospective |

---

## Decision Tree

```
Day 7 Review:
  ├─ Nenhum blocker + feedback positivo
  │  └─ ✅ GO FOR PRODUCTION CONTROLADA
  │
  ├─ Blockers fixáveis + feedback positivo
  │  └─ ⚠️ GO WITH RESTRICTIONS + fix timeline
  │
  └─ Blockers maiores ou feedback negativo
     └─ ❌ NO-GO + iteração v0.3.5
```

---

**Status:** Ready for Deployment  
**Date:** 2026-05-23  
**Next:** Deploy to NOC pilot + daily standups
