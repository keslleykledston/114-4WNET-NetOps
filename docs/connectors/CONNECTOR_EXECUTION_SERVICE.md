# Connector Execution Service

Path: `workspace/artifacts/api-server/src/modules/connectors/connector-execution.service.ts`

## API

| Function | Job type |
|----------|----------|
| `executePing` | `PING` |
| `executeTcpCheck` | `TCP_CHECK` |
| `executeSnmpGet` | `SNMP_GET` |
| `executeSnmpWalk` | `SNMP_WALK` |
| `executeSshCommand` | `SSH_COMMAND` |
| `waitForJobResult` | poll DB until terminal status |

## Return shape

```typescript
{
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
  resultJson: Record<string, unknown> | null;
  jobId: number;
  executionMode: "connector";
  durationMs: number;
  status: string;
}
```

## Guards

- `assertConnectorAcceptsJobs` — rejects offline/revoked connectors before enqueue
- `assertReadOnlySshCommand` — server-side policy before SSH jobs
- `maskSensitivePayload` — audit + UI use masked fields only

## Helpers

- `resolveDeviceConnectorContext(deviceId)`
- `deviceUsesConnector(device)`
- `executeSshCommandForDevice(device, command)`
- `runSSHCommandsForDevice` in `connector-aware-transport.ts`
