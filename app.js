const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

const state = {
  pois: [],
  selectedId: null,
  popoverPoiId: null,

  scale: 1,
  tx: 0,
  ty: 0,

  scaleTarget: 1,
  txTarget: 0,
  tyTarget: 0,

  dragging: false,
  dragMoved: false,
  dragStart: { x: 0, y: 0, tx: 0, ty: 0 },
  dragMetrics: { x: 0, y: 0, t: 0 },

  pinch: null,

  velocity: { x: 0, y: 0 },
  inertiaActive: false,
};

const els = {
  viewport: document.getElementById("mapViewport"),
  inner: document.getElementById("mapInner"),
  img: document.getElementById("mapImage"),
  markerLayer: document.getElementById("markerLayer"),
  popover: document.getElementById("popover"),
  popoverTitle: document.getElementById("popoverTitle"),
  popoverMeta: document.getElementById("popoverMeta"),
  popoverImageCanvas: document.getElementById("popoverImageCanvas"),
  popoverDescription: document.getElementById("popoverDescription"),
  popoverFacts: document.getElementById("popoverFacts"),
  btnClosePopover: document.getElementById("btnClosePopover"),
};

function getImageSize() {
  return {
    w: els.img.naturalWidth || els.img.width,
    h: els.img.naturalHeight || els.img.height,
  };
}

function getPanBounds(scale) {
  const rect = els.viewport.getBoundingClientRect();
  const { w, h } = getImageSize();
  const scaledW = w * scale;
  const scaledH = h * scale;

  const edgePadX = rect.width < 760 ? 16 : 24;
  const edgePadY = rect.width < 760 ? 20 : 28;

  let minTx;
  let maxTx;
  if (scaledW <= rect.width) {
    const centered = (rect.width - scaledW) / 2;
    minTx = centered;
    maxTx = centered;
  } else {
    minTx = rect.width - scaledW - edgePadX;
    maxTx = edgePadX;
  }

  let minTy;
  let maxTy;
  if (scaledH <= rect.height) {
    const centered = (rect.height - scaledH) / 2;
    minTy = centered;
    maxTy = centered;
  } else {
    minTy = rect.height - scaledH - edgePadY;
    maxTy = edgePadY;
  }

  return { minTx, maxTx, minTy, maxTy };
}

function clampTargetsToBounds() {
  const bounds = getPanBounds(state.scaleTarget);
  state.txTarget = clamp(state.txTarget, bounds.minTx, bounds.maxTx);
  state.tyTarget = clamp(state.tyTarget, bounds.minTy, bounds.maxTy);
}

function applyTransform() {
  els.inner.style.transform = `translate3d(${state.tx.toFixed(3)}px, ${state.ty.toFixed(3)}px, 0) scale(${state.scale.toFixed(5)})`;
  updateOpenPopoverPosition();
}

function worldFromClient(clientX, clientY, transform = {}) {
  const rect = els.viewport.getBoundingClientRect();
  const tx = transform.tx ?? state.txTarget;
  const ty = transform.ty ?? state.tyTarget;
  const scale = transform.scale ?? state.scaleTarget;

  const x = (clientX - rect.left - tx) / scale;
  const y = (clientY - rect.top - ty) / scale;
  return { x, y, rect };
}

function clientFromWorld(x, y) {
  return {
    x: x * state.scale + state.tx,
    y: y * state.scale + state.ty,
  };
}

function positionPopoverForPoi(poi) {
  if (!poi || els.popover.hidden) return;

  const vpRect = els.viewport.getBoundingClientRect();
  const { w: imgW, h: imgH } = getImageSize();

  const px = (poi.xPct / 100) * imgW;
  const py = (poi.yPct / 100) * imgH;
  const pt = clientFromWorld(px, py);

  const popW = els.popover.offsetWidth || 320;
  const popH = els.popover.offsetHeight || 240;

  els.popover.classList.remove("popover--left", "popover--right", "popover--mobile");

  if (vpRect.width <= 760) {
    const left = Math.max(8, (vpRect.width - popW) / 2);
    const safeBottom = 8;
    const top = Math.max(8, vpRect.height - popH - safeBottom);

    els.popover.classList.add("popover--mobile");
    els.popover.style.left = `${left}px`;
    els.popover.style.top = `${top}px`;
    return;
  }

  let left = pt.x + 20;
  let top = pt.y - popH / 2;

  if (left + popW > vpRect.width - 10) {
    left = pt.x - popW - 20;
    els.popover.classList.add("popover--left");
  } else {
    els.popover.classList.add("popover--right");
  }

  if (left < 10) left = 10;
  if (top < 10) top = 10;
  if (top + popH > vpRect.height - 10) top = vpRect.height - popH - 10;

  els.popover.style.left = `${left}px`;
  els.popover.style.top = `${top}px`;
}

function updateOpenPopoverPosition() {
  if (!state.popoverPoiId) return;
  const poi = state.pois.find((entry) => entry.id === state.popoverPoiId);
  if (poi) positionPopoverForPoi(poi);
}

function closePopover() {
  els.popover.hidden = true;
  state.popoverPoiId = null;
}

function getAnimalLabel(poiId) {
  const map = {
    panda: "Panda",
    orangutan: "Orangutan",
    chimpanzee: "Chimpanzee",
    giraffe: "Giraffe",
    zebra: "Zebra",
    asian_elephant: "Elephant",
    malayan_tiger: "Tiger",
    hippopotamus: "Hippo",
    penguin: "Penguin",
    sun_bear: "Sun bear",
  };
  return map[poiId] || "Animal";
}

function drawRoundedRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawAnimalPreview(poi) {
  const canvas = els.popoverImageCanvas;
  if (!(canvas instanceof HTMLCanvasElement)) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const { w: mapW, h: mapH } = getImageSize();
  if (!mapW || !mapH) return;

  const centerX = (poi.xPct / 100) * mapW;
  const centerY = (poi.yPct / 100) * mapH;

  const sourceW = Math.max(260, Math.min(420, mapW * 0.22));
  const sourceH = sourceW * 0.62;

  const maxSX = Math.max(0, mapW - sourceW);
  const maxSY = Math.max(0, mapH - sourceH);
  const sx = clamp(centerX - sourceW / 2, 0, maxSX);
  const sy = clamp(centerY - sourceH / 2, 0, maxSY);

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  drawRoundedRect(ctx, 0, 0, canvas.width, canvas.height, 16);
  ctx.clip();
  ctx.drawImage(els.img, sx, sy, sourceW, sourceH, 0, 0, canvas.width, canvas.height);

  const glow = ctx.createLinearGradient(0, canvas.height, 0, canvas.height * 0.35);
  glow.addColorStop(0, "rgba(0,0,0,0.45)");
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();

  const pinX = ((centerX - sx) / sourceW) * canvas.width;
  const pinY = ((centerY - sy) / sourceH) * canvas.height;
  ctx.beginPath();
  ctx.fillStyle = "#dd3d2a";
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;
  ctx.arc(pinX, pinY, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
  drawRoundedRect(ctx, 8, canvas.height - 34, 150, 26, 10);
  ctx.fill();

  ctx.fillStyle = "#f4fff8";
  ctx.font = "700 12px Trebuchet MS, Segoe UI, sans-serif";
  ctx.fillText(`${getAnimalLabel(poi.id)} preview`, 16, canvas.height - 17);

  canvas.setAttribute("aria-label", `${poi.name} preview image`);
}

function openPopover(poi) {
  els.popoverTitle.textContent = poi.name;
  els.popoverMeta.textContent = poi.category || "Animal";
  els.popoverDescription.textContent = poi.description || "Animal details coming soon.";
  drawAnimalPreview(poi);

  els.popoverFacts.innerHTML = "";
  if (Array.isArray(poi.details)) {
    for (const detail of poi.details) {
      const li = document.createElement("li");
      li.textContent = detail;
      els.popoverFacts.appendChild(li);
    }
  }

  state.popoverPoiId = poi.id;
  els.popover.hidden = false;
  requestAnimationFrame(() => positionPopoverForPoi(poi));
}

function renderMarkers() {
  els.markerLayer.innerHTML = "";

  for (const poi of state.pois) {
    const marker = document.createElement("button");
    marker.type = "button";
    marker.className = "marker" + (poi.id === state.selectedId ? " marker--selected" : "");
    marker.style.left = `${poi.xPct}%`;
    marker.style.top = `${poi.yPct}%`;
    marker.dataset.id = poi.id;
    marker.setAttribute("aria-label", `Open ${poi.name} details`);

    marker.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
    });

    marker.addEventListener("touchstart", (event) => {
      event.stopPropagation();
    });

    marker.addEventListener("click", (event) => {
      event.stopPropagation();
      state.selectedId = poi.id;
      renderMarkers();
      openPopover(poi);
    });

    els.markerLayer.appendChild(marker);
  }
}

function fitToViewportOnce() {
  const rect = els.viewport.getBoundingClientRect();
  const { w: imgW, h: imgH } = getImageSize();
  if (!imgW || !imgH) return;

  const scale = Math.min(rect.width / imgW, rect.height / imgH);
  state.scaleTarget = clamp(scale, 0.18, 1.2);

  state.txTarget = (rect.width - imgW * state.scaleTarget) / 2;
  state.tyTarget = (rect.height - imgH * state.scaleTarget) / 2;
  clampTargetsToBounds();

  state.scale = state.scaleTarget;
  state.tx = state.txTarget;
  state.ty = state.tyTarget;

  state.velocity.x = 0;
  state.velocity.y = 0;
  state.inertiaActive = false;

  applyTransform();
}

function onWheel(event) {
  event.preventDefault();

  const zoomFactor = event.deltaY < 0 ? 1.09 : 0.91;
  const rect = els.viewport.getBoundingClientRect();
  const cx = event.clientX - rect.left;
  const cy = event.clientY - rect.top;

  const wx = (cx - state.txTarget) / state.scaleTarget;
  const wy = (cy - state.tyTarget) / state.scaleTarget;

  const newScale = clamp(state.scaleTarget * zoomFactor, 0.18, 4.5);
  state.txTarget = cx - wx * newScale;
  state.tyTarget = cy - wy * newScale;
  state.scaleTarget = newScale;

  clampTargetsToBounds();
  state.inertiaActive = false;
}

function onPointerDown(event) {
  if (event.button !== 0) return;
  if (state.pinch) return;
  if (event.target instanceof HTMLElement && event.target.closest(".marker")) return;
  event.preventDefault();

  state.dragging = true;
  state.dragMoved = false;
  state.inertiaActive = false;
  state.velocity.x = 0;
  state.velocity.y = 0;

  els.viewport.classList.add("is-dragging");
  els.viewport.setPointerCapture(event.pointerId);

  state.dragStart = {
    x: event.clientX,
    y: event.clientY,
    tx: state.txTarget,
    ty: state.tyTarget,
  };

  const now = performance.now();
  state.dragMetrics = { x: event.clientX, y: event.clientY, t: now };
}

function onPointerMove(event) {
  if (!state.dragging || state.pinch) return;

  const dx = event.clientX - state.dragStart.x;
  const dy = event.clientY - state.dragStart.y;

  state.txTarget = state.dragStart.tx + dx;
  state.tyTarget = state.dragStart.ty + dy;
  clampTargetsToBounds();

  if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
    state.dragMoved = true;
  }

  const now = performance.now();
  const dt = Math.max(8, now - state.dragMetrics.t);
  const vxFrame = ((event.clientX - state.dragMetrics.x) / dt) * 16.67;
  const vyFrame = ((event.clientY - state.dragMetrics.y) / dt) * 16.67;

  state.velocity.x = state.velocity.x * 0.45 + vxFrame * 0.55;
  state.velocity.y = state.velocity.y * 0.45 + vyFrame * 0.55;

  state.dragMetrics = { x: event.clientX, y: event.clientY, t: now };

  // Keep drag interaction immediate.
  state.tx = state.txTarget;
  state.ty = state.tyTarget;
  state.scale = state.scaleTarget;
  applyTransform();
}

function onPointerUp(event) {
  if (els.viewport.hasPointerCapture(event.pointerId)) {
    els.viewport.releasePointerCapture(event.pointerId);
  }

  els.viewport.classList.remove("is-dragging");

  if (state.dragging) {
    const speed = Math.hypot(state.velocity.x, state.velocity.y);
    state.inertiaActive = speed > 0.2;
  }

  state.dragging = false;
}

function initTouchPinch() {
  els.viewport.addEventListener(
    "touchstart",
    (event) => {
      if (event.touches.length !== 2) return;

      const [a, b] = event.touches;
      state.pinch = {
        startDist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
        startScale: state.scaleTarget,
        centerX: (a.clientX + b.clientX) / 2,
        centerY: (a.clientY + b.clientY) / 2,
      };

      state.dragging = false;
      state.inertiaActive = false;
      state.velocity.x = 0;
      state.velocity.y = 0;
      els.viewport.classList.remove("is-dragging");
    },
    { passive: false }
  );

  els.viewport.addEventListener(
    "touchmove",
    (event) => {
      if (!state.pinch || event.touches.length !== 2) return;

      event.preventDefault();

      const [a, b] = event.touches;
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      const ratio = dist / state.pinch.startDist;
      const newScale = clamp(state.pinch.startScale * ratio, 0.18, 4.5);

      const rect = els.viewport.getBoundingClientRect();
      const cx = state.pinch.centerX - rect.left;
      const cy = state.pinch.centerY - rect.top;

      const wx = (cx - state.txTarget) / state.scaleTarget;
      const wy = (cy - state.tyTarget) / state.scaleTarget;

      state.scaleTarget = newScale;
      state.txTarget = cx - wx * newScale;
      state.tyTarget = cy - wy * newScale;
      clampTargetsToBounds();

      // Keep pinch interaction immediate.
      state.tx = state.txTarget;
      state.ty = state.tyTarget;
      state.scale = state.scaleTarget;
      applyTransform();
    },
    { passive: false }
  );

  els.viewport.addEventListener("touchend", (event) => {
    if (event.touches.length < 2) {
      state.pinch = null;
    }
  });
}

function animate() {
  if (!state.dragging && !state.pinch && state.inertiaActive) {
    state.txTarget += state.velocity.x;
    state.tyTarget += state.velocity.y;

    state.velocity.x *= 0.92;
    state.velocity.y *= 0.92;

    clampTargetsToBounds();

    if (Math.abs(state.velocity.x) < 0.03 && Math.abs(state.velocity.y) < 0.03) {
      state.inertiaActive = false;
      state.velocity.x = 0;
      state.velocity.y = 0;
    }
  }

  const positionLerp = state.dragging || state.pinch ? 0.5 : 0.2;
  const scaleLerp = state.dragging || state.pinch ? 0.5 : 0.18;

  state.tx += (state.txTarget - state.tx) * positionLerp;
  state.ty += (state.tyTarget - state.ty) * positionLerp;
  state.scale += (state.scaleTarget - state.scale) * scaleLerp;

  const delta =
    Math.abs(state.txTarget - state.tx) +
    Math.abs(state.tyTarget - state.ty) +
    Math.abs(state.scaleTarget - state.scale);

  if (delta < 0.0005) {
    state.tx = state.txTarget;
    state.ty = state.tyTarget;
    state.scale = state.scaleTarget;
  }

  applyTransform();
  requestAnimationFrame(animate);
}

async function loadPOIs() {
  const response = await fetch("poi.json", { cache: "no-store" });
  const data = await response.json();
  state.pois = data.slice(0, 10);
}

function bindUI() {
  els.btnClosePopover.addEventListener("click", closePopover);

  els.img.addEventListener("dragstart", (event) => event.preventDefault());
  els.viewport.addEventListener("dragstart", (event) => event.preventDefault());

  els.viewport.addEventListener("wheel", onWheel, { passive: false });
  els.viewport.addEventListener("pointerdown", onPointerDown);
  els.viewport.addEventListener("pointermove", onPointerMove);
  els.viewport.addEventListener("pointerup", onPointerUp);
  els.viewport.addEventListener("pointercancel", onPointerUp);

  els.viewport.addEventListener("click", (event) => {
    if (state.dragMoved) {
      state.dragMoved = false;
      return;
    }

    const target = event.target;
    if (target instanceof HTMLElement && target.classList.contains("marker")) return;
    if (!els.popover.hidden && !els.popover.contains(target)) closePopover();
  });

  document.addEventListener("click", (event) => {
    if (els.popover.hidden) return;

    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (els.popover.contains(target)) return;
    if (target.classList.contains("marker")) return;
    closePopover();
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !els.popover.hidden) closePopover();
  });

  initTouchPinch();

  window.addEventListener("resize", () => {
    fitToViewportOnce();
  });
}

async function boot() {
  bindUI();

  await new Promise((resolve) => {
    if (els.img.complete) return resolve();
    els.img.addEventListener("load", resolve, { once: true });
  });

  els.markerLayer.style.width = `${els.img.naturalWidth}px`;
  els.markerLayer.style.height = `${els.img.naturalHeight}px`;

  await loadPOIs();
  renderMarkers();
  fitToViewportOnce();
  requestAnimationFrame(animate);
}

boot().catch((error) => {
  console.error(error);
});
