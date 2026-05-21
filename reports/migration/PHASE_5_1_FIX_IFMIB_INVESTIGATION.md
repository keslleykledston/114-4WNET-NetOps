# FASE 5.1.fix: IF-MIB Investigation

**Data:** 2026-05-21  
**Status:** 🔍 Investigando  
**Root Cause:** Pendente

## Achado

SNMP real executa com sucesso, BGP4-MIB retorna 78 peers, mas IF-MIB retorna 0 interfaces.

### Log Container

```
SNMP poll finished: success:true, interfaces:0, bgpPeers:78
```

### Evidência Externa

Manual `snmpwalk` fora do container provou que IF-MIB responde no device:
- Device: 45.169.161.255
- Community: 4wnetsnmp
- IF-MIB OID 1.3.6.1.2.1.2.2.1.2 retornou valores

**Logo:** Device não bloqueia IF-MIB. Bug está em aplicação.

## Hipóteses

### 1. Timeout Insuficiente ⚠️
- Timeout aumentado de 5s → 30s, retries 1 → 3
- 269 interfaces = grande SNMP walk
- Mesmo com 30s, pode ser insuficiente
- **Ação próxima:** Testar com 60s timeout, verificar logs de timeout

### 2. Network Issue No Container
- Container pode não alcançar UDP/161 do device
- BGP port abre, IF-MIB port não?
- Improvável mas possível
- **Ação próxima:** `docker exec netops-api` + teste conexão UDP

### 3. Parser Issue com Resposta IF-MIB
- `snmpWalk` retorna vazio para IF-MIB
- BGP retorna 78, IF retorna {}
- Pode ser formatação de OctetString diferente
- Pode ser `snmpWalk` não decodificando corretamente
- **Ação próxima:** Adicionar logging detalhado em `snmpWalkWithDiagnostics`

### 4. Promise Rejection Silenciosa
- `snmpWalkWithDiagnostics` pega erro, retorna status != "ok"
- Mas código não valida status, usa rows vazio
- **Ação próxima:** Log status de cada OID em collectInterfaces

### 5. Promise.all Timeout
- Mesmo com refactor, se um OID falha, todo Promise.all falha
- Mas código não usa Promise.all mais (refatorado)
- Menos provável
- **Ação próxima:** Validar que refactor foi aplicado em container

## Correções Aplicadas FASE 5.1.fix

✅ Timeout aumentado: 5s → 30s  
✅ Retries aumentado: 1 → 3  
✅ Promise.all eliminado, refatorado para non-blocking per-OID  
✅ `snmpWalkWithDiagnostics` adicionado para diagnósticos  
✅ OID failures não derrubam coleta (tolerant)  
✅ `oidDiagnostics` agora retorna em payload

## Próximas Ações

### Investigação Profunda

1. **Testar container diretamente**
   ```bash
   docker exec netops-api node -e "
     const snmp = require('net-snmp');
     const session = snmp.createSession('45.169.161.255', '4wnetsnmp');
     session.walk('1.3.6.1.2.1.2.2.1.2', (err, varbinds) => {
       console.log('Error:', err?.message);
       console.log('Count:', varbinds?.length);
     });
   "
   ```

2. **Aumentar timeout ainda mais: 60s**
   - Possível que 30s é ainda insuficiente

3. **Adicionar debug logging**
   ```typescript
   console.log(`IF-MIB walk result: status=${result.status}, count=${result.count}, error=${result.error?.message}`);
   ```

4. **Verificar se container alcança UDP/161**
   ```bash
   docker exec netops-api ping -c 1 45.169.161.255
   docker exec netops-api nc -zu 45.169.161.255 161
   ```

5. **Testar SNMP com netcat/nc**
   ```bash
   docker exec netops-api timeout 5 bash -c 'exec 3<>/dev/udp/45.169.161.255/161; echo "test" >&3'
   ```

### Se IF-MIB Nunca Responde

- **Fallback:** Retornar interfaces vazio com warning claro
- **UI:** Mostrar "SNMP respondeu BGP mas não IF-MIB. OID 1.3.6.1.2.1.2 pode estar bloqueado."
- **Workaround:** Usar interface data legado (snapshot SSH anterior)

### Se Problema é Timeout

- **Solução:** Aumentar timeout default para 60-90s
- **Otimização:** Separar IF-MIB walk em chunks por interface index
- **Alternative:** Usar SNMPv3 com bulk operations mais eficiente

## Status

- ✅ BGP4-MIB funcional (78 peers coletados)
- ❌ IF-MIB não retorna dados (0 interfaces)
- ✅ Diagnostics agora mostram per-OID
- ✅ Warnings adicionados ao payload
- ⚠️ Root cause ainda desconhecida

## Impact

- ✅ Network readiness funcionando (BGP prova conexão)
- ❌ Interface inventory indisponível via SNMP
- ⚠️ Fallback para snapshot legado ainda ativo
- ✅ Zero SSH, zero SNMP SET confirmados

---

**Próxima Etapa:** Investigação com debug logging em container. Não bloqueia FASE 5 em produção (fallback ativo), mas requer resolução para Interface Management completo.
