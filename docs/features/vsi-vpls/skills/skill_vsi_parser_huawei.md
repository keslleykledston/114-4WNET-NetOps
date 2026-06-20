# skill_vsi_parser_huawei

## Objetivo

Extrair VSI/VPLS Huawei com fixtures confiaveis.

## Quando usar

- Ao criar ou ajustar parser Huawei.

## Entradas

- Blob de CLI.
- Fixture do device.

## Saidas

- Estrutura parseada.
- Falsos positivos identificados.

## Procedimento

1. Ler fixture.
2. Rodar parser.
3. Validar campos obrigatorios.
4. Comparar com testes.

## Comandos

- `node tools/l2-circuit-huawei-vsi-selftest.mjs`

## Critérios de sucesso

- VS-ID, nome, peers e PW status extraidos.

## Exemplos

- `display vsi verbose`

## Falhas comuns

- Bloco incompleto.
- Nome duplicado.
