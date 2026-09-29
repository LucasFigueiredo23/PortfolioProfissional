/* =========================================================
   MAPA DE ROTAS
   1. Sorteia pontos de coleta num "bairro".
   2. Monta uma rota com a heurística do vizinho mais próximo.
   3. Melhora a rota com 2-opt (desfaz cruzamentos).
   4. Desenha as duas rotas e mostra quanto foi economizado.
   ========================================================= */

const LARGURA = 600;
const ALTURA = 420;
const MARGEM = 36;
const DISTANCIA_MINIMA = 34;          // evita pontos colados
const GARAGEM = { x: 64, y: 360 };    // ponto de partida dos caminhões

const svgNS = "http://www.w3.org/2000/svg";
const camadaInicial = document.getElementById("camada-inicial");
const camadaOtima = document.getElementById("camada-otima");
const camadaPontos = document.getElementById("camada-pontos");
const inputQtd = document.getElementById("qtd");
const saidaQtd = document.getElementById("qtd-valor");
const botaoNovo = document.getElementById("novo");
const ddInicial = document.getElementById("d-inicial");
const ddOtima = document.getElementById("d-otima");
const ddEconomia = document.getElementById("d-economia");

const semMovimento = window.matchMedia("(prefers-reduced-motion: reduce)");

/* ---------- Gerador de números aleatórios com semente ----------
   Com a mesma semente, os mesmos pontos saem sempre.
   Assim a primeira visita mostra sempre um bairro "bonito". */
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
    const atual = pontos[ordem[i]];
    const proximo = pontos[ordem[(i + 1) % ordem.length]];
    total += distancia(atual, proximo);
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
          // inverte o trecho entre i e k
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

function desenharPontos(pontos) {
  camadaPontos.replaceChildren();
  pontos.forEach((p, i) => {
    if (i === 0) {
      camadaPontos.append(criar("rect", { class: "deposito", x: p.x - 8, y: p.y - 8, width: 16, height: 16, rx: 3 }));
      const rotulo = criar("text", { class: "rotulo", x: p.x + 14, y: p.y + 24 });
      rotulo.textContent = "garagem";
      camadaPontos.append(rotulo);
    } else {
      camadaPontos.append(criar("circle", { class: "ponto", cx: p.x, cy: p.y, r: 5 }));
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
  caminho.style.transition = `stroke-dashoffset ${duracao}ms ease-in-out`;
  caminho.style.strokeDashoffset = "0";
}

/* ---------- Números na tela ---------- */
const formatoNumero = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const formatoPercentual = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

function mostrarNumeros(inicial, otima) {
  ddInicial.textContent = `${formatoNumero.format(inicial)} u`;
  if (otima === null) {
    ddOtima.textContent = "calculando…";
    ddEconomia.textContent = "–";
    return;
  }
  const economia = ((inicial - otima) / inicial) * 100;
  ddOtima.textContent = `${formatoNumero.format(otima)} u`;
  ddEconomia.textContent = economia < 0.05 ? "já estava ótima" : `${formatoPercentual.format(economia)}%`;
}

/* ---------- Fluxo principal ---------- */
let execucao = 0; // evita conflito se o botão for clicado várias vezes seguidas

function simular(semente) {
  const minhaExecucao = ++execucao;
  const quantidade = Number(inputQtd.value);
  const pontos = sortearPontos(quantidade, criarAleatorio(semente));

  const ordemInicial = vizinhoMaisProximo(pontos);
  const ordemOtima = doisOpt(pontos, ordemInicial);
  const compInicial = comprimento(pontos, ordemInicial);
  const compOtima = comprimento(pontos, ordemOtima);

  camadaOtima.replaceChildren();
  camadaInicial.replaceChildren();
  desenharPontos(pontos);

  // Rota ingênua aparece primeiro, tracejada
  const linhaInicial = criar("path", { class: "rota-inicial", d: caminhoSVG(pontos, ordemInicial) });
  camadaInicial.append(linhaInicial);
  mostrarNumeros(compInicial, null);

  // Depois a rota otimizada se desenha por cima
  const espera = semMovimento.matches ? 0 : 500;
  setTimeout(() => {
    if (minhaExecucao !== execucao) return;
    const linhaOtima = criar("path", { class: "rota-otima", d: caminhoSVG(pontos, ordemOtima) });
    camadaOtima.append(linhaOtima);
    animarLinha(linhaOtima, 1600);

    setTimeout(() => {
      if (minhaExecucao !== execucao) return;
      mostrarNumeros(compInicial, compOtima);
    }, semMovimento.matches ? 0 : 1600);
  }, espera);
}

/* ---------- Controles ---------- */
let sementeAtual = 20261129; // semente fixa da primeira visita

inputQtd.addEventListener("input", () => {
  saidaQtd.value = inputQtd.value;
  simular(sementeAtual);
});

botaoNovo.addEventListener("click", () => {
  sementeAtual = Math.floor(Math.random() * 1e9);
  simular(sementeAtual);
});

simular(sementeAtual);
