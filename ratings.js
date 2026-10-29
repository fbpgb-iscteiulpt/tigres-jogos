/* ============================================================
   Tigres — Modelo de notas por jogador (0–10)
   Modelo transparente, sensível à posição, minutos e resultado.
   Usar: computeRatings(data) -> { porJornada: {num:[...]}, media: [...] }
         rateJornada(data, jornada) -> [{nome,pos,min,nota}]  (ordenado desc)
   Cada nota também disponível via rateOne(player, ctx).
   ============================================================ */

/* ---------- Parâmetros do modelo (afináveis) ---------- */
const RATING_CONFIG = {
  BASE: 4.0,
  MIN: 4.0,
  MAX: 10.0,

  // Positivos comuns (todas as posições)
  golo: 2.0,
  assistencia: 1.5,
  passeFinalizacao: 0.5,
  dribleOk: 0.35,
  remateFora: 0.20,      // remate não à baliza (fora/bloqueado)
  remateBaliza: 0.40,    // remate à baliza (substitui, NÃO acumula com remateFora)

  // Positivos por posição (aplicados às estatísticas relevantes)
  porPosicao: {
    GR: { defesas: 1.2, desarmes: 0.30 },
    DC: { desarmes: 0.40, cruzamentos: 0.10 },
    LD: { desarmes: 0.40, cruzamentos: 0.30, dribleOk: 0.10 },
    MD: { desarmes: 0.40, passeFinalizacao: 0.20 },
    MC: { desarmes: 0.35, passeFinalizacao: 0.30, cruzamentos: 0.15 },
    EX: { cruzamentos: 0.30, dribleOk: 0.25, desarmes: 0.35 },
    PL: { desarmes: 0.35 },
  },

  // Negativos: passes errados (PE) e perdas de bola (PB) por grupo posicional
  pePorGrupo: {
    GR: { pe: 0.32, pb: 0.38 },
    DC: { pe: 0.32, pb: 0.38 },
    LD: { pe: 0.26, pb: 0.30 },
    MD: { pe: 0.16, pb: 0.18 },
    MC: { pe: 0.16, pb: 0.17 },
    EX: { pe: 0.12, pb: 0.12 },
    PL: { pe: 0.12, pb: 0.12 },
  },
  // Falta cometida (por posição): EX/PL mais leve
  faltaPorPos: { GR: 0.10, DC: 0.10, LD: 0.10, MD: 0.10, MC: 0.10, EX: 0.06, PL: 0.06 },
  // Drible falhado (por posição): MC/EX/PL mais leve
  dribleFalhadoPorPos: { GR: 0.12, DC: 0.12, LD: 0.12, MD: 0.12, MC: 0.05, EX: 0.05, PL: 0.05 },

  // Golos sofridos (× fração de minutos jogados)
  golosSofridos: { GR: 0.7, DC: 0.5, LD: 0.5, MD: 0.3, MC: 0.3, EX: 0.2, PL: 0 },

  // Penálti cometido
  penalti: 1.0,

  // Clean sheet (0 golos sofridos individuais), × fração de minutos
  cleanSheet: { GR: 1.0, DC: 1.0, LD: 1.0, MD: 0.8, MC: 0.8, EX: 0, PL: 0 },

  // Ajuste por minutos: regressa parcialmente à base
  // fator = minutosPesoBase + minutosPesoVar * min(1, min/minutosPlenos)
  minutosPesoBase: 0.82,
  minutosPesoVar: 0.18,
  minutosPlenos: 50,

  // Desconto extra para cameos muito curtos (≤25 min) SEM impacto claro
  poucosMinutos: 25,
  poucosMinutosMult: 0.85,
  // "impacto" isenta do desconto: golo, assistência, passe p/ finalização, ou muitos desarmes
  impactoDesarmes: 6,
};

/* ---------- Overrides de posição por jogo ---------- */
/* Chave: "<numeroJornada>|<nome>" -> posição textual (como nas Listas) */
const POS_OVERRIDE = {
  "1|Branco": "Defesa Central",
  "1|Rodrigo": "Lateral Esquerdo",
  "2|Rodrigo": "Lateral Esquerdo",
  "2|Paulinho": "Defesa Central",
  "5|Dentes": "Lateral Esquerdo",
  "5|Miguel Cruz": "Medio Defensivo",
};

/* ---------- Jogadores que NÃO sofreram golo em cada jornada ----------
   Golos são da equipa; quando um jogador não estava em campo no(s) golo(s)
   sofrido(s), não leva a penalização e ganha o bónus de clean sheet.
   Chave: numero da jornada -> lista de nomes. */
const SEM_GOLO_SOFRIDO = {
  3: ["Dentes", "Luis", "Afonso", "Jacob", "Tigrão"],
};

/* ---------- Posição textual -> papel curto ---------- */
function roleOf(posStr) {
  const s = (posStr || "").toLowerCase();
  if (s.includes("guarda")) return "GR";
  if (s.includes("extremo")) return "EX";
  if (s.includes("ponta") || s.includes("avançado") || s.includes("avancado")) return "PL";
  if (s.includes("lateral") || s.includes("ala")) return "LD";
  if (s.includes("medio defensivo")) return "MD";
  if (s.includes("medio")) return "MC";
  if (s.includes("defesa central")) return "DC";
  return "MC"; // por defeito, médio
}

/* Posição efetiva de um jogador num jogo (respeita overrides) */
function posOf(data, numero, nome) {
  return POS_OVERRIDE[`${numero}|${nome}`] || data?.listas?.posicoes?.[nome] || "";
}

function hasImpact(p, C) {
  return (p.golos > 0) || (p.assistencias > 0) || (p.passeFinalizacao > 0) || ((p.desarmes || 0) >= C.impactoDesarmes);
}

/* ---------- Nota de um jogador ----------
   ctx: { golosSofridos, penaltis:{nome:n}, remBaliza:{nome:n}, posStr, semGolo:bool } */
function rateOne(p, ctx, C = RATING_CONFIG) {
  const r = roleOf(ctx.posStr);
  let s = C.BASE;
  const g = p.golos || 0, a = p.assistencias || 0, pf = p.passeFinalizacao || 0,
        des = p.desarmes || 0, def = p.defesas || 0, db = p.driblesBemSucedidos || 0,
        dfl = p.driblesFalhados || 0, cru = p.cruzamentosBemSucedidos || 0, pe = p.passesErrados || 0,
        pb = p.perdasBola || 0, flt = p.faltas || 0, rem = p.remates || 0, min = p.minutos || 0;

  // Golos sofridos individuais: 0 se o jogador não estava em campo no golo
  const gsInd = ctx.semGolo ? 0 : (ctx.golosSofridos || 0);

  // Remates: à baliza (dos eventos) valem mais e NÃO acumulam com o remate normal
  const ab = Math.min(ctx.remBaliza?.[p.nome] || 0, rem);
  const fora = Math.max(0, rem - ab);

  // Positivos comuns
  s += g * C.golo + a * C.assistencia + pf * C.passeFinalizacao + db * C.dribleOk;
  s += fora * C.remateFora + ab * C.remateBaliza;

  // Positivos por posição
  const pp = C.porPosicao[r] || {};
  if (pp.defesas) s += def * pp.defesas;
  if (pp.desarmes) s += des * pp.desarmes;
  if (pp.cruzamentos) s += cru * pp.cruzamentos;
  if (pp.dribleOk) s += db * pp.dribleOk;
  if (pp.passeFinalizacao) s += pf * pp.passeFinalizacao;
  if (pp.remates) s += rem * pp.remates;

  // Negativos PE / PB por grupo
  const w = C.pePorGrupo[r] || { pe: 0.16, pb: 0.19 };
  s -= pe * w.pe + pb * w.pb;
  s -= flt * (C.faltaPorPos[r] ?? 0.10) + dfl * (C.dribleFalhadoPorPos[r] ?? 0.12);

  // Golos sofridos (× minutos)
  const wGS = C.golosSofridos[r] ?? 0;
  s -= gsInd * wGS * Math.min(1, min / 80);

  // Penálti cometido
  s -= (ctx.penaltis?.[p.nome] || 0) * C.penalti;

  // Clean sheet (quando não sofreu golo — a nível individual)
  if (gsInd === 0) {
    const cs = C.cleanSheet[r] ?? 0;
    s += cs * Math.min(1, min / 80);
  }

  // Ajuste base por minutos
  const frac = Math.min(1, min / C.minutosPlenos);
  s = C.BASE + (s - C.BASE) * (C.minutosPesoBase + C.minutosPesoVar * frac);

  // Desconto extra para cameos muito curtos sem impacto
  if (min <= C.poucosMinutos && !hasImpact(p, C)) {
    s = C.BASE + (s - C.BASE) * C.poucosMinutosMult;
  }

  return Math.max(C.MIN, Math.min(C.MAX, s));
}

/* Contadores a partir dos eventos da jornada */
function eventCounts(jornada) {
  const penaltis = {}, remBaliza = {};
  for (const e of (jornada.eventos || [])) {
    if (e.acao === "Penalti feito" && e.jogador) penaltis[e.jogador] = (penaltis[e.jogador] || 0) + 1;
    // remate à baliza em qualquer zona ("Remate à baliza", "... de dentro de area", "... fora de area")
    if (/^remate à baliza/i.test(e.acao || "") && e.jogador) remBaliza[e.jogador] = (remBaliza[e.jogador] || 0) + 1;
  }
  return { penaltis, remBaliza };
}

/* Nota de todos os jogadores de uma jornada (ordenado desc) */
function rateJornada(data, jornada, C = RATING_CONFIG) {
  const golosSofridos = +(jornada.matchStats?.Resultado?.adversario ?? 0);
  const { penaltis, remBaliza } = eventCounts(jornada);
  const semGoloSet = new Set(SEM_GOLO_SOFRIDO[jornada.numero] || []);
  return (jornada.players || []).map((p) => {
    const posStr = posOf(data, jornada.numero, p.nome);
    const ctx = { golosSofridos, penaltis, remBaliza, posStr, semGolo: semGoloSet.has(p.nome) };
    return { nome: p.nome, pos: roleOf(posStr), min: p.minutos || 0, nota: +rateOne(p, ctx, C).toFixed(1) };
  }).sort((a, b) => b.nota - a.nota);
}

/* Notas de todas as jornadas + média da época por jogador */
function computeRatings(data, C = RATING_CONFIG) {
  const porJornada = {}, somas = {};
  for (const j of (data.jornadas || [])) {
    const rows = rateJornada(data, j, C);
    porJornada[j.numero] = rows;
    for (const row of rows) {
      const acc = (somas[row.nome] ||= { nome: row.nome, total: 0, jogos: 0 });
      acc.total += row.nota; acc.jogos++;
    }
  }
  const media = Object.values(somas)
    .map((x) => ({ nome: x.nome, media: +(x.total / x.jogos).toFixed(2), jogos: x.jogos }))
    .sort((a, b) => b.media - a.media);
  return { porJornada, media };
}

/* Export para browser (app.js) e para módulos */
if (typeof window !== "undefined") {
  window.TigresRatings = { RATING_CONFIG, POS_OVERRIDE, SEM_GOLO_SOFRIDO, roleOf, rateOne, rateJornada, computeRatings };
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = { RATING_CONFIG, POS_OVERRIDE, SEM_GOLO_SOFRIDO, roleOf, rateOne, rateJornada, computeRatings };
}
