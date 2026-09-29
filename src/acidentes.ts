import dados from "./dados/acidentes.json";

type Ponto = [number, number];

// Cada acidente: [latitude, longitude, mortos, feridos graves]
const ACIDENTES = dados as [number, number, number, number][];

const RAIO_M = 200;
const MARGEM = 0.005; // ~500 m, só para filtrar rápido

// Distância (em metros) de um ponto até um segmento de reta
function distanciaAteSegmento(p: Ponto, a: Ponto, b: Ponto) {
  const ky = 110540;
  const kx = 111320 * Math.cos((p[0] * Math.PI) / 180);

  const ax = (a[1] - p[1]) * kx;
  const ay = (a[0] - p[0]) * ky;
  const bx = (b[1] - p[1]) * kx;
  const by = (b[0] - p[0]) * ky;

  const dx = bx - ax;
  const dy = by - ay;
  const tamanho2 = dx * dx + dy * dy;

  let t = tamanho2 === 0 ? 0 : -(ax * dx + ay * dy) / tamanho2;
  t = Math.max(0, Math.min(1, t));

  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.sqrt(cx * cx + cy * cy);
}

// Diz se um valor está entre um mínimo e um máximo
function entre(valor: number, minimo: number, maximo: number) {
  return valor >= minimo && valor <= maximo;
}

export function contarAcidentes(linha: Ponto[]) {
  const lats = linha.map((p) => p[0]);
  const lngs = linha.map((p) => p[1]);
  const minLat = Math.min(...lats) - MARGEM;
  const maxLat = Math.max(...lats) + MARGEM;
  const minLng = Math.min(...lngs) - MARGEM;
  const maxLng = Math.max(...lngs) + MARGEM;

  // 1) Só olha os acidentes dentro da "caixa" que envolve a rota
  const candidatos = ACIDENTES.filter((a) => {
    const dentroLat = entre(a[0], minLat, maxLat);
    const dentroLng = entre(a[1], minLng, maxLng);
    return dentroLat && dentroLng;
  });

  let quantidade = 0;
  let mortos = 0;
  let peso = 0;

  // 2) Para cada candidato, vê se está perto de algum trecho da rota
  for (const a of candidatos) {
    const p: Ponto = [a[0], a[1]];
    let perto = false;

    for (let i = 0; i < linha.length - 1; i++) {
      const s1 = linha[i];
      const s2 = linha[i + 1];

      // Descarte rápido: acidente longe demais deste trecho
      const pertoLat = entre(
        p[0],
        Math.min(s1[0], s2[0]) - MARGEM,
        Math.max(s1[0], s2[0]) + MARGEM
      );
      const pertoLng = entre(
        p[1],
        Math.min(s1[1], s2[1]) - MARGEM,
        Math.max(s1[1], s2[1]) + MARGEM
      );
      if (!pertoLat || !pertoLng) continue;

      if (distanciaAteSegmento(p, s1, s2) <= RAIO_M) {
        perto = true;
        break;
      }
    }

    if (perto) {
      quantidade++;
      mortos += a[2];
      // Acidente comum vale 1, ferido grave vale 2, morte vale 5
      peso += 1 + a[2] * 5 + a[3] * 2;
    }
  }

  return { quantidade, mortos, peso };
}