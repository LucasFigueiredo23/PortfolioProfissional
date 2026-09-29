/* =========================================================
   PARTE 1: MAPA DE ROTAS
   1. Sorteia pontos de coleta num "bairro".
   2. Monta uma rota com a heurística do vizinho mais próximo.
   3. Melhora a rota com 2-opt (desfaz cruzamentos).
   4. Desenha as rotas, mostra a economia e coloca um
      caminhão para percorrer a rota final.
   ========================================================= */

const LARGURA = 600;
const ALTURA = 420;
const MARGEM = 36;
const DISTANCIA_MINIMA = 34;          // evita pontos colados
const GARAGEM = { x: 64, y: 360 };    // ponto de partida dos caminhões
const VELOCIDADE = 110;               // do caminhão, em unidades do mapa por segundo

const svgNS = "http://www.w3.org/2000/svg";
const svgMapa = document.getElementById("mapa-svg");
const camadaInicial = document.getElementById("camada-inicial");
const camadaOtima = document.getElementById("camada-otima");
const camadaPontos = document.getElementById("camada-pontos");
const camadaCaminhao = document.getElementById("camada-caminhao");
const inputQtd = document.getElementById("qtd");
const saidaQtd = document.getElementById("qtd-valor");
const botaoNovo = document.getElementById("novo");
const ddInicial = document.getElementById("d-inicial");
const ddOtima = document.getElementById("d-otima");
const ddEconomia = document.getElementById("d-economia");

const semMovimento = window.matchMedia("(prefers-reduced-motion: reduce)");

/* ---------- Gerador de números aleatórios com semente ----------
   Com a mesma semente, os mesmos pontos saem sempre.
   Assim a primeira visita mostra sempre o mesmo bairro. */
function criarAleatorio(semente) {
  return function () {
    semente |= 0;
    semente = (semente + 0x6d2b79f5) | 0;
    let t = Math.imul(semente ^ (semente >>> 15), 1 | semente);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- Geometria ---------- */
function distancia(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// Comprimento total da rota, voltando para a garagem no final
function comprimento(pontos, ordem) {
  let total = 0;
  for (let i = 0; i < ordem.length; i++) {
    total += distancia(pontos[ordem[i]], pontos[ordem[(i + 1) % ordem.length]]);
  }
  return total;
}

/* ---------- Sorteio dos pontos ---------- */
function sortearPontos(quantidade, aleatorio) {
  const pontos = [GARAGEM];
  let tentativas = 0;

  while (pontos.length < quantidade + 1 && tentativas < 5000) {
    tentativas++;
    const novo = {
      x: MARGEM + aleatorio() * (LARGURA - MARGEM * 2),
      y: MARGEM + aleatorio() * (ALTURA - MARGEM * 2),
    };
    const muitoPerto = pontos.some((p) => distancia(p, novo) < DISTANCIA_MINIMA);
    if (!muitoPerto) pontos.push(novo);
  }
  return pontos;
}

/* ---------- Algoritmo 1: vizinho mais próximo ----------
   Sai da garagem e sempre vai para o ponto mais perto
   que ainda não foi visitado. Rápido, mas costuma cruzar caminhos. */
function vizinhoMaisProximo(pontos) {
  const ordem = [0];
  const visitado = new Array(pontos.length).fill(false);
  visitado[0] = true;

  for (let passo = 1; passo < pontos.length; passo++) {
    const atual = pontos[ordem[ordem.length - 1]];
    let melhor = -1;
    let menorDistancia = Infinity;

    for (let i = 0; i < pontos.length; i++) {
      if (visitado[i]) continue;
      const d = distancia(atual, pontos[i]);
      if (d < menorDistancia) {
        menorDistancia = d;
        melhor = i;
      }
    }
    visitado[melhor] = true;
    ordem.push(melhor);
  }
  return ordem;
}

/* ---------- Algoritmo 2: 2-opt ----------
   Pega dois trechos da rota e testa inverter o caminho entre eles.
   Se a rota fica menor, mantém. Repete até não melhorar mais. */
function doisOpt(pontos, ordemInicial) {
  const ordem = ordemInicial.slice();
  const n = ordem.length;
  let melhorou = true;

  while (melhorou) {
    melhorou = false;
    for (let i = 1; i < n - 1; i++) {
      for (let k = i + 1; k < n; k++) {
        const a = pontos[ordem[i - 1]];
        const b = pontos[ordem[i]];
        const c = pontos[ordem[k]];
        const d = pontos[ordem[(k + 1) % n]];

        const antes = distancia(a, b) + distancia(c, d);
        const depois = distancia(a, c) + distancia(b, d);

        if (depois < antes - 1e-9) {
          ordem.splice(i, k - i + 1, ...ordem.slice(i, k + 1).reverse());
          melhorou = true;
        }
      }
    }
  }
  return ordem;
}

/* ---------- Desenho ---------- */
function criar(tag, atributos) {
  const el = document.createElementNS(svgNS, tag);
  for (const [nome, valor] of Object.entries(atributos)) el.setAttribute(nome, valor);
  return el;
}

function caminhoSVG(pontos, ordem) {
  const partes = ordem.map((indice, i) => {
    const p = pontos[indice];
    return `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
  });
  return partes.join(" ") + " Z";
}

// Guarda o elemento <circle> de cada ponto, para acender quando o caminhão passa
let circulos = [];

function desenharPontos(pontos) {
  camadaPontos.replaceChildren();
  circulos = [];
  pontos.forEach((p, i) => {
    if (i === 0) {
      camadaPontos.append(criar("rect", { class: "deposito", x: p.x - 9, y: p.y - 9, width: 18, height: 18, rx: 4 }));
      const rotulo = criar("text", { class: "rotulo", x: p.x + 16, y: p.y + 26 });
      rotulo.textContent = "garagem";
      camadaPontos.append(rotulo);
      circulos.push(null);
    } else {
      const c = criar("circle", { class: "ponto", cx: p.x, cy: p.y, r: 5 });
      camadaPontos.append(c);
      circulos.push(c);
    }
  });
}

// Anima uma linha "se desenhando" do começo ao fim
function animarLinha(caminho, duracao) {
  if (semMovimento.matches) return;
  caminho.setAttribute("pathLength", "1");
  caminho.style.strokeDasharray = "1";
  caminho.style.strokeDashoffset = "1";
  caminho.getBoundingClientRect(); // força o navegador a aplicar o estado inicial
  caminho.style.transition = `stroke-dashoffset ${duracao}ms cubic-bezier(0.65, 0, 0.35, 1)`;
  caminho.style.strokeDashoffset = "0";
}

/* ---------- Caminhão percorrendo a rota ----------
   A rota vira uma lista de trechos. A cada quadro, calculamos
   em que ponto da rota o caminhão está pela distância percorrida. */
let caminhao = null;       // dados do caminhão atual
let quadroAnimacao = null; // id do requestAnimationFrame
let mapaVisivel = true;    // pausa quando o mapa sai da tela

function iniciarCaminhao(pontos, ordem) {
  pararCaminhao();
  if (semMovimento.matches) return;

  const trechos = [];
  let acumulado = 0;
  for (let i = 0; i < ordem.length; i++) {
    const de = pontos[ordem[i]];
    const para = pontos[ordem[(i + 1) % ordem.length]];
    const tamanho = distancia(de, para);
    trechos.push({ de, para, inicio: acumulado, tamanho, destino: ordem[(i + 1) % ordem.length] });
    acumulado += tamanho;
  }

  const rastro = criar("circle", { class: "caminhao-rastro", r: 16 });
  const corpo = criar("circle", { class: "caminhao", r: 8 });
  camadaCaminhao.replaceChildren(rastro, corpo);

  caminhao = { trechos, total: acumulado, percorrido: 0, ultimoTempo: null, rastro, corpo };
  quadroAnimacao = requestAnimationFrame(moverCaminhao);
}

function moverCaminhao(tempo) {
  if (!caminhao) return;
  if (caminhao.ultimoTempo === null || !mapaVisivel) caminhao.ultimoTempo = tempo;

  const delta = Math.min((tempo - caminhao.ultimoTempo) / 1000, 0.1);
  caminhao.ultimoTempo = tempo;
  caminhao.percorrido += VELOCIDADE * delta;

  // Deu a volta completa: apaga os pontos e recomeça
  if (caminhao.percorrido >= caminhao.total) {
    caminhao.percorrido -= caminhao.total;
    circulos.forEach((c) => c && c.classList.remove("visitado"));
  }

  // Descobre em qual trecho o caminhão está e interpola a posição
  const trecho = caminhao.trechos.find((t) => caminhao.percorrido < t.inicio + t.tamanho) || caminhao.trechos.at(-1);
  const fracao = trecho.tamanho ? (caminhao.percorrido - trecho.inicio) / trecho.tamanho : 0;
  const x = trecho.de.x + (trecho.para.x - trecho.de.x) * fracao;
  const y = trecho.de.y + (trecho.para.y - trecho.de.y) * fracao;

  caminhao.corpo.setAttribute("cx", x.toFixed(1));
  caminhao.corpo.setAttribute("cy", y.toFixed(1));
  caminhao.rastro.setAttribute("cx", x.toFixed(1));
  caminhao.rastro.setAttribute("cy", y.toFixed(1));

  // Acende o ponto de coleta quando o caminhão chega nele
  if (fracao > 0.97 && circulos[trecho.destino]) circulos[trecho.destino].classList.add("visitado");

  quadroAnimacao = requestAnimationFrame(moverCaminhao);
}

function pararCaminhao() {
  if (quadroAnimacao) cancelAnimationFrame(quadroAnimacao);
  quadroAnimacao = null;
  caminhao = null;
  camadaCaminhao.replaceChildren();
}

// Economiza bateria: o caminhão só anda quando o mapa está na tela
new IntersectionObserver(([entrada]) => {
  mapaVisivel = entrada.isIntersecting;
}).observe(svgMapa);

/* ---------- Números na tela ---------- */
const formatoNumero = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const formatoPercentual = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

function escrever(dd, texto) {
  dd.textContent = texto;
  dd.classList.remove("atualizou");
  void dd.offsetWidth; // reinicia a animação
  dd.classList.add("atualizou");
}

function mostrarNumeros(inicial, otima) {
  escrever(ddInicial, `${formatoNumero.format(inicial)} u`);
  if (otima === null) {
    ddOtima.textContent = "calculando…";
    ddEconomia.textContent = "–";
    return;
  }
  const economia = ((inicial - otima) / inicial) * 100;
  escrever(ddOtima, `${formatoNumero.format(otima)} u`);
  escrever(ddEconomia, economia < 0.05 ? "já estava ótima" : `−${formatoPercentual.format(economia)}%`);
}

/* ---------- Fluxo principal ---------- */
let execucao = 0; // evita conflito se o usuário mexer rápido nos controles

function simular(semente) {
  const minhaExecucao = ++execucao;
  const quantidade = Number(inputQtd.value);
  const pontos = sortearPontos(quantidade, criarAleatorio(semente));

  const ordemInicial = vizinhoMaisProximo(pontos);
  const ordemOtima = doisOpt(pontos, ordemInicial);
  const compInicial = comprimento(pontos, ordemInicial);
  const compOtima = comprimento(pontos, ordemOtima);

  pararCaminhao();
  camadaOtima.replaceChildren();
  camadaInicial.replaceChildren();
  desenharPontos(pontos);

  // 1º: rota ingênua, tracejada
  camadaInicial.append(criar("path", { class: "rota-inicial", d: caminhoSVG(pontos, ordemInicial) }));
  mostrarNumeros(compInicial, null);

  // 2º: rota otimizada se desenha por cima
  const espera = semMovimento.matches ? 0 : 450;
  const duracao = semMovimento.matches ? 0 : 1500;

  setTimeout(() => {
    if (minhaExecucao !== execucao) return;
    const linhaOtima = criar("path", { class: "rota-otima", d: caminhoSVG(pontos, ordemOtima) });
    camadaOtima.append(linhaOtima);
    animarLinha(linhaOtima, duracao);

    // 3º: números finais e o caminhão sai da garagem
    setTimeout(() => {
      if (minhaExecucao !== execucao) return;
      mostrarNumeros(compInicial, compOtima);
      iniciarCaminhao(pontos, ordemOtima);
    }, duracao);
  }, espera);
}

let sementeAtual = 20261129; // semente fixa da primeira visita

// Espera o usuário parar de arrastar o controle antes de recalcular
let esperaControle = null;
inputQtd.addEventListener("input", () => {
  saidaQtd.value = inputQtd.value;
  clearTimeout(esperaControle);
  esperaControle = setTimeout(() => simular(sementeAtual), 180);
});

botaoNovo.addEventListener("click", () => {
  sementeAtual = Math.floor(Math.random() * 1e9);
  simular(sementeAtual);
});

simular(sementeAtual);


/* =========================================================
   PARTE 2: DETALHES DA PÁGINA
   ========================================================= */

// Menu ganha uma linha embaixo quando a página rola
const topo = document.querySelector(".topo");
const atualizarTopo = () => topo.classList.toggle("rolou", window.scrollY > 8);
window.addEventListener("scroll", atualizarTopo, { passive: true });
atualizarTopo();

// Destaca no menu a seção que está na tela
const linksMenu = document.querySelectorAll(".topo ul a");
const observadorMenu = new IntersectionObserver(
  (entradas) => {
    entradas.forEach((entrada) => {
      if (!entrada.isIntersecting) return;
      linksMenu.forEach((link) => {
        const ativo = link.getAttribute("href") === `#${entrada.target.id}`;
        link.classList.toggle("ativo", ativo);
        if (ativo) link.setAttribute("aria-current", "true");
        else link.removeAttribute("aria-current");
      });
    });
  },
  { rootMargin: "-45% 0px -50% 0px" }
);
document.querySelectorAll("main section[id]").forEach((secao) => observadorMenu.observe(secao));

// Revela títulos e blocos com suavidade ao rolar a página
if (!semMovimento.matches) {
  const alvos = document.querySelectorAll(".secao h2, .destaque, .indice, .stack, .sobre, .contato-email");
  const observadorRevelar = new IntersectionObserver(
    (entradas, obs) => {
      entradas.forEach((entrada) => {
        if (entrada.isIntersecting) {
          entrada.target.classList.add("visivel");
          obs.unobserve(entrada.target);
        }
      });
    },
    { threshold: 0.12 }
  );
  alvos.forEach((alvo) => {
    alvo.classList.add("revelar");
    observadorRevelar.observe(alvo);
  });
}

// Botão de tema: alterna escuro/claro e lembra a escolha
const botaoTema = document.getElementById("tema");

function aplicarTema(tema) {
  const raiz = document.documentElement;
  if (tema === "light") raiz.dataset.theme = "light";
  else raiz.dataset.theme = "dark";
  botaoTema.setAttribute("aria-label", tema === "light" ? "Usar tema escuro" : "Usar tema claro");
}

aplicarTema(document.documentElement.dataset.theme === "light" ? "light" : "dark");

botaoTema.addEventListener("click", () => {
  const novo = document.documentElement.dataset.theme === "light" ? "dark" : "light";
  aplicarTema(novo);
  try { localStorage.setItem("tema", novo); } catch (e) { /* navegador sem armazenamento: tudo bem */ }
});
