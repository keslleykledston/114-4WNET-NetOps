# FASE 1.2 — Análise de Evidência Manual (device 1)

**Date:** 2026-05-23 (reanálise pós-coleta NOC)  
**Device:** `device_id=1` — `4WNET-BVA-BRT-RX` (`45.169.161.255`, huawei/vrp)  
**Smoke 1.1:** `run_id=disc-l2-1-1779566591858`, `circuit_count=0`, job `completed`  
**Plan:** `PHASE_1_2_L2_EVIDENCE_AND_PARSER_PLAN.md`

---

## Resumo executivo

Coleta manual **7/7 arquivos** presentes. Device 1 **tem L2 operacional**, mas **não** no formato MPLS L2VC/VSI verbose que o parser MVP espera.

| Achado | Detalhe |
|--------|---------|
| MPLS L2VC / VSI clássico | **Ausente** (comandos vazios ou erro Huawei) |
| Dot1Q / subinterfaces | **Presente** (~130 VLANs, ~129 subifs na description) |
| Virtual-Ethernet + ve-group | **Presente** (VSI-style, ex. `EN-NETFAST-BVA-BRT-VSI`) |
| MAC VSI/VLAN | **Inconclusivo** (comando exige parâmetro; summary=0 dynamic) |
| QinQ | **Não encontrado** nesta evidência |

**Hipótese vencedora:** **C + D** (parser não reconhece formato real **e** collector/escopo insuficiente para config/interface).

**Não** é hipótese **A** pura (device sem L2). **Não** é **E** primária (L2 está no device 1).

| Decisão | Resultado |
|---------|-----------|
| **GO parser fix** | **SIM** — escopo dot1q + interface description + config interface (VE opcional) |
| **GO manual device 2** | **NÃO** — fechar parser no padrão device 1 primeiro |
| **Re-smoke 1.1** | Só após implementação + flag SSH |

---

## Arquivos analisados

| # | Arquivo | Existe | Tamanho | Utilidade |
|---|---------|--------|---------|-----------|
| 1 | `display_mpls_l2vc_verbose.txt` | sim | ~18 linhas | Erro `Wrong parameter` + `l2vc` / `l2vpn l2vc-info` vazios |
| 2 | `display_vsi_verbose.txt` | sim | ~12 linhas | `vsi verbose` e `vsi` vazios |
| 3 | `display_current_config_l2_include.txt` | sim | ~136 linhas | **131×** `vlan-type dot1q <id>`; sem linhas `vsi`/`l2vc`/`xconnect` |
| 4 | `display_current_config_interface.txt` | sim | ~22 KB | Blocos `interface` + dot1q + **Virtual-Ethernet** + `ve-group` |
| 5 | `display_interface_description.txt` | sim | ~9.9 KB | **~129** subinterfaces com PHY/Protocol/Description |
| 6 | `display_mac_address_vsi.txt` | sim | ~16 linhas | Erro `Incomplete command` (precisa VSI name) |
| 7 | `display_mac_address_vlan.txt` | sim | ~19 linhas | Erro vlan; `display mac-address summary` → 0 dynamic MAC |

**Segredos:** nenhum `password`/`community`/`cipher`/`token` nos `.txt` analisados.

---

## Evidências L2 por tipo

| Tipo | Encontrado? | Fonte | Exemplo |
|------|-------------|-------|---------|
| **L2VC (MPLS PW)** | **Não** | l2vc verbose / l2vc / l2vpn l2vc-info | — |
| **VSI / VPLS clássico** | **Não** | vsi verbose / vsi | — |
| **VPWS** | **Não** | — | — |
| **xconnect** | **Não** | include filter | — |
| **vlan-type dot1q** | **Sim (massivo)** | include + config interface | `vlan-type dot1q 77`, `Eth-Trunk0.77` |
| **QinQ** | **Não** | grep qinq/inner-vlan | — |
| **Virtual-Ethernet / ve-group** | **Sim** | config interface | `VE0/2/21.100`, `ve-group 2 l3-access`, `l2-terminate` |
| **VSI-style (description)** | **Sim** | config + description | `EN-NETFAST-BVA-BRT-VSI` |
| **l2 binding** | **Parcial** | ve-group + dot1q em VE | VE ↔ VLAN 100/101 |
| **MAC VSI** | **Não coletado** | mac vsi sem nome | erro CLI |
| **MAC VLAN** | **Não coletado** | mac vlan sem ID | erro CLI; summary=0 |

### Amostras representativas (sanitizadas)

**Dot1Q + serviço (interface description):**

```text
Eth-Trunk0.77    up  up  EN-4WNET-BVA-CDS-RX_M4
Eth-Trunk0.894   up  down ALLFIBER-CROSSCONNECT-4WNET
VE0/2/21.100     up  up  EN-NETFAST-BVA-BRT-VSI
```

**Virtual-Ethernet (current-configuration interface):**

```text
interface Virtual-Ethernet0/2/21
 ve-group 2 l3-access
interface Virtual-Ethernet0/2/21.100
 vlan-type dot1q 100
 description EN-NETFAST-BVA-BRT-VSI
 mpls
 mpls ldp
```

**MPLS L2VC (ausente):**

```text
display mpls l2vc verbose → Error: Wrong parameter found at '^' position.
display mpls l2vc → (vazio)
```

---

## Classificação hipóteses A–E

| ID | Hipótese | Veredito | Evidência |
|----|----------|----------|-----------|
| **A** | Device 1 sem L2 | **Rejeitada** | Centenas de dot1q + VE + descriptions de serviço |
| **B** | SSH automático retornou vazio | **Parcial** | Auto envia os mesmos cmds: l2vc/vsi vazios **no device**; description/config **teriam** dados se parseados |
| **C** | Parser não reconhece formato real | **Confirmada** | `parseHuaweiL2Circuits(manual)` → **0 circuitos** (teste offline) |
| **D** | Allowlist/collector insuficiente | **Confirmada** | Coleta `interface brief/description` mas **não parseia**; não persiste `current-configuration interface` |
| **E** | L2 só no device 2/3 | **Rejeitada como primária** | Device 1 já prova L2 dot1q/VE; device 2/3 pode ter **também** L2VC — investigar depois |

### Hipótese vencedora

## **C + D** (combinadas)

- **C:** fixture/parser NE8000 L2VC/VSI ≠ realidade BRT-RX (dot1q/VE).
- **D:** MVP não transforma `display interface description` + `current-configuration interface` em circuitos.

Smoke 1.1 `circuit_count=0` é **esperado** com parser/collector atuais, **não** prova ausência de L2.

---

## Campos esperados (próxima implementação)

Prioridade **P0** — circuitos dot1q a partir de description + config:

| Campo | Fonte | Exemplo device 1 |
|-------|--------|------------------|
| `circuit_type` | subif com dot1q | `dot1q_subif` |
| `name` | interface ou description | `Eth-Trunk0.77` ou `EN-4WNET-BVA-CDS-RX_M4` |
| `local_interface` | description / config | `Eth-Trunk0.77` |
| `parent_interface` | parse subif | `Eth-Trunk0` |
| `outer_vlan` | VLAN do subif | `77` |
| `inner_vlan` | QinQ se existir | null neste device |
| `description` | description column | `ALLFIBER-CROSSCONNECT-4WNET` |
| `admin_status` / `oper_status` | PHY / Protocol | `up` / `up` ou `up`/`down` |
| `vc_id` | l2vc verbose | null neste device |
| `vsi_name` | VE description | `EN-NETFAST-BVA-BRT-VSI` (caso VE) |
| `peer_ip` | l2vc | null para dot1q local |
| `source` | — | `ssh_live` ou `cached_config` |
| `raw_evidence` | trecho redigido | ≤240 chars |

Prioridade **P1** — Virtual-Ethernet / ve-group:

| Campo | Fonte |
|-------|--------|
| `circuit_type` | `vsi` ou novo `ve_l2` |
| `local_interface` | `Virtual-Ethernet0/2/21.100` |
| `vsi_name` | token `-VSI` em description |

Prioridade **P2** — MPLS L2VC (outros devices):

| Campo | Fonte |
|-------|--------|
| `vc_id`, `peer_ip`, `pw_status` | `display mpls l2vc verbose` quando existir |

---

## Parser gap (código atual)

Arquivo: `workspace/artifacts/api-server/src/modules/l2circuits/parsers/huawei-vrp-l2.ts`

| Gap | Impacto |
|-----|---------|
| Só `parseL2vcVerbose` + `parseVsiVerbose` | Ignora ~129 subifs device 1 |
| Não parseia `display interface description` | Perde status + description operacional |
| Não parseia `display current-configuration interface` | Perde dot1q + VE + ve-group |
| Não parseia `display interface brief` | Coletado no auto, descartado |
| Fixture NE8000 ≠ BRT-RX | Testes passam, produção retorna 0 |
| MAC | Comandos Huawei exigem `vsi <name>` / `vlan <id>` — fora do MVP collector |

**Teste offline (manual device 1 → parser atual):** `0` circuitos.

Collector (`ssh.collector.ts`): 4 comandos; **não** inclui `current-configuration interface` nem `include` filter.

---

## Fixtures recomendadas (antes de codar)

Copiar trechos sanitizados para:

```text
workspace/artifacts/api-server/src/modules/l2circuits/parsers/__fixtures__/manual-device-1/
  display_interface_description-brt-rx.txt
  display_current_config_interface-ve-sample.txt
  display_mpls_l2vc_verbose-empty.txt
  display_vsi_verbose-empty.txt
```

**Não criadas nesta fase** (só análise).

---

## GO / NO-GO — parser fix

### GO (implementar FASE 1.2-impl)

- [x] Output manual tem L2 (**dot1q**, VE, VSI-style description)
- [x] Fixture real disponível em `reports/l2-circuits/manual/device-1/`
- [x] Parser atual não extrai o que existe (**0 vs ~130** circuitos potenciais)
- [x] Padrão claro: `Interface + PHY + Protocol + Description`; `vlan-type dot1q N`; blocos `Virtual-Ethernet`

**Escopo GO:** parser + collector para **dot1q_subif** (+ merge description); **não** exigir L2VC neste device.

### NO-GO (não fazer ainda)

- Parser L2VC/VSI clássico **só** com fixture sintético NE8000 (sem evidência BRT-RX)
- Tratar **todos** ~130 VLANs como “circuito cliente” sem regra de filtro (risco ruído — definir heurística: subif com description não vazia ou lista allow)
- MAC sem VSI name conhecido

### Decisão parser fix

## **GO** — com escopo **dot1q + interface description + config interface (VE)**

---

## GO / NO-GO — manual device 2

| Critério | Status |
|----------|--------|
| Device 1 analisado com evidência | **Sim** |
| Hipótese A no device 1 | **Não** |
| Parser path definido para device 1 | **Sim** (C+D) |
| L2VC ainda desconhecido em outros piloto | device 2/3 **podem** ter L2VC |

### Decisão device 2

## **NO-GO** agora

Implementar e validar parser dot1q/VE no device 1 → re-smoke → **depois** coleta manual device 2 (`4WNET-BVA-BRT-RA`) **se** ainda precisar cobrir MPLS L2VC.

---

## Próximos passos

1. **FASE 1.2-impl:** criar fixtures `manual-device-1/` a partir dos `.txt` redigidos.
2. Implementar parsers:
   - `parseInterfaceDescription()` → dot1q_subif + status
   - `parseConfigInterface()` → enriquecer VLAN/VE/ve-group
   - merge por `local_interface`
3. Expandir collector (read-only): usar outputs já coletados; opcional `display current-configuration interface` (pesado).
4. Testes unitários offline → expect **>0** circuitos para device 1.
5. Re-smoke 1.1 no device 1 (`L2_DISCOVER_SSH_ENABLED=true`, rollback depois).
6. Se L2VC necessário: manual device 2/3 com `display mpls l2vc verbose`.

---

## Referências

- `reports/l2-circuits/manual/device-1/*.txt`
- `reports/l2-circuits/manual/device-1/ANALYSIS.md`
- `reports/l2-circuits/manual/s6730-brt-a/*.txt` (addendum abaixo)
- `PHASE_1_1_HUAWEI_SMOKE_RESULT.md`
- `workspace/artifacts/api-server/src/modules/l2circuits/parsers/huawei-vrp-l2.ts`
- `workspace/artifacts/api-server/src/modules/l2circuits/collectors/ssh.collector.ts`

---

## Addendum — evidência S6730 (`4WNET-BVA-BRT-A_S6730-H48X6C`)

**Date:** 2026-05-23  
**Fonte:** paste operador NOC (não estava no inventário piloto device_id 1/2/3)

### O que muda

| Antes (só BRT-RX) | Com S6730 |
|-------------------|-----------|
| L2VC clássico “ausente” no piloto | **82 LDP VC** em `display mpls l2vc` (63 up / 19 down) |
| VSI vazio no RX | VSI `SERVICOS_CDS` (ID 601, peer `10.200.4.1`, state up) |
| MAC inconclusivo | `display mac-address vlan 612` → 1 MAC em Eth-Trunk2 |
| Hipótese E fraca | **E reforçada parcialmente:** L2VC MPLS mora no **switch downstream**, não no NE8000 RX |

Topologia já visível no device 1: `Eth-Trunk0` → `DOWNLINK-BRT-BO:A_S6730`, `Eth-Trunk1.80` → `4WNET-BVA-BRT-A`. O S6730 é **vizinho L2** do BRT-RX; PW/VSI clássico aparece **lá**, não no edge router.

### Formato CLI vs parser MVP

| Campo | Fixture NE8000 (`verbose`) | S6730 (`display mpls l2vc`) |
|-------|---------------------------|-----------------------------|
| Separador de bloco | `...........` | bloco por VC, linha `*client interface` |
| Peer | `Peer IP :` | `destination :` |
| Interface local | `Interface(Admin) :` | `client interface : Vlanif15 is up` |
| Estado oper | `Oper Status` / `PW Status` | `VC state`, `link state`, `session state` |
| Tipo | `VC Type : Ethernet VLAN` | `VC type : VLAN` |

| Campo | Fixture VSI NE8000 | S6730 VSI |
|-------|-------------------|-----------|
| Nome | `VSI Name :` | `***VSI Name :` |
| Peer | `Peer IP (remote) :` | `Peer Router ID :` |
| ID | `VSI ID :` | `VSI ID :` (igual) |

**Conclusão parser:** hipótese **C** ampliada — não só dot1q/VE no RX; falta **segundo dialecto** S6730/switch para `l2vc` **sem** `verbose` e VSI com `Peer Router ID`.

### Comando collector

Ordem sugerida (read-only):

1. `display mpls l2vc verbose` (NE8000)
2. **`display mpls l2vc`** ← funciona no S6730; falhou `verbose` no RX
3. `display mpls l2vpn l2vc-info` (fallback RX)
4. `display vsi verbose` (mesmo comando; parser precisa aceitar ambos layouts)

### Mapeamento exemplo VC ID 15 (S6730)

| Campo modelo | Valor |
|--------------|-------|
| `vc_id` | 15 |
| `circuit_type` | vpws (VLAN) |
| `peer_ip` | 10.200.5.1 |
| `local_interface` | Vlanif15 |
| `oper_status` | down (`VC state` / `link state`) |
| `pw_status` | session up, remote not forwarding (0x1) |

### Decisões revisadas

| Item | Antes | Depois |
|------|-------|--------|
| **GO parser fix** | dot1q + VE (RX) | **+ S6730 l2vc + VSI dialect** |
| **GO manual device 2** | NO-GO até RX ok | Ainda **NO-GO** — fechar parsers offline com fixtures RX **e** S6730 |
| **Re-smoke alvo** | só device 1 | device 1 (dot1q) **+** incluir S6730 no inventário **ou** smoke em BRT-RA/CDS-RX se tiverem `l2vc` |
| **Hipótese E** | rejeitada como primária | **Secundária válida:** tipo de equipamento/papel na rede, não só device_id 2/3 |

### Próximo passo impl (prioridade)

1. Fixture `parsers/__fixtures__/manual-s6730/` a partir de `manual/s6730-brt-a/`.
2. `parseMplsL2vc()` — blocos `*client interface` + `VC ID` + `destination`.
3. Estender `parseVsiVerbose()` — `Peer Router ID`, prefixo `***VSI Name`.
4. Collector: fallback `display mpls l2vc` quando `verbose` erro/vazio.
5. Cadastrar S6730 (ou hostname conhecido) para smoke L2VC real após parsers passarem em teste offline.
