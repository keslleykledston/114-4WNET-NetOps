# SNMP Credential Resolution Architecture

**Status:** design (H3.2A.2)  
**Scope:** definição de arquitetura para resolução de credencial SNMP em coletores operacionais  
**Security rule:** nunca persistir segredo resolvido

---

## 1. Objetivo

Definir a **fonte oficial** da community SNMP para coletores operacionais (H2 interfaces, H3 BGP e futuros OSPF/MPLS), com:

- ordem determinística de resolução
- contrato interno único
- sem exposição de segredo
- sem depender de snapshot/config parse

---

## 2. Cadeia oficial de resolução

Ordem de precedência (primeiro valor válido vence):

1. `device.snmp_community`
2. `device.snmp_profile_id`
3. `tenant.snmp_profile_id`
4. `credential_profile` (read-only)
5. `env fallback` (**somente lab**)

Se nenhuma camada resolver: `source=none`, `available=false`.

---

## 3. Nunca usar

- `snapshot` como fonte de credencial
- `parsed_config` para derivar community
- hardcode em código
- UI `localStorage` / browser cache

---

## 4. Contrato de resolução (interno)

```ts
type ResolvedCredentialSource =
  | "device"
  | "device_profile"
  | "tenant_profile"
  | "env"
  | "none";

type ResolveSnmpCredentialResult = {
  source: ResolvedCredentialSource;
  available: boolean;
  length: number; // apenas tamanho, nunca valor
};
```

Campos obrigatórios:

- `resolvedCredentialSource`: `device | device_profile | tenant_profile | env | none`
- `credentialAvailable`: `true | false`
- `credentialLength`: inteiro (somente metadado)

---

## 5. API interna proposta

```ts
resolveSnmpCredential(device)
```

Retorno:

```json
{
  "source": "device|device_profile|tenant_profile|env|none",
  "available": true,
  "length": 9
}
```

### Regras de segurança

- nunca logar valor da community
- nunca retornar valor em resposta externa
- nunca persistir credencial resolvida em DB/snapshot/job payload

---

## 6. Modelo de erro

Erros padronizados (sem segredo):

- `SNMP_CREDENTIAL_NOT_CONFIGURED`
- `SNMP_CREDENTIAL_PROFILE_NOT_FOUND`
- `SNMP_CREDENTIAL_DISABLED`

Mapeamento sugerido:

- `NOT_CONFIGURED`: nenhuma camada da cadeia disponível
- `PROFILE_NOT_FOUND`: id de profile referenciado sem registro
- `DISABLED`: profile encontrado, mas marcado desabilitado

---

## 7. Política de ambiente

### Produção

- `env fallback` **desabilitado**
- resolução deve ocorrer via `device` ou profiles

### Lab/dev

- `env fallback` permitido para smoke local
- sempre marcado explicitamente como `source=env`

**NO-GO:** usar `env` como padrão de produção.

---

## 8. Compatibilidade

Esta arquitetura deve ser usada por:

- H2 interfaces (`SNMP_FAST`)
- H3 BGP peers (`SNMP_FAST`)
- futuro OSPF/MPLS operacional

Objetivo: um resolvedor único, evitando lógica duplicada por módulo.

---

## 9. Observabilidade (sem segredo)

Logs permitidos:

- `device_id`
- `resolvedCredentialSource`
- `credentialAvailable`
- `credentialLength`
- `code`

Logs proibidos:

- valor da community
- hashes reversíveis ou dumps de profile com segredo

---

## 10. Regras de persistência

**NUNCA salvar community resolvida** em:

- snapshots (`snmp_snapshots`, operational snapshots)
- jobs (`operational_*_jobs`)
- evidências de auditoria
- payloads de erro

Persistir apenas metadados não sensíveis (`source`, `available`, `length`).

---

## 11. Critérios

### GO (arquitetura)

- cadeia oficial definida
- sem segredo em contrato/log/persistência
- sem rede para validar desenho
- sem código nesta fase

### NO-GO

- usar env em produção
- duplicar community em `device` + múltiplas cópias persistidas
- salvar segredo em snapshot/job

