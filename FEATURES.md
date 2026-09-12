# Features futuras

## Catálogo automático de modelos de IA por credencial

**Status:** backlog

Automatizar a descoberta dos modelos disponíveis para cada credencial de IA,
começando pela NVIDIA e evoluindo para Gemini e OpenAI.

### Objetivo

- consultar o catálogo autenticado do provedor, como `GET /v1/models` da NVIDIA;
- gerar uma lista e um JSON normalizado dos modelos acessíveis pela chave;
- enriquecer cada modelo com capacidades conhecidas: chat, raciocínio, código,
  visão, embeddings, áudio, ferramentas e resposta estruturada;
- indicar endpoint gratuito, restrições, contexto máximo e compatibilidade com o
  fluxo atual do WhatsApp, quando essas informações estiverem disponíveis;
- registrar a origem e a data da última atualização dos metadados;
- nunca retornar, registrar ou exportar a API key.

### Entregas previstas

1. Comando administrativo para sincronização manual e exportação JSON.
2. Catálogo persistido ou armazenado em cache, separado por provedor.
3. Endpoint administrativo para consultar modelos e suas capacidades.
4. Seletor de modelo no painel, filtrado pela credencial e pelo tipo de uso.
5. Atualização periódica com tratamento de modelos adicionados ou removidos.
6. Teste opcional de inferência curta para confirmar que o modelo listado está
   realmente operacional para a chave.

### Cuidados de implementação

- A resposta de `/v1/models` confirma quais IDs a chave consegue consultar, mas
  pode não informar todas as capacidades ou se o endpoint é gratuito.
- Os metadados complementares devem vir de documentação ou catálogo oficial,
  com cache para evitar consultas excessivas e dados desatualizados sinalizados.
- O sistema deve distinguir modelos de chat, multimodais, embeddings e outros
  endpoints para não oferecer uma opção incompatível no atendimento.
- A sincronização não deve consumir uma chamada de geração por modelo; testes de
  inferência devem ser explícitos, limitados e registrados sem conteúdo sensível.

### Protótipo disponível

O utilitário local `nvidia.py` já permite:

```bash
python3 nvidia.py --list-models
python3 nvidia.py
```

O primeiro comando lista os modelos acessíveis pela chave e o segundo executa
uma inferência curta com `NVIDIA_MODEL`.
