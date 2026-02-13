const card = document.getElementById("welcomeCard");
const bg = document.querySelector(".welcome__bg");

if (card && bg) {
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (!prefersReducedMotion) {
    const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

    const onMove = (event) => {
      const rect = card.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width;
      const y = (event.clientY - rect.top) / rect.height;

      const rx = clamp((0.5 - y) * 8, -6, 6);
      const ry = clamp((x - 0.5) * 10, -7, 7);

      card.style.setProperty("--welcome-rx", `${rx.toFixed(2)}deg`);
      card.style.setProperty("--welcome-ry", `${ry.toFixed(2)}deg`);
      card.style.setProperty("--mx", `${(x * 100).toFixed(1)}%`);
      card.style.setProperty("--my", `${(y * 100).toFixed(1)}%`);

      const bgX = clamp((x - 0.5) * 2.2, -1.2, 1.2);
      const bgY = clamp((y - 0.5) * 2.2, -1.2, 1.2);
      bg.style.transform = `scale(1.03) translate3d(${bgX.toFixed(2)}%, ${bgY.toFixed(2)}%, 0)`;
    };

    const reset = () => {
      card.style.setProperty("--welcome-rx", "0deg");
      card.style.setProperty("--welcome-ry", "0deg");
      card.style.setProperty("--mx", "50%");
      card.style.setProperty("--my", "24%");
      bg.style.transform = "scale(1.03) translate3d(0, 0, 0)";
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    card.addEventListener("pointerleave", reset, { passive: true });
  }
}
