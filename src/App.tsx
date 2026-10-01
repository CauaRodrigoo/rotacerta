import { Fragment, useState, useEffect } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Polyline,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./App.css";
import { contarAcidentes } from "./acidentes";

// Marcador redondo com uma letra (A = origem, B = destino)
function criarIcone(cor: string, letra: string) {
  return L.divIcon({
    className: "",
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    html:
      `<div style="background:${cor};color:white;width:28px;height:28px;` +
      `border-radius:50%;border:3px solid white;` +
      `box-shadow:0 1px 4px rgba(0,0,0,0.5);display:flex;` +
      `align-items:center;justify-content:center;` +
      `font:bold 13px Arial,sans-serif;">${letra}</div>`,
  });
}

const ICONE_ORIGEM = criarIcone("#16a34a", "A");
const ICONE_DESTINO = criarIcone("#dc2626", "B");

type Ponto = [number, number];

type Criterio = "rapidez" | "economia" | "seguranca";

type Rota = {
  linha: Ponto[];
  km: number;
  min: number;
  subidaM: number;
  pedagioPct: number;
  asfaltoPct: number;
  terraPct: number;
  semDadoPct: number;
  acidentes: number;
  mortos: number;
  pesoAcidentes: number;
};

const CORES = ["#1d4ed8", "#16a34a", "#ea580c"];

// Códigos de "surface" do OpenRouteService
const SEM_DADO = [0];
const ASFALTADO = [1, 3, 4, 5, 6, 7, 14];
// Qualquer outro código (cascalho, terra, areia, grama...) conta como terra

// Quanto cada "ponto de acidente por km" desconta da nota.
// Se as notas ficarem muito baixas ou muito altas, ajuste este número.
const DESCONTO_POR_PESO_KM = 15;

// Litros extras gastos por metro de subida (estimativa para carro de passeio).
// 0.0015 = 1,5 litro a cada 1.000 m de subida acumulada.
const LITROS_POR_METRO_SUBIDA = 0.0015;

type Feature = {
  geometry: { coordinates: number[][] };
  properties: {
    ascent?: number;
    descent?: number;
    summary: { distance: number; duration: number };
    extras?: {
      surface?: { summary: { value: number; amount: number }[] };
      tollways?: { summary: { value: number; amount: number }[] };
    };
  };
};

function converter(f: Feature): Rota {
  let asfaltoPct = 0;
  let terraPct = 0;
  let semDadoPct = 0;

  const resumo = f.properties.extras?.surface?.summary ?? [];
  for (const s of resumo) {
    if (SEM_DADO.includes(s.value)) semDadoPct += s.amount;
    else if (ASFALTADO.includes(s.value)) asfaltoPct += s.amount;
    else terraPct += s.amount;
  }
  // Se a API não trouxe informação nenhuma, tudo é "sem dado"
  if (resumo.length === 0) semDadoPct = 100;

  // Pedágio: no ORS, o valor 1 significa "trecho com pedágio"
  const pedagios = f.properties.extras?.tollways?.summary ?? [];
  const pedagioPct = pedagios
    .filter((s) => s.value === 1)
    .reduce((soma, s) => soma + s.amount, 0);

  // Com elevação ligada, cada coordenada vem como [lng, lat, altitude].
  // Usamos só as duas primeiras.
  const linha = f.geometry.coordinates.map((c) => [c[1], c[0]] as Ponto);
  const ac = contarAcidentes(linha);

  return {
    linha,
    km: f.properties.summary.distance / 1000,
    min: f.properties.summary.duration / 60,
    subidaM: f.properties.ascent ?? 0,
    pedagioPct,
    asfaltoPct,
    terraPct,
    semDadoPct,
    acidentes: ac.quantidade,
    mortos: ac.mortos,
    pesoAcidentes: ac.peso,
  };
}

// Transforma o código de erro HTTP em uma mensagem que o usuário entende
function mensagemDeErro(status: number): string {
  if (status === 401 || status === 403) {
    return "Chave do OpenRouteService inválida ou sem permissão. Confira o arquivo .env.local e reinicie o servidor (npm run dev).";
  }
  if (status === 429) {
    return "Limite de uso do OpenRouteService atingido (por minuto ou por dia). Tente de novo mais tarde.";
  }
  if (status === 404) {
    return "Não encontrei rota entre esses pontos. Marque origem e destino mais perto de uma estrada.";
  }
  if (status === 400) {
    return "Não foi possível calcular essa rota (distância grande demais ou pontos inválidos).";
  }
  if (status >= 500) {
    return "O serviço de rotas está com problema no momento. Tente de novo em instantes.";
  }
  return `Erro inesperado ao calcular a rota (código ${status}).`;
}

async function buscarRotas(origem: Ponto, destino: Ponto): Promise<Rota[]> {
  const chamar = (comAlternativas: boolean) => {
    const corpo: Record<string, unknown> = {
      // O ORS espera longitude primeiro, depois latitude
      coordinates: [
        [origem[1], origem[0]],
        [destino[1], destino[0]],
      ],
      extra_info: ["surface", "tollways"],
      elevation: true,
    };
    if (comAlternativas) {
      corpo.alternative_routes = {
        target_count: 3,
        share_factor: 0.6,
        weight_factor: 1.4,
      };
    }
    return fetch(
      "https://api.openrouteservice.org/v2/directions/driving-car/geojson",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: import.meta.env.VITE_ORS_KEY,
        },
        body: JSON.stringify(corpo),
      }
    );
  };

  // fetch só lança erro quando não consegue nem falar com o servidor
  const tentar = async (comAlternativas: boolean) => {
    try {
      return await chamar(comAlternativas);
    } catch {
      throw new Error(
        "Sem conexão com a internet, ou o serviço de rotas está fora do ar."
      );
    }
  };

  let resposta = await tentar(true);

  // Rotas alternativas só funcionam até ~100 km no plano gratuito.
  // Se falhar, tentamos de novo só com a rota principal, exceto nos
  // erros em que não adianta repetir (chave inválida e limite de uso).
  const semNovaTentativa = [401, 403, 429];
  if (!resposta.ok && !semNovaTentativa.includes(resposta.status)) {
    resposta = await tentar(false);
  }
  if (!resposta.ok) throw new Error(mensagemDeErro(resposta.status));

  const dados = await resposta.json();
  const features = (dados.features ?? []) as Feature[];
  if (features.length === 0) {
    throw new Error("Nenhuma rota encontrada entre esses pontos.");
  }
  return features.slice(0, 3).map(converter);
}

function CliqueNoMapa({ aoClicar }: { aoClicar: (p: Ponto) => void }) {
  useMapEvents({
    click(e) {
      aoClicar([e.latlng.lat, e.latlng.lng]);
    },
  });
  return null;
}

// Dá zoom para mostrar a rota inteira quando ela é selecionada
function AjustarMapa({ linha }: { linha?: Ponto[] }) {
  const mapa = useMap();

  useEffect(() => {
    if (!linha || linha.length === 0) return;
    mapa.fitBounds(L.latLngBounds(linha), {
      // Deixa espaço à direita para o painel não cobrir a rota
      paddingTopLeft: [40, 40],
      paddingBottomRight: [300, 40],
    });
  }, [linha, mapa]);

  return null;
}

export default function App() {
  const [pontos, setPontos] = useState<Ponto[]>([]);
  const [rotas, setRotas] = useState<Rota[]>([]);
  const [selecionada, setSelecionada] = useState(0);
  const [criterio, setCriterio] = useState<Criterio>("rapidez");
  const [erro, setErro] = useState<string | null>(null);

  const [kmPorLitro, setKmPorLitro] = useState(12);
  const [precoLitro, setPrecoLitro] = useState(6.0);
  const [valorPedagio, setValorPedagio] = useState(0);

  // Consumo e preço precisam ser positivos; pedágio não pode ser negativo
  const entradasValidas =
    kmPorLitro > 0 && precoLitro > 0 && valorPedagio >= 0;

  // Litros gastos só pela distância
  const litrosBase = (r: Rota) => (kmPorLitro > 0 ? r.km / kmPorLitro : 0);

  // Litros extras por causa das subidas
  const litrosSubida = (r: Rota) => r.subidaM * LITROS_POR_METRO_SUBIDA;

  // Litros totais da rota
  const litrosDe = (r: Rota) => litrosBase(r) + litrosSubida(r);

  // A rota passa por algum trecho com pedágio?
  const temPedagio = (r: Rota) => r.pedagioPct > 0;

  // Pedágio a pagar nesta rota (só se ela tiver pedágio)
  const pedagioDe = (r: Rota) => (temPedagio(r) ? valorPedagio : 0);

  // Custo total: combustível + pedágio
  const custoDe = (r: Rota) => litrosDe(r) * precoLitro + pedagioDe(r);

  // Nota de pavimento: asfalto vale 100, terra vale 0 e
  // trechos sem dado contam como meio-termo (50)
  const notaPavimento = (r: Rota) =>
    Math.round(r.asfaltoPct + r.semDadoPct * 0.5);

  // Nota de acidentes: 100 = quase nenhum acidente perto da rota.
  // Se a PRF não tem nenhum registro perto da rota, devolve null
  // (sem dados) em vez de fingir que a rota é perfeita.
  const notaAcidentes = (r: Rota): number | null => {
    if (r.acidentes === 0) return null;
    const pesoPorKm = r.km > 0 ? r.pesoAcidentes / r.km : 0;
    return Math.round(
      Math.max(0, Math.min(100, 100 - pesoPorKm * DESCONTO_POR_PESO_KM))
    );
  };

  // Nota final de segurança: média de pavimento e acidentes.
  // Sem dados de acidentes, usa só o pavimento.
  const notaSeguranca = (r: Rota) => {
    const acidentes = notaAcidentes(r);
    const pavimento = notaPavimento(r);
    if (acidentes === null) return pavimento;
    return Math.round((pavimento + acidentes) / 2);
  };

  // Devolve a lista de rotas na ordem do critério escolhido.
  // Guardamos o índice original (i) para manter a cor de cada rota.
  const ordenar = (c: Criterio) =>
    rotas
      .map((r, i) => ({ r, i }))
      .sort((a, b) => {
        if (c === "rapidez") return a.r.min - b.r.min;
        if (c === "economia") return custoDe(a.r) - custoDe(b.r);
        return notaSeguranca(b.r) - notaSeguranca(a.r);
      });

  const escolherCriterio = (c: Criterio) => {
    setCriterio(c);
    const melhor = ordenar(c)[0];
    if (melhor) setSelecionada(melhor.i);
  };

  useEffect(() => {
    setErro(null);

    if (pontos.length < 2) {
      setRotas([]);
      setSelecionada(0);
      return;
    }

    buscarRotas(pontos[0], pontos[1])
      .then((lista) => {
        setRotas(lista);
        setSelecionada(0);
      })
      .catch((e: unknown) => {
        setRotas([]);
        setErro(
          e instanceof Error ? e.message : "Não consegui calcular a rota."
        );
      });
  }, [pontos]);

  const ordenadas = ordenar(criterio);

  // Desenha a rota selecionada por último, para ficar por cima das outras
  const paraDesenhar = rotas
    .map((r, i) => ({ r, i }))
    .sort(
      (a, b) => Number(a.i === selecionada) - Number(b.i === selecionada)
    );

  const maisRapida = rotas.length
    ? rotas.reduce((a, b) => (b.min < a.min ? b : a))
    : null;
  const maisCurta = rotas.length
    ? rotas.reduce((a, b) => (b.km < a.km ? b : a))
    : null;
  const maisBarata =
    rotas.length && entradasValidas
      ? rotas.reduce((a, b) => (custoDe(b) < custoDe(a) ? b : a))
      : null;
  const maisSegura = rotas.length
    ? rotas.reduce((a, b) => (notaSeguranca(b) > notaSeguranca(a) ? b : a))
    : null;

  return (
    <div className="app">
      <MapContainer center={[-15.23, -59.34]} zoom={12} className="mapa">
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <CliqueNoMapa
          aoClicar={(p) => {
            if (pontos.length < 2) setPontos([...pontos, p]);
          }}
        />
        <AjustarMapa linha={rotas[selecionada]?.linha} />

        {pontos.map((p, i) => (
          <Marker
            key={i}
            position={p}
            icon={i === 0 ? ICONE_ORIGEM : ICONE_DESTINO}
          />
        ))}

        {paraDesenhar.map(({ r, i }) =>
          i === selecionada ? (
            <Fragment key={i}>
              {/* Contorno branco por baixo, para a rota "saltar" do mapa */}
              <Polyline
                positions={r.linha}
                color="white"
                weight={14}
                opacity={1}
                interactive={false}
              />
              <Polyline
                positions={r.linha}
                color={CORES[i]}
                weight={9}
                opacity={1}
              />
            </Fragment>
          ) : (
            <Polyline
              key={i}
              positions={r.linha}
              color={CORES[i]}
              weight={5}
              opacity={0.85}
              eventHandlers={{ click: () => setSelecionada(i) }}
            />
          )
        )}
      </MapContainer>

      <div className="painel">
        <p>
          {pontos.length === 0 && "Clique no mapa para marcar a origem (A)"}
          {pontos.length === 1 && "Agora clique para marcar o destino (B)"}
          {pontos.length === 2 &&
            rotas.length === 0 &&
            !erro &&
            "Calculando rotas..."}
          {rotas.length > 0 && `${rotas.length} rota(s) encontrada(s)`}
        </p>

        {erro && (
          <p style={{ color: "#b91c1c", fontSize: 13 }}>⚠️ {erro}</p>
        )}

        <label className="campo">
          Consumo (km/l):
          <input
            type="number"
            value={kmPorLitro}
            min={1}
            onChange={(e) => setKmPorLitro(Number(e.target.value))}
          />
        </label>

        <label className="campo">
          Preço do litro (R$):
          <input
            type="number"
            value={precoLitro}
            min={0}
            step={0.1}
            onChange={(e) => setPrecoLitro(Number(e.target.value))}
          />
        </label>

        <label className="campo">
          Pedágio da rota (R$):
          <input
            type="number"
            value={valorPedagio}
            min={0}
            step={0.5}
            onChange={(e) => setValorPedagio(Number(e.target.value))}
          />
        </label>

        {!entradasValidas && (
          <p style={{ color: "#b91c1c", fontSize: 13 }}>
            ⚠️ Consumo e preço do litro precisam ser maiores que zero, e o
            pedágio não pode ser negativo.
          </p>
        )}

        <div className="criterios">
          <button
            className={`criterio ${criterio === "rapidez" ? "ativo" : ""}`}
            onClick={() => escolherCriterio("rapidez")}
          >
            ⚡ Rapidez
          </button>
          <button
            className={`criterio ${criterio === "economia" ? "ativo" : ""}`}
            onClick={() => escolherCriterio("economia")}
          >
            💰 Economia
          </button>
          <button
            className={`criterio ${criterio === "seguranca" ? "ativo" : ""}`}
            onClick={() => escolherCriterio("seguranca")}
          >
            🛡️ Segurança
          </button>
        </div>

        {ordenadas.map(({ r, i }, posicao) => (
          <div
            key={i}
            className={`cartao ${i === selecionada ? "ativo" : ""}`}
            style={{ borderColor: CORES[i] }}
            onClick={() => setSelecionada(i)}
          >
            <strong>Rota {i + 1}</strong>
            {posicao === 0 && " ⭐ recomendada"}
            <p>
              {r === maisRapida && "⚡ "}
              {r === maisCurta && "📏 "}
              {r === maisBarata && "💰 "}
              {r === maisSegura && "🛡️ "}
              {r.km.toFixed(1)} km · {Math.round(r.min)} min
            </p>
            <p>
              Custo:{" "}
              {entradasValidas
                ? `R$ ${custoDe(r).toFixed(2)} (${litrosDe(r).toFixed(1)} L)`
                : "informe consumo e preço"}
            </p>
            {temPedagio(r) && (
              <p>
                💳 Passa por pedágio
                {valorPedagio > 0 && ` (R$ ${valorPedagio.toFixed(2)} incluído)`}
              </p>
            )}
            <p>🛡️ Segurança: {notaSeguranca(r)}/100</p>

            {i === selecionada && (
              <div style={{ fontSize: 13, color: "#475569" }}>
                <p>
                  Subida acumulada: {Math.round(r.subidaM)} m (+
                  {litrosSubida(r).toFixed(2)} L estimados)
                </p>
                <p>
                  Pedágio:{" "}
                  {temPedagio(r)
                    ? `${Math.round(r.pedagioPct)}% do trajeto tem pedágio no mapa.${
                        valorPedagio === 0
                          ? " Informe o valor no campo acima para entrar no custo."
                          : ""
                      }`
                    : "nenhum trecho com pedágio no mapa."}
                </p>
                <p>
                  Pavimento {notaPavimento(r)}/100: asfalto{" "}
                  {Math.round(r.asfaltoPct)}% · terra{" "}
                  {Math.round(r.terraPct)}% · sem dado{" "}
                  {Math.round(r.semDadoPct)}%
                </p>
                {notaAcidentes(r) === null ? (
                  <p>
                    Acidentes: sem registros da PRF perto desta rota. Este
                    fator não entra na nota.
                  </p>
                ) : (
                  <p>
                    Acidentes {notaAcidentes(r)}/100: {r.acidentes} perto da
                    rota, {r.mortos} com morte
                  </p>
                )}
                <p>Dados da PRF (só rodovias federais, 2024 a 2026).</p>
              </div>
            )}
          </div>
        ))}

        <button onClick={() => setPontos([])}>Limpar</button>
      </div>
    </div>
  );
}