# PHASE H3.2 — SNMP_FAST BGP Peers Real Pilot Plan

**Date:** 2026-05-27  
**Phase:** H3.2 plan (docs only)  
**Status:** **GO (plan)** — preparar execução real quando SNMP estiver OK

---

## 1. Objetivo

Planejar a execução **SNMP_FAST** para coletar **estado operacional BGP (peers)** em **1 device**, usando:

- **Sem** SSH
- **Sem** discovery
- **Sem** alteração de dispositivo
- **Rollback obrigatório**

Especial: como H2 falhou por rede, **H3.2 só pode executar depois** do **sysDescr.0** responder (pré-requisito de rede).

---

## 2. Escopo (1 device)

- `device_id=1`
- Host / nome: `4WNET-BVA-BRT-RX`
- IP: `45.169.161.255`
- `peerset`: coletar peers do próprio BGP do agente via MIB (sem config)

Regras:

- 1 device apenas (sem bulk)
- não executar SSH
- não executar discovery
- não habilitar outras flags de coleta (apenas o gate SNMP_BGP real durante o teste)

---

## 3. Comandos/testes mínimos (antes do POST)

Confirmar **somente SNMP leitura** (sem walk grande, sem config parse):

1. `sysDescr.0` OK
2. `bgpVersion.0` OK

OIDs (RFC4273 baseline):

- `sysDescr.0` = `1.3.6.1.2.1.1.1.0`
- `bgpVersion.0` = `1.3.6.1.2.1.15.1.1.0`

Se `sysDescr.0` timeout → **NO-GO** imediato (não prosseguir).

---

## 4. Flags (durante o teste real)

Usar:

- `SNMP_POLL_ENABLED=false` (evitar poller legado)
- `NETOPS_SNMP_BGP_REAL_ENABLED=true` **somente durante o teste**
- `BGP_DRILLDOWN_SSH_DETAIL_ENABLED=false` (garantir zero SSH)

Fora do teste: `NETOPS_SNMP_BGP_REAL_ENABLED=false`.

---

## 5. Endpoints

- `POST /api/operational/bgp/collect`
- `GET /api/operational/bgp?device_id=1`
- `GET /api/operational/bgp/summary?device_id=1`

Body do POST:

```json
{ "device_id": 1 }
```

---

## 6. Rollback (obrigatório, imediato após validações)

- `NETOPS_SNMP_BGP_REAL_ENABLED=false`
- manter `SNMP_POLL_ENABLED=false`

Após rollback:

- novo `POST /api/operational/bgp/collect` deve retornar **503** `SNMP_FAST_BGP_DISABLED`.

---

## 7. GO criteria (para permitir avanço)

- [ ] preflight **ok** (`sysDescr.0` e `bgpVersion.0` responderam dentro do budget)
- [ ] job `completed` (ou execução finalizou com sucesso/parcial, conforme implementação)
- [ ] `peer_count >= 1`, **se** MIB/collector do baseline suportar peers
- [ ] `GET /api/operational/bgp?device_id=1` retorna `peers` (lista não-vazia)
- [ ] `GET /api/operational/bgp/summary?device_id=1` retorna `total > 0`
- [ ] logs do `netops-api` **sem** community (sem segredo)
- [ ] **zero** SSH
- [ ] **zero** discovery
- [ ] sem alteração de dispositivos / sem NetBox / sem compliance

---

## 8. NO-GO criteria (falhar e parar)

- [ ] `sysDescr.0` timeout (rede SNMP não OK)
- [ ] `bgpVersion.0` timeout
- [ ] MIB BGP indisponível (baseline e fallback não retornam peers)
- [ ] `peer_count=0` **com BGP ativo** (suspeita de OIDs/VRF mapping/fallback)

Se NO-GO:

- rollback deve ser aplicado imediatamente
- abrir/registrar ticket NOC (§11)

---

## 9. Plano de fallback (se RFC4273 não retornar peers)

- Se **RFC4273** não retornar peers em H3.2:
  - não tentar “config/ad hoc”
  - planejar em **fase posterior** o uso de:
    1. BGP4-V2-MIB
    2. Huawei BGP MIB

Na H3.2, manter foco no baseline + logs para evidência.

---

## 10. Comandos de teste seguro (somente leitura SNMP)

Somente para pré-check (operador), sem registrar segredos em logs:

1. sysDescr.0:

```bash
snmpget -v2c -c '<COMMUNITY>' -t 1 -r 0 45.169.161.255 1.3.6.1.2.1.1.1.0
```

2. bgpVersion.0:

```bash
snmpget -v2c -c '<COMMUNITY>' -t 1 -r 0 45.169.161.255 1.3.6.1.2.1.15.1.1.0
```

Interpretação:

- OK: responder em poucos segundos
- Timeout: parar e ir para §11

---

## 11. Ticket NOC se continuar timeout

Se `sysDescr.0` ou `bgpVersion.0` timeout repetido:

1. criar/atualizar ticket NOC com:
   - device `1` / IP `45.169.161.255`
   - OIDs tentados (`sysDescr.0`, `bgpVersion.0`)
   - evidência de timeout (timestamp)
   - requisito: UDP/161 e **source IP** correto liberado na NE
2. aguardar liberação de rede antes de qualquer POST de coleta real

---

## Critério (deste documento)

- doc criado
- **zero rede** (não executar aqui)
- **zero código**
- GO/NO-GO para execução futura

