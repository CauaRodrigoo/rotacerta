# 🧭 RotaCerta

Calculador de rotas que compara **tempo, custo de combustível e segurança** lado a lado, para você escolher o caminho que faz mais sentido, e não só o mais rápido.

> 🚧 Projeto em desenvolvimento. Feito como estudo de React + TypeScript.

## O que o app faz

- Marque **origem e destino** clicando no mapa.
- Receba **até 3 rotas alternativas**, desenhadas em cores diferentes.
- Veja para cada rota: **distância, tempo e custo estimado de combustível** (com o consumo e o preço do litro informados por você).
- Veja uma **nota de segurança de 0 a 100**, baseada em pavimento e acidentes.
- Escolha o critério (⚡ rapidez, 💰 economia ou 🛡️ segurança) e os cartões se reordenam, mostrando a rota recomendada.
- Clique em um cartão ou em uma linha do mapa para **destacar a rota**.

## Como a nota de segurança é calculada

A nota final é a **média de dois fatores**:

| Fator | Fonte | Como funciona |
|---|---|---|
| **Pavimento** | OpenStreetMap, via OpenRouteService | Asfalto vale 100, terra vale 0 e trechos sem informação contam como 50 |
| **Acidentes** | PRF (dados abertos, 2024 a 2026) | Conta os acidentes a menos de 200 m da rota. Morte pesa 5, ferido grave pesa 2 e acidente comum pesa 1. O total é dividido pelos km da rota |

### Limitações

- Os acidentes vêm da **PRF**, que só registra **rodovias federais**. Ruas de cidade e estradas estaduais aparecem com 0 acidentes, o que significa **falta de dados**, e não que o trecho é seguro.
- Os dados incluídos no projeto cobrem só **Rondônia (RO) e Mato Grosso (MT)**.
- Em regiões rurais, o OpenStreetMap nem sempre informa o tipo de piso.
- A nota e o custo são **estimativas**.

## Tecnologias

- [React](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) + [Vite](https://vite.dev/)
- [Leaflet](https://leafletjs.com/) e [react-leaflet](https://react-leaflet.js.org/) para o mapa
- [OpenRouteService](https://openrouteservice.org/) para rotas alternativas e tipo de pavimento
- Dados abertos da [PRF](https://www.gov.br/prf/pt-br/acesso-a-informacao/dados-abertos/dados-abertos-da-prf) para acidentes

## Como rodar

Você precisa do **Node.js** (versão 20 ou superior) e de uma chave gratuita do OpenRouteService.

**1. Clone o projeto e instale as dependências**

```bash
git clone https://github.com/CauaRodrigoo/rotacerta.git
cd rotacerta
npm install
```

**2. Pegue uma chave gratuita**

Crie uma conta em [openrouteservice.org](https://openrouteservice.org/) e gere um token do tipo *Free*.

**3. Crie o arquivo `.env.local`** na raiz do projeto, com uma linha:

```
VITE_ORS_KEY=cole_sua_chave_aqui
```

**4. Inicie o servidor**

```bash
npm run dev
```

Abra o endereço que aparecer no terminal (normalmente http://localhost:5173/).

> ⚠️ A chave fica visível no navegador, porque a chamada é feita direto do front-end. Para um app publicado, o ideal é esconder a chamada atrás de um backend.

## Atualizando os dados de acidentes

O arquivo `src/dados/acidentes.json` já está no repositório, então **não é preciso** baixar nada para rodar o app. Para regenerá-lo com outros anos ou estados:

1. Baixe os CSVs **"Agrupados por ocorrência"** no [portal de dados abertos da PRF](https://www.gov.br/prf/pt-br/acesso-a-informacao/dados-abertos/dados-abertos-da-prf).
2. Coloque os arquivos na pasta `dados/` (ela é ignorada pelo Git, por causa do tamanho).
3. Ajuste a lista de arquivos e de estados no topo de `scripts/preparar-acidentes.mjs`.
4. Rode:

```bash
node scripts/preparar-acidentes.mjs
```

## Estrutura

```
rotacerta/
├── dados/                     # CSVs da PRF (não versionados)
├── scripts/
│   └── preparar-acidentes.mjs # filtra os CSVs e gera o JSON
└── src/
    ├── dados/acidentes.json   # acidentes de RO e MT
    ├── acidentes.ts           # conta acidentes perto de uma rota
    ├── App.tsx                # mapa, rotas, notas e painel
    └── App.css
```

## Próximos passos

- [ ] Busca de endereço com autocompletar
- [ ] Pedágio e elevação no cálculo de consumo
- [ ] Fator de assaltos (por cidade, onde houver dados abertos)
- [ ] Pesos ajustáveis combinando os critérios
- [ ] Mostrar "sem dados" quando não houver acidentes registrados
- [ ] Backend para esconder a chave da API

## Fontes e créditos

- Mapas e vias: © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors
- Rotas: [OpenRouteService](https://openrouteservice.org/)
- Acidentes: Polícia Rodoviária Federal, dados abertos
