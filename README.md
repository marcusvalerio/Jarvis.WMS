# Jarvis WMS

Sistema de gestao de armazem construido para **executar fisicamente uma operacao
logistica completa** durante uma apresentacao — nao para demonstrar telas.

Recebimento → pesagem → conferencia → paletizacao → enderecamento → armazenagem →
estoque → reserva → picking → packing → conferencia → romaneio → carregamento →
expedicao, com coletora de codigo de barras, documentos impressos e rastreabilidade
ponta a ponta.

---

## Como executar

```bash
npm install
npm run dev
```

Abra <http://localhost:3000>. O cenario **SIM-001** e carregado automaticamente na
primeira execucao — nenhuma tela aparece vazia.

| Superficie | Endereco | Uso |
|---|---|---|
| Sistema (desktop) | `/dashboard` | Gestao da operacao |
| Coletora (RF) | `/mobile` | Operacao no armazem, com leitor |
| Documentos | `/documents` | Impressao e pre-geracao |

### Comandos

```bash
npm run dev         # sobe o sistema
npm run build       # build de producao
npm run typecheck   # verificacao de tipos
npm test            # 36 testes de dominio (banco isolado)
npm run test:e2e    # percurso completo pela interface (exige npm run dev)
                    # testes de navegador: npx playwright install chromium
npm run test:smoke  # verifica todas as rotas (exige npm run dev)
npm run test:a11y   # auditoria WCAG 2.1 AA (exige npm run dev)
npm run db:reset    # recarrega o cenario pela linha de comando
npm run docs:pdf    # gera TODOS os documentos em PDF (exige npm run dev)
```

---

## Coletora de codigo de barras

O leitor USB e tratado como **teclado (HID)** — nao ha driver, SDK ou integracao
proprietaria. Configure o leitor para enviar **Enter** ao final da leitura; leitores
Bluetooth em modo HID funcionam da mesma forma.

Os codigos sao **Code 128 subconjunto B**, gerados por codificador proprio
(`src/lib/barcode/code128.ts`, sem dependencias) e validados por testes de estrutura
e checksum. **O valor codificado e o proprio identificador da entidade**:

```
PLT-000001    palete          VOL-000001    volume
END-A020301   endereco        PED-000125    pedido de venda
SKU-001       produto         ROM-000018    romaneio
```

Enderecos aceitam as duas formas: `A-02-03-01` e `END-A020301`.

### O que a coletora recusa

A validacao roda **no servidor**, antes de qualquer alteracao de estoque:

- endereco diferente do esperado pela picklist;
- produto diferente do esperado na linha;
- passo fora de sequencia (produto antes do endereco);
- quantidade acima da reservada;
- volume de outro pedido ou de outro romaneio;
- volume nao conferido, inexistente ou ja carregado;
- palete sem ordem de armazenagem, ou ja armazenado.

Toda leitura fica registrada — inclusive as recusadas — em `scan_events`.

---

## Regra central: documento e sistema sao a mesma coisa

Nenhum documento tem dados proprios. Cada PDF e uma **visao renderizada da entidade**
que o WMS usa em operacao: a nota fiscal le os itens da ordem de recebimento, o
romaneio le os volumes do pedido, a etiqueta do palete le o conteudo real do palete.

Como os identificadores sao deterministicos, o fluxo natural da apresentacao e:

1. **Ensaio** — executar a operacao uma vez, do inicio ao fim.
2. **Pre-geracao** — `npm run docs:pdf` gera os 107 documentos em `generated-docs/`.
3. **Impressao** — imprimir etiquetas (100 × 150 mm) e documentos (A4).
4. **Reset** — `Simulacao → Reiniciar simulacao`.
5. **Apresentacao** — executar de novo; os papeis impressos continuam validos,
   porque os IDs se repetem exatamente.

### Documentos simulados

Notas fiscais e documento de transporte sao **simulacoes academicas**. Nao ha
integracao com a SEFAZ, nao ha emissao nem autorizacao, e a chave de acesso e gerada
por funcao local deterministica. Esses documentos trazem, no cabecalho e no rodape,
a marcacao obrigatoria:

> **DOCUMENTO SIMULADO — USO ACADEMICO**

Os demais (ordens, checklists, romaneio, etiquetas, comprovantes) sao documentos
operacionais internos, sem natureza fiscal.

---

## Regras de negocio que o sistema garante

O estoque tem **um unico caminho de alteracao**: `applyMovement`, que grava o
movimento correspondente. Nao existe UPDATE de saldo fora desse ponto.

Invariantes verificados a cada escrita:

- saldo nunca negativo;
- reserva + bloqueio nunca acima do saldo;
- reserva limitada ao disponivel — a falta e reportada linha a linha, o pedido nao
  avanca;
- coleta limitada a reserva;
- embalagem limitada ao que foi coletado;
- expedicao bloqueada enquanto houver divergencia de conferencia nao tratada;
- carregamento bloqueado com volume faltante, salvo aceite explicito que abre
  ocorrencia.

Transicoes de estado sao declaradas em `src/domain/states.ts` e validadas no
backend (`assertTransition`) — a interface nunca decide sozinha.

Divergencias de conferencia, pesagem, picking, inventario e expedicao abrem
**ocorrencia** automaticamente.

---

## KPIs

Todos calculados a partir dos registros da operacao — movimentos, conferencias e
tempos de tarefa. **Indicador sem base de calculo mostra "sem dados", nunca um
numero inventado.**

| Indicador | Origem |
|---|---|
| Acuracidade de estoque | posicoes sem divergencia / posicoes inventariadas |
| Tempo medio de localizacao | inicio da linha → bip do endereco |
| Indice de divergencia | divergencias / conferencias (entrada, picking, saida, inventario) |
| Disponibilidade de equipamentos | tempo disponivel / tempo monitorado |
| Ocupacao | posicoes-palete ocupadas / total |
| Produtividade de picking | linhas concluidas / tempo de execucao |
| OTIF | pedidos expedidos no prazo e completos |
| Ciclos de recebimento, put-away e expedicao | marcos de tempo de cada etapa |

---

## Cenario SIM-001

```
ESTOQUE INICIAL   SKU-001 40 · SKU-002 25 · SKU-003 60 · SKU-004 30
                  SKU-006 45 · SKU-007 50 · SKU-008 12
RECEBIMENTO       SKU-001 +20 · SKU-003 +30 · SKU-005 +40   (2 cargas, 2 NFs)
PEDIDOS           PED-000125 · PED-000126 · PED-000127
```

`PED-000125` consome **parte do estoque inicial** (SKU-001, SKU-003) e **parte do
que chega no recebimento** (SKU-005) — obrigando a operacao a percorrer o fluxo
inteiro antes de expedir.

Executado o roteiro com a conferencia de uma linha a menos (divergencia proposital),
os saldos fecham em **SKU-001 44 · SKU-003 70 · SKU-005 30**.

O armazem tem 72 posicoes-palete em tres zonas (A alto giro, B medio, C baixo), mais
os enderecos de recebimento e staging de expedicao.

---

## Arquitetura

```
db/schema.sql              esquema (51 tabelas)
src/lib/                   banco, identificadores, Code 128, formatacao
src/domain/states.ts       estados e transicoes centralizados
src/domain/services/       regras de negocio por dominio
src/seed/scenario.ts       cenario SIM-001 (dados deterministicos)
src/app/(app)/             sistema desktop
src/app/mobile/            coletora RF
src/app/documents/         documentos para impressao
src/components/            interface e componentes de documento
tests/                     testes de dominio
```

**Stack:** Next.js 15 (App Router, server components e server actions), React 19,
TypeScript em modo estrito, Tailwind CSS 4.

**Persistencia:** PostgreSQL (Neon em producao). O acesso a dados e SQL explicito
e transacional (`src/lib/db.ts`), com as consultas escritas em um unico dialeto:
os marcadores `?` sao convertidos para `$n` na propria camada, entao nenhuma query
do dominio precisa conhecer o driver.

A conexao vem de `DATABASE_URL`. O driver e escolhido pela URL — o driver
serverless do Neon para `*.neon.tech`, `pg` para um PostgreSQL comum —, de modo
que o mesmo codigo roda em desenvolvimento, nos testes e na Vercel.

O esquema (`db/schema.postgres.sql`, embutido em `src/db/schema.ts` para viajar no
bundle serverless) e idempotente e e aplicado na primeira consulta de cada
processo, sob lock consultivo. Um banco vazio, portanto, se monta sozinho e carrega
o cenario SIM-001 — nada de tela em branco na primeira visita.

```bash
export DATABASE_URL="postgresql://usuario@127.0.0.1:5432/jarvis_wms"
npm run db:migrate   # aplica o esquema (opcional: a aplicacao tambem aplica)
npm run db:reset     # carrega/recarrega o cenario SIM-001
```

---

## Testes

**Dominio — 36 testes** (`npm test`, banco PostgreSQL separado via `WMS_TEST_DATABASE_URL`):
fluxo completo de ponta a ponta, divergencia de conferencia, recusa de endereco,
produto e quantidade na coletora, integridade de saldo, rastreabilidade, auditoria,
cobertura do reset e reprodutibilidade do cenario.

**Interface — 33 etapas** (`npm run test:e2e`): o mesmo percurso, executado em
navegador real contra a interface, terminando nos saldos previstos pelo roteiro e
nos KPIs calculados.

---

## Identidade visual

Superficie escura (`#0B0D0E`), verde tecnico (`#B8FF3D`) reservado a acao e estado
ativo. Tres familias tipograficas com papeis distintos: **Familjen Grotesk** em
titulos e numeros de destaque, **Geist** em rotulos e navegacao, **Sora** na
interface, tabelas e dados operacionais. Numeros sempre tabulares.

A coletora nao e o desktop reduzido: e uma interface propria, de alvo unico por
tela, texto grande e resposta imediata a cada leitura.
