import * as THREE from "three";
import { MindARThree } from "./vendor/mindar-image-three.prod.js";

const STORAGE_KEY = "safarilens_collected_cards";

const state = {
  cards: [],
  activeCard: null,
  factIndex: 0,
  started: false,
  mindar: null,
};

const els = {
  arContainer: document.getElementById("arContainer"),
  scanStatus: document.getElementById("scanStatus"),
  cardTitle: document.getElementById("cardTitle"),
  cardCategory: document.getElementById("cardCategory"),
  cardFact: document.getElementById("cardFact"),
  collectStatus: document.getElementById("collectStatus"),
  btnStart: document.getElementById("btnStart"),
  btnPrev: document.getElementById("btnPrev"),
  btnNext: document.getElementById("btnNext"),
  btnCollect: document.getElementById("btnCollect"),
};

function setButtonsState() {
  const hasCard = Boolean(state.activeCard);
  const factCount = state.activeCard?.facts?.length ?? 0;
  els.btnPrev.disabled = !hasCard || factCount <= 1;
  els.btnNext.disabled = !hasCard || factCount <= 1;
  els.btnCollect.disabled = !hasCard;
}

function renderFact() {
  const facts = state.activeCard?.facts ?? [];
  if (!facts.length) {
    els.cardFact.textContent = "No facts found for this card yet.";
    return;
  }
  els.cardFact.textContent = facts[state.factIndex];
}

function showCard(card) {
  state.activeCard = card;
  state.factIndex = 0;
  els.cardTitle.textContent = card.name;
  els.cardCategory.textContent = card.category;
  els.scanStatus.textContent = "Target detected. Move slowly to keep tracking stable.";
  renderFact();
  setButtonsState();
}

function clearCard() {
  state.activeCard = null;
  state.factIndex = 0;
  els.cardTitle.textContent = "No target detected";
  els.cardCategory.textContent = "Keep the card in frame";
  els.cardFact.textContent = "When a target is detected, animal facts will appear here.";
  els.scanStatus.textContent = "Scanner running. Point at a supported scan card.";
  setButtonsState();
}

function loadCollectedSet() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

function saveCollectedSet(set) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(set)));
}

function flashCollectStatus(message, variant = "ok") {
  els.collectStatus.classList.remove("scanPanel__collect--ok", "scanPanel__collect--err");
  els.collectStatus.classList.add(variant === "ok" ? "scanPanel__collect--ok" : "scanPanel__collect--err");
  els.collectStatus.textContent = message;
}

function bindPanelControls() {
  els.btnPrev.addEventListener("click", () => {
    const facts = state.activeCard?.facts ?? [];
    if (facts.length <= 1) return;
    state.factIndex = (state.factIndex - 1 + facts.length) % facts.length;
    renderFact();
  });

  els.btnNext.addEventListener("click", () => {
    const facts = state.activeCard?.facts ?? [];
    if (facts.length <= 1) return;
    state.factIndex = (state.factIndex + 1) % facts.length;
    renderFact();
  });

  els.btnCollect.addEventListener("click", () => {
    if (!state.activeCard) return;
    const collected = loadCollectedSet();
    collected.add(state.activeCard.id);
    saveCollectedSet(collected);
    flashCollectStatus(`Collected ${state.activeCard.name} (${collected.size} total).`);
  });
}

async function startScanner() {
  if (state.started) return;
  state.started = true;
  els.btnStart.disabled = true;
  els.btnStart.textContent = "Starting...";
  els.scanStatus.textContent = "Initializing camera and scanner...";
  els.collectStatus.textContent = "";

  try {
    const cardsRes = await fetch("./data/cards.json", { cache: "no-store" });
    if (!cardsRes.ok) throw new Error("Failed to load scan card data.");
    const cardsPayload = await cardsRes.json();
    state.cards = cardsPayload.cards ?? [];
    if (!state.cards.length) throw new Error("No scan cards configured.");

    const targetFile = "./targets/cards.mind";
    const targetCheck = await fetch(targetFile, { method: "HEAD" });
    if (!targetCheck.ok) throw new Error("Missing scan target file.");

    const mindar = new MindARThree({
      container: els.arContainer,
      imageTargetSrc: targetFile,
      maxTrack: 1,
      uiLoading: false,
      uiScanning: false,
      uiError: false,
    });
    state.mindar = mindar;

    const { renderer, scene, camera } = mindar;
    renderer.setClearColor(0x000000, 0);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x2a2a2a, 1.2));
    const directional = new THREE.DirectionalLight(0xffffff, 1);
    directional.position.set(1, 2, 0.6);
    scene.add(directional);

    const rings = [];
    for (const card of state.cards) {
      const anchor = mindar.addAnchor(card.targetIndex);

      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.22, 0.33, 48),
        new THREE.MeshBasicMaterial({
          color: 0x2ddf86,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.95,
        })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.visible = false;
      anchor.group.add(ring);
      rings.push(ring);

      anchor.onTargetFound = () => {
        ring.visible = true;
        showCard(card);
      };

      anchor.onTargetLost = () => {
        ring.visible = false;
        if (state.activeCard?.id === card.id) clearCard();
      };
    }

    await mindar.start();
    clearCard();
    els.btnStart.textContent = "Scanner Active";

    renderer.setAnimationLoop(() => {
      for (const ring of rings) ring.rotation.z += 0.02;
      renderer.render(scene, camera);
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    state.started = false;
    els.btnStart.disabled = false;
    els.btnStart.textContent = "Retry Start";
    els.scanStatus.textContent = "Scanner failed to start.";
    flashCollectStatus(message, "err");
  }
}

function setupStopLifecycle() {
  async function stopScanner() {
    if (!state.mindar) return;
    try {
      await state.mindar.stop();
      state.mindar.renderer.setAnimationLoop(null);
    } catch {
      // no-op
    }
  }

  window.addEventListener("pagehide", stopScanner);
  window.addEventListener("beforeunload", stopScanner);
}

function boot() {
  bindPanelControls();
  setupStopLifecycle();
  els.btnStart.addEventListener("click", startScanner);
}

boot();
