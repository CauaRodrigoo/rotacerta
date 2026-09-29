import { useState, useEffect } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Polyline,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import "./App.css";

const icone = L.icon({
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

type Ponto = [number, number];

type Rota = {
  linha: Ponto[];
  km: number;
  min: number;
};

const CORES = ["#1d4ed8", "#16a34a", "#ea580c"];

function CliqueNoMapa({ aoClicar }: { aoClicar: (p: Ponto) => void }) {
  useMapEvents({
    click(e) {
      aoClicar([e.latlng.lat, e.latlng.lng]);
    },
  });
  return null;
}

export default function App() {
  const [pontos, setPontos] = useState<Ponto[]>([]);
  const [rotas, setRotas] = useState<Rota[]>([]);
  const [selecionada, setSelecionada] = useState(0);

  const [kmPorLitro, setKmPorLitro] = useState(12);
  const [precoLitro, setPrecoLitro] = useState(6.0);

  useEffect(() => {
    if (pontos.length < 2) {
      setRotas([]);
      setSelecionada(0);
      return;
    }

    const [origem, destino] = pontos;
    // O OSRM espera longitude primeiro, depois latitude
    const url =
      `https://router.project-osrm.org/route/v1/driving/` +
      `${origem[1]},${origem[0]};${destino[1]},${destino[0]}` +
      `?overview=full&geometries=geojson&alternatives=true`;

    fetch(url)
      .then((r) => r.json())
      .then((dados) => {
        const lista: Rota[] = dados.routes.slice(0, 3).map(
          (r: {
            geometry: { coordinates: [number, number][] };
            distance: number;
            duration: number;
          }) => ({
            linha: r.geometry.coordinates.map(
              (c) => [c[1], c[0]] as Ponto
            ),
            km: r.distance / 1000,
            min: r.duration / 60,
          })
        );
        setRotas(lista);
        setSelecionada(0);
      })
      .catch(() => alert("Não consegui calcular a rota"));
  }, [pontos]);

  const custoDe = (km: number) =>
    kmPorLitro > 0 ? (km / kmPorLitro) * precoLitro : 0;

  const maisRapida = rotas.length
    ? rotas.reduce((a, b) => (b.min < a.min ? b : a))
    : null;
  const maisCurta = rotas.length
    ? rotas.reduce((a, b) => (b.km < a.km ? b : a))
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
        {pontos.map((p, i) => (
          <Marker key={i} position={p} icon={icone} />
        ))}
        {rotas.map((r, i) => (
          <Polyline
            key={i}
            positions={r.linha}
            color={CORES[i]}
            weight={i === selecionada ? 7 : 4}
            opacity={i === selecionada ? 1 : 0.6}
            eventHandlers={{ click: () => setSelecionada(i) }}
          />
        ))}
      </MapContainer>

      <div className="painel">
        <p>
          {pontos.length === 0 && "Clique no mapa para marcar a origem"}
          {pontos.length === 1 && "Agora clique para marcar o destino"}
          {pontos.length === 2 && rotas.length === 0 && "Calculando rotas..."}
          {rotas.length > 0 && `${rotas.length} rota(s) encontrada(s)`}
        </p>

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

        {rotas.map((r, i) => (
          <div
            key={i}
            className={`cartao ${i === selecionada ? "ativo" : ""}`}
            style={{ borderColor: CORES[i] }}
            onClick={() => setSelecionada(i)}
          >
            <strong>Rota {i + 1}</strong>
            {r === maisRapida && " ⚡ mais rápida"}
            {r === maisCurta && " 📏 mais curta"}
            <p>
              {r.km.toFixed(1)} km · {Math.round(r.min)} min
            </p>
            <p>Custo: R$ {custoDe(r.km).toFixed(2)}</p>
          </div>
        ))}

        <button onClick={() => setPontos([])}>Limpar</button>
      </div>
    </div>
  );
}