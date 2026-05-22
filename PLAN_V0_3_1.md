# v0.3.1 Import/Export Dispositivos em Massa

## Endpoints Novos

```
POST /api/devices/import/preview    — Parse arquivo, retorna preview + warnings
POST /api/devices/import/apply      — Aplica import (com dedup/validação)
POST /api/devices/export            — Serializa selecionados, retorna arquivo
GET  /api/devices/import/status     — Status do último import (id, count, errors)
```

## Backend: Import

### Parser (devices-import.service.ts)

**Suporta:**
- CSV: hostname,ipAddress,vendor,platform,username,password,site,role,snmpCommunity
- XLSX: mesmas colunas (primeira sheet)
- TXT: CSV com delimitador auto-detect (vírgula, ponto-e-vírgula, tab)

**Validação:**
- IP válido (ipaddress lib)
- Hostname not empty
- Vendor em lista conhecida (huawei, cisco, juniper, etc)
- Platform não vazio
- Dedup: se hostname ou IP já existe, skip ou merge (opção)

**Preview retorna:**
```typescript
{
  total: number
  valid: number
  warnings: [{row, field, message}]
  duplicates: [{hostname, ipAddress, action}]
  preview: [{hostname, ipAddress, vendor, platform, site, will_insert: bool}]
  file_hash: string  // para aplicar depois com mesmo arquivo
}
```

### Aplicar Import

**Endpoint:** POST /api/devices/import/apply
```typescript
{
  file_hash: string
  action_on_duplicates: "skip" | "update"  // skip=não sobrescreve, update=atualiza sem creds
  import_credentials: boolean  // se false, não importa passwords
}
```

**Lógica:**
1. Validar file_hash (upload recente)
2. Para cada linha:
   - Se hostname+IP duplicado e action=skip, pula
   - Se hostname+IP duplicado e action=update, atualiza campos EXCETO password
   - Se novo, insere
3. Log audit: `device_import` (file_name, count, duplicates_skipped, duplicates_updated)
4. Retorna: {inserted: N, updated: M, skipped: K, errors: []}

## Backend: Export

### Serializer (devices-export.service.ts)

**Formato CSV:**
```
hostname,ipAddress,vendor,platform,username,site,role,snmpCommunity,lastSeen,status
router1,10.0.0.1,huawei,VRP,netops,site-a,provider,,2026-05-22T10:00:00Z,active
```

**Formato XLSX:**
- Mesmas colunas, formatação
- Planilha "devices"

**Formato JSON:**
```json
{
  "devices": [
    { "id": 1, "hostname": "router1", "ipAddress": "10.0.0.1", ... }
  ],
  "exported_at": "2026-05-22T...",
  "exported_by": "admin@example.com"
}
```

**Note:** Nunca exporta passwords (redacted)

## Frontend: UI

### Modal Import (devices-import-modal.tsx)

1. **Drag-n-drop:** aceita CSV/XLSX/TXT
2. **Preview:** mostra tabela com linha/colunas parsed, warnings em amarelo
3. **Options:**
   - [ ] Atualizar duplicados (senão skip)
   - [ ] Importar credenciais (senão deixa vazio)
4. **Apply button:** POST /import/apply com file_hash
5. **Status:** mostra progress + resultado (inserted/updated/skipped/errors)

### Modal Export (devices-export-modal.tsx)

1. **Tabela:** seleção multi com checkboxes
2. **Formato:** radio buttons (CSV / XLSX / JSON)
3. **Download:** clica botão, POST /export com IDs selecionados
4. **Resultado:** arquivo baixa automático (CSV/XLSX/JSON)

### Integração em devices.tsx

- Botão "Import" (abre modal) — requer permission: devices.import
- Botão "Export" (abre modal) — requer permission: devices.export

## OpenAPI Update

```yaml
/devices/import/preview:
  post:
    operationId: previewDeviceImport
    requestBody:
      multipart/form-data:
        file: binary
    responses:
      200: { schema: DeviceImportPreview }

/devices/import/apply:
  post:
    operationId: applyDeviceImport
    requestBody:
      schema: DeviceImportApplyRequest
    responses:
      200: { schema: DeviceImportResult }

/devices/export:
  post:
    operationId: exportDevices
    requestBody:
      schema: DeviceExportRequest
    responses:
      200:
        content:
          text/csv: {}
          application/vnd.openxmlformats-officedocument.spreadsheetml.sheet: {}
          application/json: {}
```

## Permissões

`devices.import` e `devices.export` já existem na matriz de permissões:

```typescript
// lib/auth.ts getDefaultPermissions()
devices: {
  read: true
  write: true
  import: true   // ← novo: operator=true, viewer=false
  export: true   // ← novo: operator=true, viewer=false
}
```

Aplicar em endpoints:
```typescript
router.post("/devices/import/preview", requirePermission("devices.import"), ...)
router.post("/devices/import/apply", requirePermission("devices.import"), ...)
router.post("/devices/export", requirePermission("devices.export"), ...)
```

## Audit Logging

Eventos novos:
- `device_import` (file_name, count, duplicates, inserted, updated, skipped)
- `device_export` (format, count, user_email)

Integrar com `logAuditEvent()` existente.

## Selftest

```bash
tools/devices-import-export-selftest.mjs

Testes:
✓ Admin can import CSV (create new device)
✓ Admin can import XLSX (2 devices)
✓ Admin can export devices to CSV
✓ Admin can export devices to XLSX
✓ Admin can export devices to JSON
✓ Duplicate hostname skipped on import
✓ Duplicate IP updated on import (fields only, no creds)
✓ Invalid IP rejected on import
✓ Viewer cannot import (permission denied)
✓ Viewer cannot export (permission denied)
✓ Audit log records device_import and device_export events
```

## Sequência

1. DB: nenhuma mudança (reutiliza devices table)
2. Backend services: import/export parser + serializer
3. Endpoints: /devices/import/*, /devices/export
4. OpenAPI + Orval
5. Frontend: 2 modals + botões
6. Selftest
7. Docs
