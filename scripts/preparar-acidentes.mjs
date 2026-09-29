import fs from "node:fs";

const ARQUIVOS = [
  "dados/datatran2024.csv",
  "dados/datatran2025.csv",
  "dados/datatran2026.csv",
];
const ESTADOS = ["RO", "MT"];

const resultado = [];

for (const arquivo of ARQUIVOS) {
  // Os arquivos da PRF usam codificação latin1 e separador ";"
  const texto = fs.readFileSync(arquivo, "latin1");
  const linhas = texto.split(/\r?\n/).filter((l) => l.trim() !== "");

  const cabecalho = linhas[0].split(";").map((c) => c.replace(/"/g, "").trim());
  const col = (nome) => cabecalho.indexOf(nome);

  const iUf = col("uf");
  const iLat = col("latitude");
  const iLng = col("longitude");
  const iMortos = col("mortos");
  const iGraves = col("feridos_graves");

  if ([iUf, iLat, iLng, iMortos, iGraves].includes(-1)) {
    console.log("Colunas encontradas em", arquivo, ":", cabecalho);
    throw new Error("Não achei alguma coluna esperada em " + arquivo);
  }

  let usados = 0;
  for (const linha of linhas.slice(1)) {
    const c = linha.split(";").map((v) => v.replace(/"/g, "").trim());
    if (!ESTADOS.includes(c[iUf])) continue;

    // Na PRF o decimal vem com vírgula (ex.: -15,23)
    const lat = parseFloat(c[iLat].replace(",", "."));
    const lng = parseFloat(c[iLng].replace(",", "."));
    if (Number.isNaN(lat) || Number.isNaN(lng)) continue;

    resultado.push([
      Number(lat.toFixed(5)),
      Number(lng.toFixed(5)),
      Number(c[iMortos]) || 0,
      Number(c[iGraves]) || 0,
    ]);
    usados++;
  }
  console.log(arquivo, "->", usados, "acidentes em", ESTADOS.join("/"));
}

fs.mkdirSync("src/dados", { recursive: true });
fs.writeFileSync("src/dados/acidentes.json", JSON.stringify(resultado));
console.log("Total salvo:", resultado.length, "acidentes");