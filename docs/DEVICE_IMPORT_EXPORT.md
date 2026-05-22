# Device Import & Export (v0.3.1–v0.3.2)

## Overview

Bulk import and export of network devices via CSV, TXT, and XLSX formats. Import preview before apply. Deduplication, conflict detection, field validation, and credential protection.

---

## Quick Start

### Export
Frontend: Devices → Export button (select devices, choose format)

### Import
Frontend: Devices → Import button → Upload → Preview → Apply

---

## Features

### Export
- **Formats:** CSV, XLSX, JSON
- **Security:** No passwords, audit logged

### Import
- **Formats:** CSV, TXT, XLSX
- **Modes:** upsert, create_only, update_existing
- **Field aliases:** hostname/name/device/device_name, ipAddress/ip/ip_address/mgmt_ip, vendor/manufacturer, platform/os/device_os, role/device_role, site/location
- **Validation:** Required hostname, valid IPv4, known vendors/roles
- **Deduplication:** Match hostname + IP, categorize as create/update/skip/invalid
- **Credentials:** Never overwrites passwordEncrypted or snmpCommunity

---

## Permissions

- `devices.import` — preview + apply
- `devices.export` — export to file

---

## Testing

```bash
node tools/device-import-selftest.mjs
```
