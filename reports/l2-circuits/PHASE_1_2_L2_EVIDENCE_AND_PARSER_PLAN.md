# FASE 1.2 — Evidência Manual + Plano de Parser L2

**Date:** 2026-05-23  
**Input:** `PHASE_1_1_HUAWEI_SMOKE_RESULT.md`  
**Device primário:** `device_id=1` — `4WNET-BVA-BRT-RX`  
**Smoke ref:** `run_id=disc-l2-1-1779566591858` — job `completed`, `circuit_count=0`

---

## Objetivo

Descobrir **por que** o smoke 1.1 gravou zero circuitos, **sem** rodar `POST /discover` e **sem** `L2_DISCOVER_SSH_ENABLED=true`.

Classificar a causa em uma destas hipóteses:

| ID | Hipótese | Se confirmada |
|----|----------|----------------|
| **A** | Device 1 não tem L2VC/VSI visível | Aceitar zero; testar device 2/3 só depois |
| **B** | Comandos automáticos retornaram vazio (SSH/prompt) | Corrigir collector/shell antes do parser |
| **C** | Saída real ≠ formato do fixture/parser | Fixture real + ajuste `huawei-vrp-l2.ts` |
| **D** | Allowlist/collector incompleto (falta `include`, mac, etc.) | Expandir allowlist + collector (read-only) |
| **E** | L2 está em device 2 ou 3, não no 1 | Repetir coleta manual em piloto alternativo |

**Escopo desta fase:** coleta **manual** controlada + análise + checklist. **Sem** implementar parser. **Sem** smoke automático.

---

## Contexto FASE 1.1 (resumo)

| Item | Valor |
|------|--------|
| API + SSH read-only | **GO** |
| Dados L2 persistidos | **NO-GO** (0 circuitos) |
| SSH collector automático (4 cmds) | `display mpls l2vc verbose`, `display vsi verbose`, `display interface brief`, `display interface description` |
| Parser automático hoje | só L2VC + VSI (`huawei-vrp-l2.ts`) |
| `L2_DISCOVER_SSH_ENABLED` | **false** (manter) |
| Rollback | OK |

Job `completed` em ~5s sugere: SSH não travou; mais provável **saída vazia** ou **parser sem match** que falha SSH longa.

---

## Regras (obrigatórias)

- **Não** reabilitar `L2_DISCOVER_SSH_ENABLED`.
- **Não** executar `POST /api/l2-circuits/discover`.
- **Não** alterar config no equipamento (`system-view`, `commit`, `save`, `undo`, etc.).
- **Somente** comandos `display` / `show` read-only.
- **Não** NetBox write, SNMP, bulk discovery.
- **Um device por vez** — começar sempre pelo **device 1**.
- Device **2** (`4WNET-BVA-BRT-RA`) e **3** (`4WNET-BVA-CDS-RX`) **somente após** conclusão da análise do device 1.

---

## Coleta manual controlada — device 1

### Quem executa

Operador NOC com acesso SSH ao `4WNET-BVA-BRT-RX` (console ou jump host). **Não** usar a API L2 nesta fase.

### Comandos (ordem sugerida)

Copiar saída **completa** de cada comando (incluir prompt inicial/final se possível).

```text
display mpls l2vc verbose
display vsi verbose
display current-configuration | include vsi|l2vc|xconnect|vlan-type|dot1q
display current-configuration interface
display interface description
display mac-address vsi
display mac-address vlan
```

**Opcional (se `include` acima for vazio):**

```text
display mpls l2vc
display vsi
display interface brief
```

### Onde salvar (paths fixos)

Criar diretório se não existir:

```bash
mkdir -p reports/l2-circuits/manual/device-1
```

| Comando | Arquivo |
|---------|---------|
| `display mpls l2vc verbose` | `reports/l2-circuits/manual/device-1/display_mpls_l2vc_verbose.txt` |
| `display vsi verbose` | `reports/l2-circuits/manual/device-1/display_vsi_verbose.txt` |
| `display current-configuration \| include ...` | `reports/l2-circuits/manual/device-1/display_current_config_l2_include.txt` |
| `display current-configuration interface` | `reports/l2-circuits/manual/device-1/display_current_config_interface.txt` |
| `display interface description` | `reports/l2-circuits/manual/device-1/display_interface_description.txt` |
| `display mac-address vsi` | `reports/l2-circuits/manual/device-1/display_mac_address_vsi.txt` |
| `display mac-address vlan` | `reports/l2-circuits/manual/device-1/display_mac_address_vlan.txt` |

### Sanitização antes de commitar no repo

**Redigir manualmente** (ou com editor) antes de salvar no Git:

- `password`, `cipher`, `simple`, `community`, `snmp-agent community`
- `private-key`, `token`, `secret`
- Substituir por `<redacted>` — mesmo padrão do `redactL2Output()`.

Adicionar cabeçalho em cada arquivo:

```text
# device_id=1 hostname=4WNET-BVA-BRT-RX
# collected_at=YYYY-MM-DDTHH:MM:SSZ
# collector=manual_noc
# command=<comando exato>
```

---

## Matriz de análise (preencher após coleta)

Preencher `reports/l2-circuits/manual/device-1/ANALYSIS.md` (criar na FASE 1.2b) com esta tabela:

| Arquivo | Linhas ~ | Vazio? | Indícios L2 | Hipótese |
|---------|----------|--------|-------------|----------|
| `display_mpls_l2vc_verbose.txt` | | | VC ID, Peer IP, PW | A / C |
| `display_vsi_verbose.txt` | | | VSI Name, BD ID | A / C |
| `display_current_config_l2_include.txt` | | | vsi, l2vc, xconnect, dot1q | D |
| `display_current_config_interface.txt` | | | `vlan-type dot1q`, binding VSI | D |
| `display_interface_description.txt` | | | descrição serviço L2 | fallback VLAN |
| `display_mac_address_vsi.txt` | | | MAC em VSI | limitação |
| `display_mac_address_vlan.txt` | | | MAC em VLAN | limitação |

### Árvore de decisão

```
Coleta manual device 1
│
├─ l2vc_verbose E vsi_verbose vazios (sem blocos ".")
│   ├─ include/config também vazio → hipótese A (sem L2 visível)
│   │   └─ NO-GO parser fix device 1 → avaliar device 2/3 (FASE 1.2c)
│   └─ include/config TEM l2vc/vsi/dot1q → hipótese D (allowlist/collector)
│       └─ GO parser config-only + expandir allowlist (fase implementação)
│
├─ l2vc ou vsi COM dados
│   ├─ parser fixture atual extrai? (teste offline depois)
│   │   ├─ NÃO extrai → hipótese C → GO parser fix + fixture real
│   │   └─ SIM extrai → hipótese B (automático não recebeu saída) → debug collector
│   └─ formato diferente do fixture NE8000 → GO fixture + parser
│
├─ só interface description / dot1q (sem mpls l2vc/vsi)
│   └─ GO fallback VLAN_LOCAL / QINQ (fase implementação, não agora)
│
└─ mac vsi/vlan sem VSI no verbose
    └─ documentar limitação; mac sozinho não cria circuito MVP
```

---

## Comparação: automático 1.1 vs manual 1.2

| Fonte | Comandos | Parser hoje |
|-------|----------|-------------|
| Smoke 1.1 (API) | 4× display (l2vc, vsi, if brief, if desc) | L2VC + VSI only |
| Manual 1.2 | 7× display (+ include, full if config, mac) | **nenhum** (só evidência) |

**Pergunta-chave:** manual tem L2 onde automático não viu?

- Se **sim** → C ou D (parser ou allowlist/collector).
- Se **não** → A (device 1 sem L2) → device 2/3 depois.

---

## Allowlist — gap conhecido (para fase implementação)

Comandos manuais **não** enviados pelo collector 1.1:

```text
display current-configuration | include vsi|l2vc|xconnect|vlan-type|dot1q
display current-configuration interface
display mac-address vsi
display mac-address vlan
```

`display current-configuration interface` já está na allowlist (forma parametrizada).  
`| include` e pipes com regex podem **não** bater na allowlist atual — validar em `commands.ts` antes de implementar.

**Não expandir allowlist nesta fase** — apenas documentar no `ANALYSIS.md`.

---

## Device 2 / 3 — quando testar

| Condição | Ação |
|----------|------|
| Device 1 manual **sem** L2 em todos os arquivos | Copiar estrutura para `manual/device-2/` e `manual/device-3/` |
| Device 1 manual **com** L2 mas parser não extraiu | **Não** ir para device 2 até fix parser com fixture device 1 |
| Device 1 tem L2 só em config, não em mpls/vsi verbose | Fix parser/allowlist no 1; re-smoke 1.1 depois |

**Pilotos alternativos:**

| device_id | hostname | ip |
|-----------|----------|-----|
| 2 | 4WNET-BVA-BRT-RA | 45.169.161.5 |
| 3 | 4WNET-BVA-CDS-RX | 200.213.49.2 |

---

## Checklist — coleta manual (device 1)

- [ ] Acesso SSH read-only confirmado (sem `system-view`)
- [ ] `display mpls l2vc verbose` salvo em arquivo
- [ ] `display vsi verbose` salvo em arquivo
- [ ] `display current-configuration | include ...` salvo
- [ ] `display current-configuration interface` salvo (pode ser grande — OK truncar seções sem L2 **desde que** seções L2 estejam presentes)
- [ ] `display interface description` salvo
- [ ] `display mac-address vsi` salvo
- [ ] `display mac-address vlan` salvo
- [ ] Secrets redigidos em todos os arquivos
- [ ] Cabeçalho metadata em cada arquivo
- [ ] `ANALYSIS.md` preenchido com hipótese A–E
- [ ] **Não** commitar senhas/tokens

---

## Checklist GO/NO-GO — implementar parser (fase código)

### GO para parser fix

Marcar **todos** aplicáveis:

- [ ] Output manual tem **L2VC**, **VSI**, **dot1q**, **l2 binding** ou **mac** relacionado a serviço L2
- [ ] Fixture real salva em `reports/l2-circuits/manual/device-1/` (e copiada para `parsers/__fixtures__/` na implementação)
- [ ] Parser atual **não** extraiu algo que existe na evidência manual
- [ ] Padrão de linha/seção documentado (ex.: separador `...`, labels `VC ID :`, `VSI Name :`)
- [ ] `ANALYSIS.md` aponta hipótese **C** ou **D** (não só A)
- [ ] Plano de teste: parser unitário offline contra fixture (sem SSH)
- [ ] Allowlist validada para comandos novos antes de re-smoke

### NO-GO para parser fix

Se **qualquer** item verdadeiro:

- [ ] Comandos manuais `l2vc verbose` + `vsi verbose` + `include` estão **vazios** ou só “Info: …”
- [ ] Device 1 **realmente** não tem circuito L2 (hipótese **A** confirmada)
- [ ] Não há fixture real salva (só suposição)
- [ ] Evidência contraditória ou incompleta (falta include **e** mpls/vsi)
- [ ] Única pista é MAC sem VSI/VLAN binding — documentar limitação, **não** inventar circuito

### Resultado esperado da decisão

| Decisão | Próximo passo |
|---------|----------------|
| **GO parser** | FASE 1.2-impl: fixtures + `huawei-vrp-l2.ts` + allowlist/collector + testes offline |
| **NO-GO parser (device 1)** | FASE 1.2c: coleta manual device 2 ou 3 |
| **GO config-only** | Parser `CONFIG_ONLY` a partir de `current-configuration` |
| **GO fallback VLAN** | Parser `vlan` / `dot1q_subif` a partir de interface + description |

---

## O que NÃO fazer nesta fase

- Implementar `parseInterfaceBrief`, mac parsers, etc.
- Rodar smoke 1.1 de novo
- `L2_DISCOVER_SSH_ENABLED=true`
- Bulk discovery multi-device
- Alterar equipamento

---

## Entregáveis FASE 1.2 (evidência)

| Entregável | Path |
|------------|------|
| Este plano | `PHASE_1_2_L2_EVIDENCE_AND_PARSER_PLAN.md` |
| Outputs manuais (7 arquivos) | `reports/l2-circuits/manual/device-1/*.txt` |
| Análise + hipótese | `reports/l2-circuits/manual/device-1/ANALYSIS.md` |
| Resultado implementação (futuro) | `PHASE_1_2_PARSER_IMPLEMENTATION_RESULT.md` |

---

## Caminho provável (hipótese inicial)

Com base no smoke 1.1 (~5s, zero circuitos, SSH OK):

1. **Mais provável:** **C** ou **A** — validar com `display mpls l2vc verbose` manual primeiro.
2. Se manual tiver blocos `VC ID` / `VSI Name` → **GO parser** com fixture real do BRT-RX.
3. Se manual vazio → **A** → repetir manual em **device 2** (`BRT-RA`) antes de mudar código.

---

## Referências

- `PHASE_1_1_HUAWEI_SMOKE_RESULT.md`
- `PHASE_1_1_HUAWEI_SMOKE_PLAN.md`
- `workspace/artifacts/api-server/src/modules/l2circuits/parsers/huawei-vrp-l2.ts`
- `workspace/artifacts/api-server/src/modules/l2circuits/collectors/ssh.collector.ts`
- `docs/l2-circuits/MVP.md`
