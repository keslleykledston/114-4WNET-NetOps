# Huawei VRP Default Policies

Policies default v0.2.4:

Security:
- Telnet ausente.
- SSH/STelnet presente.
- SNMP `public` ausente.

NTP:
- NTP configurado.

Interfaces:
- Interface ativa deve ter `description`.
- Subinterface deve ter `dot1q`/QinQ comprovado.
- Interface duplicada gera fail.

VRF/L3VPN:
- VRF deve ter RD.
- VRF deve ter RT import.
- VRF deve ter RT export.

BGP:
- Peer deve estar `Established`.
- Cliente deve ter import policy.
- Operadora/IX/CDN deve ter export policy.
- Peer deve ter descrição.
- Route-policy referenciada deve existir.
- Prefix-list/community referenciada deve existir.
- `receivedRoutes=0` para cliente gera warning.
- `advertisedRoutes=0` para operadora/IX/CDN gera warning.
- Nunca usa `Update messages` como contador de prefixos.

L2VPN:
- L2VC/VSI duplicado gera fail.
- L2VC sem VC/service id gera fail.

Fora do escopo:
- correção automática;
- apply;
- rollback;
- entrada em modo config.
