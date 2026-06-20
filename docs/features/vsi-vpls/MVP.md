# MVP

## Objetivo

Entregar uma biblioteca read-only de VSI/VPLS com persistencia, lista, detalhe, diagnostico e historico minimo.

## Entregas

1. Subitem na sidebar: `L2 Circuits > VSI/VPLS`.
2. Tela de lista com filtros e tabela consolidada.
3. Tela de detalhe com abas e configs por dispositivo.
4. Status consolidado: `UP`, `DEGRADED`, `DOWN`, `CONFIG_ONLY`, `UNKNOWN`.
5. Persistencia em banco.
6. Historico simples de coletas/status/config.
7. Parser Huawei com fixtures e testes.
8. API com testes basicos.
9. Build e validacao do frontend.

## Contrato de dados

- Config bruta deve vir preferencialmente de `collected_configs` quando o device ja tiver esse pipeline.
- Evidencias de descoberta devem preferencialmente reutilizar `discovery_snapshots`.

## Fora do MVP

- Apply real.
- Edição de configuracao.
- Topologia grafica avançada.
- Suporte multi-vendor completo.

## Critério de sucesso

- Lista carrega.
- Filtro por `vs_id` funciona.
- Detalhe abre.
- Configs expandem por dispositivo.
- Status consolidado bate com evidencias.
