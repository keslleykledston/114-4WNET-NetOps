# FASE 1.5 — Parser S6730 L2VC/VSI (Offline)

**Date:** 2026-05-23  
**Device ref:** `4WNET-BVA-BRT-A_S6730-H48X6C`  
**Scope:** parser offline only — sem SSH, sem discover, sem collector change

---

## Resumo executivo

Parser Huawei L2 estendido para dialecto **S6730/switch**:

- `display mpls l2vc` (non-verbose) → L2VC/VPWS
- `display vsi verbose` (S6730 layout) → VSI

**Selftest OK.** Regressão **131 dot1q** + **6 NE8000** intacta.

Fixture manual tem **1 bloco VC** (VC 15) + header **82 total (63 up / 19 down)**. Parser pronto para output completo; counts 63/19 validados quando fixture tiver 82 blocos.

---

## Fixtures usadas

Origem: `reports/l2-circuits/manual/s6730-brt-a/`

Destino: `workspace/artifacts/api-server/src/modules/l2circuits/__fixtures__/manual-s6730-brt-a/`

| Arquivo | Uso |
|---------|-----|
| `display_mpls_l2vc.txt` | L2VC S6730 + summary header |
| `display_vsi_verbose.txt` | VSI SERVICOS_CDS |
| `display_mac_address_vlan_612.txt` | documentação only (não parseado) |

---

## Arquivos alterados

| Arquivo | Mudança |
|---------|---------|
| `parsers/s6730-l2.parser.ts` | **novo** — L2VC + VSI S6730 |
| `parsers/huawei-vrp-l2.ts` | wire `display mpls l2vc` + VSI dialect detect |
| `l2circuits.types.ts` | `REMOTE_NOT_FORWARDING`; campos AC/session/remote; key `display mpls l2vc` |
| `normalizers/status.normalizer.ts` | `partial` → PARTIAL |
| `normalizers/findings.resolver.ts` | REMOTE_NOT_FORWARDING; skip DESCRIPTION_MISSING l2vc/vsi |
| `tools/l2-s6730-parser-selftest.mjs` | **novo** |
| `__fixtures__/manual-s6730-brt-a/*` | **copiados** |

**Não alterado:** collector, service, `.env`, device 1 pipeline.

---

## Formato S6730 identificado

### L2VC (`display mpls l2vc`)

| Campo CLI | Campo modelo |
|-----------|--------------|
| `*client interface : Vlanif15 is up` | `local_interface`, AC link |
| `destination : 10.200.5.1` | `peer_ip` |
| `VC ID : 15` | `vc_id`, `outer_vlan` (tipo VLAN) |
| `VC type : VLAN` | `circuit_type=vpws` |
| `VC state : down` | `pw_status`, oper derivation |
| `session state : up` | `session_state` |
| `AC status : up` | `ac_status` |
| `remote forwarding state : not forwarding` | `remote_forwarding_state` |
| `link state : down` | oper derivation |

Blocos separados por linha `*client interface`.

### VSI (`display vsi verbose`)

| Campo CLI | Campo modelo |
|-----------|--------------|
| `***VSI Name : SERVICOS_CDS` | `vsi_name` |
| `VSI ID : 601` | `vsi_id` |
| `Peer Router ID : 10.200.4.1` | `peer_ip` |
| `VSI State : up` | `admin_status` |
| `Session : up` | `oper_status` |

Detect: `***VSI Name` ou `Peer Router ID` → parser S6730 (senão NE8000 dots).

---

## Quantidade extraída (fixture manual)

| Métrica | Header CLI | Parser (fixture parcial) |
|---------|------------|--------------------------|
| Total L2VC | **82** | **1** bloco presente |
| UP | **63** | n/a (precisa 82 blocos) |
| DOWN | **19** | **1** (VC 15) |
| VSI | — | **1** (SERVICOS_CDS) |

**Limitação:** evidência NOC = 1 VC sample + summary line. Parser multi-bloco validado estruturalmente; counts 63/19 testados via header + branch condicional no selftest.

---

## VC 15 (parseado)

| Campo | Valor |
|-------|-------|
| `vc_id` | 15 |
| `circuit_type` | `vpws` |
| `local_interface` | `Vlanif15` |
| `peer_ip` | `10.200.5.1` |
| `outer_vlan` | 15 |
| `ac_status` | up |
| `session_state` | up |
| `remote_forwarding_state` | not forwarding |
| `oper_status` (normalizado) | **DOWN** |
| `pw_status` | down |

### Regra oper status (documentada)

1. `VC state down` **ou** `link state down` → **DOWN**
2. `remote forwarding not forwarding` + sessão/AC up + VC up → **PARTIAL**
3. VC up + AC up + remote forwarding → **UP**
4. VC 15: VC down → **DOWN** (não PARTIAL), apesar session/AC up

---

## VSI SERVICOS_CDS

| Campo | Valor |
|-------|-------|
| `circuit_type` | `vsi` |
| `vsi_name` | SERVICOS_CDS |
| `vsi_id` | 601 |
| `peer_ip` | 10.200.4.1 |
| `admin_status` | up |
| `oper_status` | UP (session up) |
| `description` | SERVICOS_CDS |

---

## Findings (VC 15)

| Code | Severity | Quando |
|------|----------|--------|
| `CIRCUIT_DOWN` | error | oper DOWN |
| `REMOTE_NOT_FORWARDING` | warning | remote forwarding = not forwarding |
| `DESCRIPTION_MISSING` | — | **não** emitido para l2vc/vsi sem description CLI |

---

## Testes executados

```bash
cd workspace/artifacts/api-server && pnpm typecheck   # OK
cd workspace/artifacts/api-server && pnpm build     # OK
node tools/l2-s6730-parser-selftest.mjs             # OK
node tools/l2-dot1q-parser-selftest.mjs             # OK — 131 + 6
```

| Regressão | Resultado |
|-----------|-----------|
| Device 1 dot1q | **131** vlan_local |
| NE8000 L2VC/VSI | **6** circuitos |
| S6730 header | 82 / 63 / 19 |
| S6730 parse | 1 L2VC + 1 VSI |
| VC 15 findings | CIRCUIT_DOWN + REMOTE_NOT_FORWARDING |

---

## Limitações

1. **Fixture parcial** — só 1/82 blocos L2VC; coleta completa necessária para validar 63/19 live.
2. **MAC** — `display mac-address vlan 612` fixture guardada; sem parser/coleta dinâmica (precisa VLAN ID).
3. **Collector** — ainda só `display mpls l2vc verbose`; fallback `display mpls l2vc` = **FASE 1.6**.
4. **S6730 no inventário** — smoke live precisa device cadastrado.
5. **remoteForwardingState** — parseado para findings; **não** persistido em coluna DB (campo parser-only hoje).

---

## GO / NO-GO

### FASE 1.6 — collector fallback + smoke S6730

## **GO**

Pré-requisitos 1.6:

1. Collector: `display mpls l2vc verbose` → fallback `display mpls l2vc` se erro/vazio
2. Device S6730 no DB (ou hostname conhecido)
3. Coleta manual completa `display mpls l2vc` (82 blocos) recomendada antes smoke
4. `L2_DISCOVER_SSH_ENABLED=true` temporário + rollback
5. **Não** misturar com re-smoke device 1 RX

### Encerrar parser S6730 offline

## **GO**

Critérios FASE 1.5 atingidos.

---

## Referências

- `reports/l2-circuits/PHASE_1_4_DEVICE1_RESMOKE_RESULT.md`
- `reports/l2-circuits/manual/s6730-brt-a/`
- `tools/l2-s6730-parser-selftest.mjs`
- `parsers/s6730-l2.parser.ts`
