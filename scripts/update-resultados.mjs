// Atualiza data.json com os resultados dos Tigres a partir do site da CIF (páginas por jornada).
//  - Jornada já jogada mas ainda sem folha no Excel -> cria a jornada só com o resultado (semEstatisticas: true).
//  - Acerta o calendário (hora, adversário, casa/fora) da jornada seguinte.
//  - Pára no primeiro jogo dos Tigres ainda por jogar (= próximo jogo).
// Corre na GitHub Action (.github/workflows/classificacao.yml) ou localmente: node scripts/update-resultados.mjs
import { readFileSync, writeFileSync } from "node:fs";

const CIF = "https://www.cif.org.pt";
const CLUBE = "Tigres";
const DATA = new URL("../data.json", import.meta.url);
const ALIAS = { "a cdul": "CDUL", "acdul": "CDUL", "amigos cdul": "CDUL", "sd 76": "SD76" }; // nome no site (normalizado) -> nome na app

const get = async (url) => {
  const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!r.ok) throw new Error(`${url} respondeu ${r.status}`);
  return r.text();
};
const decode = (s) => s.replace(/&amp;/g, "&").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).trim();
const norm = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\./g, "").replace(/\s+/g, " ").trim().toLowerCase();

const data = JSON.parse(readFileSync(DATA, "utf8"));
const equipas = data.listas?.equipas || [];
function nomeApp(nomeSite) {
  const n = norm(nomeSite);
  if (ALIAS[n]) return ALIAS[n];
  const e = equipas.find((x) => norm(x) === n);
  if (!e) throw new Error(`Equipa "${nomeSite}" do site da CIF não existe na lista da app — adicionar a ALIAS`);
  return e;
}

// Jogos de uma página de jornada: [{ dia, hora, casa, fora, gCasa, gFora }]
function parseJornada(html) {
  const out = []; let dia = null; let m;
  const re = /<h1>([^<]*\d{4})<\/h1>|<article class="games-list"[\s\S]*?<\/article>/g;
  while ((m = re.exec(html))) {
    if (m[1]) { dia = m[1].trim(); continue; }
    const a = m[0];
    const eq = [...a.matchAll(/<li>\s*<h1>([^<]+)<\/h1>\s*<figure>/g)].map((x) => decode(x[1]));
    const gl = [...a.matchAll(/<div><h1>([^<]*)<\/h1><\/div>/g)].map((x) => x[1].trim());
    if (eq.length !== 2 || gl.length !== 2) throw new Error(`Bloco de jogo com formato inesperado: ${a.slice(0, 200)}`);
    out.push({ dia, hora: (a.match(/<h2>([^<]*)<\/h2>/) || [])[1]?.trim() || null, casa: eq[0], fora: eq[1], gCasa: gl[0], gFora: gl[1] });
  }
  return out;
}

// Época atual (ex.: "torneio-cif-2026-2027") a partir da página de resultados
const idx = await get(`${CIF}/futebol/resultados/resultados`);
const epoca = (idx.match(/\/futebol\/(torneio-[\w-]+)\/resultados\/\d+/) || [])[1];
if (!epoca) throw new Error("Não encontrei o link das jornadas na página de resultados da CIF — estrutura mudou?");

const comStats = data.jornadas.filter((j) => !j.semEstatisticas).map((j) => j.numero);
const placeholders = data.jornadas.filter((j) => j.semEstatisticas).map((j) => j.numero);
let n = Math.min(Math.max(0, ...comStats) + 1, ...placeholders);
const nMax = Math.max(...(data.calendario || []).map((c) => c.numero), 0) || 40;
const alteracoes = [];

for (; n <= nMax; n++) {
  const jogos = parseJornada(await get(`${CIF}/futebol/${epoca}/resultados/${n}`));
  const g = jogos.find((x) => x.casa === CLUBE || x.fora === CLUBE);
  if (!g) { console.log(`J${n}: sem jogo dos ${CLUBE} na página.`); continue; }
  const emCasa = g.casa === CLUBE;
  const adversario = nomeApp(emCasa ? g.fora : g.casa);

  // Calendário: acerta adversário, casa/fora e hora
  const cal = (data.calendario ||= []).find((c) => c.numero === n);
  if (!cal) throw new Error(`J${n} não existe no calendário da app`);
  for (const [k, v] of [["adversario", adversario], ["casa", emCasa], ["hora", g.hora]]) {
    if (v != null && cal[k] !== v) { alteracoes.push(`J${n} calendário ${k}: ${cal[k]} -> ${v}`); cal[k] = v; }
  }

  if (g.gCasa === "" || g.gFora === "") { console.log(`Próximo jogo: J${n} ${g.casa} vs ${g.fora} (${g.dia}, ${g.hora}).`); break; }

  const gm = +(emCasa ? g.gCasa : g.gFora), gs = +(emCasa ? g.gFora : g.gCasa);
  if (!Number.isFinite(gm) || !Number.isFinite(gs)) throw new Error(`J${n}: resultado inválido "${g.gCasa}-${g.gFora}"`);
  const j = data.jornadas.find((x) => x.numero === n);
  if (!j) {
    data.jornadas.push({
      numero: n, equipa: CLUBE, adversario, semEstatisticas: true,
      matchStats: { Resultado: { tigres: gm, adversario: gs } }, players: [], eventos: [],
      data: cal.data, hora: cal.hora, casa: cal.casa, ...(cal.video ? { video: cal.video } : {}),
    });
    alteracoes.push(`J${n} resultado novo: ${CLUBE} ${gm}-${gs} ${adversario} (sem estatísticas)`);
  } else if (j.semEstatisticas) {
    const r = j.matchStats.Resultado;
    if (r.tigres !== gm || r.adversario !== gs) { alteracoes.push(`J${n} resultado: ${r.tigres}-${r.adversario} -> ${gm}-${gs}`); j.matchStats.Resultado = { tigres: gm, adversario: gs }; }
    if (cal.video && j.video !== cal.video) j.video = cal.video;
  } else {
    const r = j.matchStats?.Resultado;
    if (r && (r.tigres !== gm || r.adversario !== gs)) console.log(`Aviso: J${n} no Excel está ${r.tigres}-${r.adversario}, na CIF está ${gm}-${gs}. Não alterado.`);
  }
}

data.jornadas.sort((a, b) => a.numero - b.numero);
if (!alteracoes.length) {
  console.log("Resultados sem alterações.");
} else {
  data.meta.atualizado = new Date().toISOString();
  writeFileSync(DATA, JSON.stringify(data, null, 2), "utf8");
  console.log(`Resultados atualizados:\n${alteracoes.join("\n")}`);
}
