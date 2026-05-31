# NETCONF Connector

FASE 6.0 adiciona execução NETCONF via connector-agent em modo **read-only**.

## Fluxo

```text
NetOps
 ↓
Job Queue
 ↓
Connector Agent
 ↓
NETCONF
 ↓
Device
```

## Jobs

- `NETCONF_GET`
- `NETCONF_GET_CONFIG`
- `NETCONF_RPC`

## Dispositivos suportados

- Huawei `NE8000`
- Huawei `NE40`
- Huawei `S6730`

## Comportamento

- O servidor resolve `credential_id` antes da execução.
- O connector recebe `username` e `password` somente na execução do job.
- Segredos não devem aparecer em logs, APIs ou payloads persistidos.
- A versão inicial só permite operações de leitura.

## Endpoints

- `POST /api/connectors/netconf/test`
- `POST /api/connectors/netconf/get-config`

## Payload esperado

```json
{
  "device_id": 123,
  "credential_id": "netconf-huawei",
  "rpc": "get-config",
  "port": 830
}
```

## Resultado

- `stdout` retorna XML formatado do NETCONF.
- `get-config` usa `running` como fonte.
- `NETCONF_RPC` bloqueia operações de escrita como `edit-config`, `commit` e `lock`.
