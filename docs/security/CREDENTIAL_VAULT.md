# Credential Vault

FASE 5.2 adiciona um vault para remover credenciais SSH/SNMP dos payloads persistidos de jobs.

## Modelo

Tabelas:

- `credential_profiles`: profile por tenant, tipo, vendor, username e segredo criptografado.
- `credential_assignments`: vínculo entre device e profile, com `priority` para escolher a credencial preferida.
- `credential_audit_logs`: trilha específica de criação, atualização, rotação, resolução, teste e assignment.

Tipos suportados:

- `SSH`
- `SNMP_V2`
- `SNMP_V3`
- `NETCONF`
- `API_TOKEN`

## Criptografia

O campo `credential_profiles.encrypted_secret` é criptografado pela API usando `SESSION_SECRET`.

Regras:

- O segredo completo nunca é retornado por API.
- A UI só aceita segredo em criação/rotação.
- Logs de auditoria e payload mascarado redigem chaves sensíveis.
- Rotação troca apenas o segredo criptografado e atualiza `updated_at`.

## Connector Jobs

Jobs persistidos devem carregar apenas referência:

```json
{
  "credential_id": "cred-huawei-prod"
}
```

No polling do connector, a API resolve `credential_id` em memória e injeta `username/password` ou `community` apenas na resposta enviada ao connector para execução. O banco mantém:

- `payload_json` com `credential_id`;
- `masked_payload_json` sem segredo;
- auditoria com payload mascarado.

Se um job for criado para um device sem `credential_id`, a API tenta resolver o assignment ativo de menor `priority` para o tipo do job. Credenciais legadas em `devices.username`, `devices.password_encrypted` e `devices.snmp_community` permanecem como fallback de compatibilidade.

## Operação

Tela:

```text
/security/credentials
```

Endpoints:

```text
GET    /api/credential-profiles
POST   /api/credential-profiles
GET    /api/credential-profiles/:id
PUT    /api/credential-profiles/:id
POST   /api/credential-profiles/:id/rotate
POST   /api/credential-profiles/:id/test
DELETE /api/credential-profiles/:id

GET    /api/credential-assignments
POST   /api/credential-assignments
DELETE /api/credential-assignments/:deviceId/:profileId
```

## Critério de aceite

Um device vinculado a um connector deve executar SSH/SNMP usando um profile atribuído sem gravar `username`, `password` ou `community` no payload persistido do job.
