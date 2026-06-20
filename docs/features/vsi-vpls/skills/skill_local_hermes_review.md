# skill_local_hermes_review

## Objetivo

Usar Hermes local para revisao curta e objetiva.

## Quando usar

- Para revisar docs, parser, status ou homologacao.

## Entradas

- texto curto
- contexto tecnico

## Saidas

- sugestoes
- riscos

## Procedimento

1. Enviar prompt curto.
2. Ler resposta como sugestao.
3. Validar com codigo/teste.

## Comandos

- `curl http://127.0.0.1:18088/v1/chat/completions`

## Critérios de sucesso

- Resposta curta e util.

## Exemplos

- "Revise este parser Huawei VSI."

## Falhas comuns

- Tratar resposta como verdade.
