// Atualiza data.json -> classificacao a partir do site da CIF.
// Corre na GitHub Action (.github/workflows/classificacao.yml) ou localmente: node scripts/update-classificacao.mjs
import { readFileSync, writeFileSync } from "node:fs";

const CIF_URL = "https://www.cif.org.pt/futebol/resultados/classificacao";
const DATA = new URL("../data.json", import.meta.url);
const NOMES = { "Amigos CDUL": "CDUL" }; // nome no site -> nome na app

const html = await (await fetch(CIF_URL)).text();
const tabela = html.match(/<table id="tabela-classificacao"[\s\S]*?<\/table>/);
if (!tabela) throw new Error("Tabela de classificação não encontrada no site da CIF");

const limpa = (s) => s.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
const linhas = [...tabela[0].matchAll(/<tr[\s\S]*?<\/tr>/g)]
  .map((m) => [...m[0].matchAll(/<td[\s\S]*?<\/td>/g)].map((c) => limpa(c[0])))
  .filter((cells) => cells.length >= 12);
if (linhas.length < 10) throw new Error(`Só ${linhas.length} equipas lidas — estrutura do site mudou?`);

// Colunas no site: # Equipa Pts Jgs V E D FC GM GS DIF TD
const classificacao = linhas.map((c) => {
  const n = (i) => {
    const v = Number(c[i]);
    if (!Number.isFinite(v)) throw new Error(`Valor inválido "${c[i]}" na linha ${c.join(" | ")}`);
    return v;
  };
  return { pos: n(0), equipa: NOMES[c[1]] || c[1], pts: n(2), j: n(3), v: n(4), e: n(5), dd: n(6), gm: n(8), gs: n(9), td: n(11) };
});

const data = JSON.parse(readFileSync(DATA, "utf8"));
if (JSON.stringify(data.classificacao) === JSON.stringify(classificacao)) {
  console.log("Classificação sem alterações.");
} else {
  data.classificacao = classificacao;
  data.meta.atualizado = new Date().toISOString();
  writeFileSync(DATA, JSON.stringify(data, null, 2), "utf8");
  console.log(`Classificação atualizada (${classificacao.length} equipas).`);
}
