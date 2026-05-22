# Compliance Findings Analysis — Device 1 (4WNET-BVA-BRT-RX), Job 13

**Analysis Date:** 2026-05-22  
**Total Findings:** 311  
**Device:** 4WNET-BVA-BRT-RX (id=1)  
**Job ID:** 13

---

## Executive Summary

Device 1 compliance run gerou 311 findings, majoritariamente classificados como:
- **Medium** (146): 47% — recomendações operacionais, não blockers
- **High** (83): 27% — riscos operacionais reais (peers eBGP sem policy, policies referenciadas não encontradas)
- **Info** (51): 16% — informativo (NTP, SSH present, etc)
- **Low** (29): 9% — recomendações leves (descrições, etc)
- **Warning** (2): <1% — status intermediate

**Status Atual:** FAILED (por findings reais, não erro sistêmico)  
**Root Cause:** Compliance engine usa severity padrão; não diferencia blocker real de padronização

---

## Resumo por Contexto

| Contexto  | Total | Critical | High | Medium | Low | Info | Unknown |
|-----------|------:|--------:|-----:|-------:|-----:|-----:|--------:|
| bgp       | 228   | 0       | 81   | 86     | 16  | 43   | 0       |
| interface | 71    | 0       | 0    | 58     | 13  | 0    | 0       |
| l3vpn     | 6     | 0       | 1    | 2      | 0   | 3    | 0       |
| security  | 4     | 0       | 1    | 0      | 0   | 3    | 0       |
| ntp       | 1     | 0       | 0    | 0      | 0   | 1    | 0       |
| l2vpn     | 1     | 0       | 0    | 0      | 0   | 1    | 0       |
| **TOTAL** | **311** | **0** | **83** | **146** | **29** | **51** | **0** |

---

## Análise Detalhada por Contexto

### 1. BGP (228 findings, 73% do total)

**Distribuição por Severidade:**
- High: 81 (35%)
- Medium: 86 (38%)
- Info: 43 (19%)
- Low: 16 (7%)
- Warning: 2 (<1%)

**Top Rules:**

1. **"Peer BGP Established"** (76 occurrências)
   - Severidade: high (59), medium (8), info (8), warning (1)
   - **Classificação:** RISCO_OPERACIONAL
   - **Análise:** Peer está não-estabilizado (down). Crítico para borda, warning para core.
   - **Policy:** Deve ser HIGH para customer/provider/IX, MEDIUM para internal iBGP
   - **Aplicável:** 76 peers em estados: Idle, Active, Connect

2. **"Prefix-list referenciada existe"** (44 occurrências)
   - Severidade: medium (44)
   - **Classificação:** RISCO_OPERACIONAL
   - **Análise:** Prefix-list referenciada em policy mas não encontrada em config
   - **Policy:** MEDIUM-HIGH (depende da importância da política)
   - **Aplicável:** 44 policies afetadas

3. **"Cliente com import policy"** (40 occorrências)
   - Severidade: high (38), warning (2)
   - **Classificação:** RISCO_OPERACIONAL
   - **Análise:** Cliente expect import policy (inbound filter) mas ausente
   - **Policy:** HIGH para edge crítica, MEDIUM para balanced
   - **Aplicável:** 40 clients

4. **"Community-filter/list referenciada existe"** (36 occorrências)
   - Severidade: medium (36)
   - **Classificação:** RISCO_OPERACIONAL
   - **Análise:** Community-list referenciada mas não existe
   - **Policy:** MEDIUM (depends on importance)

5. **"Operadora/IX/CDN com export policy"** (16 occorrências)
   - Severidade: high (16)
   - **Classificação:** RISCO_OPERACIONAL
   - **Análise:** Provider/IX deve ter export policy (outbound filter) mas ausente
   - **Policy:** HIGH para borda crítica, MEDIUM para balanced
   - **Aplicável:** 16 providers/IX/CDN

6. **"Peer BGP com descrição"** (16 occorrências)
   - Severidade: low (16)
   - **Classificação:** PADRONIZACAO
   - **Análise:** Peer sem description text
   - **Policy:** LOW (operacional, não blocker)

### 2. Interface (71 findings, 23% do total)

**Distribuição por Severidade:**
- Medium: 58 (82%)
- Low: 13 (18%)

**Top Rules:**

1. **"Subinterface com dot1q"** (58 occorrências)
   - Severidade: medium (58)
   - **Classificação:** PADRONIZACAO
   - **Análise:** Subinterface usando dot1q tag
   - **Policy:** MEDIUM → INFO (é padrão Huawei VRP, não é risk)
   - **Aplicável:** 58 subinterfaces

2. **"Interface ativa com descrição"** (13 occorrências)
   - Severidade: low (13)
   - **Classificação:** PADRONIZACAO
   - **Análise:** Physical/logical interface ativa sem description
   - **Policy:** LOW ou INFO

### 3. L3VPN (6 findings, 2% do total)

**Distribuição por Severidade:**
- Medium: 2 (33%)
- High: 1 (17%)
- Info: 3 (50%)

**Rules:**
- "VRF com RD" (2): HIGH (RD ausente em VRF)
- "VRF com RT import" (2): INFO/MEDIUM
- "VRF com RT export" (2): INFO/MEDIUM

**Classificação:** RISCO_OPERACIONAL / INFORMATIVO

### 4. Security (4 findings, 1% do total)

**Distribuição por Severidade:**
- High: 1 (25%) — Telnet ausente (false positive, já removido)
- Info: 3 (75%) — SSH present, SNMP public ausente (informativo), sysname present

**Classificação:** POSSIVEL_FALSO_POSITIVO

---

## Classificação de Findings por Categoria Operacional

### BLOCKER_REAL (0)
Nenhum finding é realmente um blocker automático. Todos podem ser contextualizados por device role/profile.

### RISCO_OPERACIONAL (190, 61%)
Afeta BGP operacional real:
- Peer BGP não estabelecido: 76
- Import policy ausente: 40
- Export policy ausente (provider/IX): 16
- Prefix-list/community-list referenciada não encontrada: 80
- VRF com RD/RT ausente: 2

**Ação:** Aplicar por device role/severity profile

### PADRONIZACAO (71, 23%)
Interface e BGP peer descriptions:
- Subinterface com dot1q: 58
- Interface sem description: 13

**Ação:** MEDIUM → INFO, não blocker

### INFORMATIVO (43, 14%)
- BGP peer com info status: 43

**Ação:** INFO apenas

### POSSIVEL_FALSO_POSITIVO (4, 1%)
- Telnet ausente, SSH present, SNMP public ausente

**Ação:** Revisar rule lógica

---

## Recomendações de Policy Profile

### Profile 1: `huawei-vrp-edge-strict`
**Quando usar:** Borda crítica, carrier-grade

**Thresholds:**
- Peer BGP not established → HIGH (blocker operacional)
- Customer must have import policy → HIGH
- Provider/IX/CDN must have export policy → HIGH
- Missing prefix-list/community-list → MEDIUM-HIGH (depende de contexto)
- Interface without description → MEDIUM
- Subinterface with dot1q → INFO

**Impacto:** ~150+ HIGH/CRITICAL findings

### Profile 2: `huawei-vrp-edge-balanced` (DEFAULT)
**Quando usar:** Padrão operacional, maioria dos devices

**Thresholds:**
- Peer BGP not established → MEDIUM (warning, verificar)
- Customer must have import policy → MEDIUM
- Provider/IX/CDN must have export policy → MEDIUM
- Missing prefix-list/community-list → MEDIUM
- Interface without description → LOW
- Subinterface with dot1q → INFO (not a pattern issue, é padrão VRP)

**Impacto:** ~200 MEDIUM, ~40 HIGH, rest INFO/LOW

### Profile 3: `huawei-vrp-observe-only`
**Quando usar:** Onboarding, observação sem enforcement

**Thresholds:**
- Tudo vira WARNING/INFO, nenhum FAIL
- BGP findings → MEDIUM-INFO
- Interface findings → INFO
- Security findings → INFO

**Impacto:** 0 FAIL, tudo informativo

---

## Próximos Passos

1. **Criar policy profiles** table + default records
2. **Adicionar operational_category** ao findings (BLOCKER_REAL, RISCO_OPERACIONAL, etc)
3. **Implementar compliance engine** que usa profile
4. **Atualizar UI** com filtros por categoria + profile badge
5. **Executar job com profile balanced** para calibração final
6. **Documentar** thresholds por perfil
7. **Criar tests** para cada profile comportamento

---

## Arquivos Gerados

- `reports/V0_2_5_DEVICE_1_FINDINGS_REVIEW.md` (este arquivo)

## Próximas Entregas

- `compliance_policy_profiles` table + migrations
- `CompliancePolicyProfile` types + API
- Compliance engine refactor usar profile
- Frontend UI update
- Tests + validation
- Documentation
