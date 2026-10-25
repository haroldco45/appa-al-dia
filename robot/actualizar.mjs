// Robot de APPA al Día — Vibras Positivas HM
// Corre en GitHub Actions cada 30 minutos. Busca noticias y videos reales
// sobre las APPA (Áreas de Protección para la Producción de Alimentos) y su
// derogatoria, y actualiza noticias.json solo si hay algo nuevo.
// Node 20+, sin dependencias.

import { readFile, writeFile } from 'node:fs/promises';

const ARCHIVO = new URL('../noticias.json', import.meta.url);
const MAX_NOTICIAS = 120;
const MAX_VIDEOS = 12;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';

const CONSULTAS = [
  'APPA Áreas de Protección para la Producción de Alimentos',
  'derogatoria APPA Ministerio de Agricultura',
  'APPA Dangond',
  'APPA Córdoba alimentos',
  'APPA Tolima alimentos',
  'APPA Santander Chucurí',
  'APPA Suroeste antioqueño',
  'ZPPA zonas protección producción alimentos'
];

const TEMA = /\bAPPA\b|\bZPPA\b|protecci[oó]n para la producci[oó]n de alimentos/i;
const AGRO = /aliment|agr[ií]col|agricultura|tierra|suelo|derog|minagricultura|ministr|campesin|hect[aá]rea|dangond|upra|ordenamiento|municipio/i;

const relevante = (t = '', d = '') => {
  const txt = `${t} ${d}`;
  if (/protecci[oó]n para la producci[oó]n de alimentos|\bZPPA\b/i.test(txt)) return true;
  return TEMA.test(txt) && AGRO.test(txt);
};

const limpiar = (s = '') => s
  .replace(/<!\[CDATA\[|\]\]>/g, '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
  .replace(/\s+/g, ' ').trim();

const clave = (t) => limpiar(t).toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/\s[-|–]\s[^-|–]+$/, '')
  .replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim().slice(0, 90);

async function traer(url, ms = 12000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { 'User-Agent': UA, 'Accept-Language': 'es-CO,es;q=0.9' }, redirect: 'follow' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  } finally { clearTimeout(t); }
}

const etiqueta = (xml, tag) => {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  return m ? m[1] : '';
};

function items(xml) {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map(m => m[1]);
}

async function bing(q) {
  const xml = await traer(`https://www.bing.com/news/search?q=${encodeURIComponent(q)}&format=rss&mkt=es-CO&setlang=es`);
  return items(xml).map(it => {
    let link = limpiar(etiqueta(it, 'link'));
    try { const u = new URL(link); const real = u.searchParams.get('url'); if (real) link = real; } catch {}
    let img = limpiar(etiqueta(it, 'News:Image'));
    if (img && img.startsWith('http')) img = img.replace(/&amp;/g, '&');
    else img = '';
    return {
      titulo: limpiar(etiqueta(it, 'title')),
      url: link,
      medio: limpiar(etiqueta(it, 'News:Source')) || dominio(link),
      fecha: new Date(limpiar(etiqueta(it, 'pubDate')) || Date.now()).toISOString(),
      imagen: img,
      resumen: limpiar(etiqueta(it, 'description')).slice(0, 260)
    };
  });
}

async function google(q) {
  const xml = await traer(`https://news.google.com/rss/search?q=${encodeURIComponent(q + ' when:30d')}&hl=es-419&gl=CO&ceid=CO:es-419`);
  return items(xml).map(it => {
    const medio = limpiar(etiqueta(it, 'source'));
    let titulo = limpiar(etiqueta(it, 'title'));
    if (medio && titulo.endsWith(` - ${medio}`)) titulo = titulo.slice(0, -(medio.length + 3));
    return {
      titulo,
      url: limpiar(etiqueta(it, 'link')),
      medio,
      fecha: new Date(limpiar(etiqueta(it, 'pubDate')) || Date.now()).toISOString(),
      imagen: '',
      resumen: ''
    };
  });
}

function dominio(u) {
  try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; }
}

async function fotoDe(url) {
  if (!url || url.includes('news.google.com')) return '';
  try {
    const html = await traer(url, 9000);
    const m = html.match(/<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)
      || html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i);
    return m ? m[1].replace(/&amp;/g, '&') : '';
  } catch { return ''; }
}

async function youtube(q) {
  // sp=CAI%3D ordena por fecha de subida
  const html = await traer(`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}&sp=CAI%253D&hl=es&gl=CO`);
  const vistos = new Set();
  const out = [];
  for (const m of html.matchAll(/"videoRenderer":\{"videoId":"([\w-]{11})"[\s\S]{0,1500}?"title":\{"runs":\[\{"text":"((?:[^"\\]|\\.)*)"/g)) {
    const id = m[1];
    let titulo;
    try { titulo = JSON.parse(`"${m[2]}"`); } catch { titulo = m[2]; }
    if (vistos.has(id) || !relevante(titulo, 'alimentos')) continue;
    vistos.add(id);
    out.push({ id, titulo });
  }
  return out;
}

async function main() {
  const actual = JSON.parse(await readFile(ARCHIVO, 'utf8'));
  const porClave = new Map(actual.noticias.map(n => [clave(n.titulo), n]));
  let nuevas = 0;

  const lotes = [];
  for (const q of CONSULTAS) {
    lotes.push(bing(q).catch(e => (console.log('bing', q, e.message), [])));
    lotes.push(google(q).catch(e => (console.log('google', q, e.message), [])));
  }
  const encontradas = (await Promise.all(lotes)).flat()
    .filter(n => n.titulo && n.url && relevante(n.titulo, n.resumen));

  for (const n of encontradas) {
    const k = clave(n.titulo);
    if (!k) continue;
    const ya = porClave.get(k);
    if (ya) {
      // completa datos que falten (foto o enlace directo)
      if (!ya.imagen && n.imagen) ya.imagen = n.imagen;
      if (ya.url.includes('news.google.com') && !n.url.includes('news.google.com')) ya.url = n.url;
      continue;
    }
    porClave.set(k, n);
    nuevas++;
  }

  // Buscar foto real (og:image) de las noticias que no la tengan
  const sinFoto = [...porClave.values()].filter(n => !n.imagen && !n.sinFoto).slice(0, 15);
  await Promise.all(sinFoto.map(async n => {
    n.imagen = await fotoDe(n.url);
    if (!n.imagen) n.sinFoto = true;
  }));

  const noticias = [...porClave.values()]
    .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
    .slice(0, MAX_NOTICIAS);

  // Videos reales de YouTube
  let videos = actual.videos || [];
  try {
    const vids = (await Promise.all([
      youtube('APPA derogatoria alimentos'),
      youtube('Áreas de Protección para la Producción de Alimentos')
    ].map(p => p.catch(() => [])))).flat();
    const ids = new Set(videos.map(v => v.id));
    const frescos = vids.filter(v => !ids.has(v.id));
    videos = [...frescos, ...videos].slice(0, MAX_VIDEOS);
    console.log('videos nuevos:', frescos.length);
  } catch (e) { console.log('youtube', e.message); }

  const antes = JSON.stringify({ n: actual.noticias, v: actual.videos });
  const despues = JSON.stringify({ n: noticias, v: videos });
  if (antes === despues) {
    console.log('Sin cambios.');
    return;
  }

  const ahora = new Date(Date.now() - 5 * 3600 * 1000).toISOString().replace('Z', '-05:00').replace(/\.\d+/, '');
  const salida = { actualizado: ahora, fuente: 'robot', noticias, videos };
  await writeFile(ARCHIVO, JSON.stringify(salida, null, 2) + '\n');
  console.log(`Listo: ${nuevas} noticias nuevas, ${noticias.length} en total.`);
}

main().catch(e => { console.error(e); process.exit(1); });
