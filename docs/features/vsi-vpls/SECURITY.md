# Security

## Regras

- Tenant isolation obrigatoria.
- Sem comando destrutivo.
- Sem apply real no MVP.
- Redaction de secrets, communities e credenciais.
- Logs sem conteudo sensivel.
- Endpoint de discovery protegido pelo padrao existente.

## Evidencia

- Config bruta deve ser persistida apenas para leitura diagnostica.
- Se houver redaction, registrar metadados de redaction.

## Riscos

- Vazamento por config dump.
- Cross-tenant access via filtro insuficiente.
- Mudanca de estado indevida por endpoint de discovery.
