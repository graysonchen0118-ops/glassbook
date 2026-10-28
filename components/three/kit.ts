import * as THREE from "three";

// Shared by the scene: size follows the container, capped pixel ratio, paused when off screen
// or when the tab is hidden, and everything disposed on unmount.
export interface Stage {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  small: boolean;
  reduce: boolean;
  size: () => { w: number; h: number };
  onResize: (fn: (w: number, h: number) => void) => void;
  loop: (fn: (dt: number, t: number) => void) => void;
  dispose: () => void;
}

export function mount(el: HTMLElement): Stage | null {
  let renderer: THREE.WebGLRenderer;
  let soft = false;
  try {
    const probe = document.createElement("canvas").getContext("webgl2");
    const info = probe?.getExtension("WEBGL_debug_renderer_info");
    const name = info && probe ? String(probe.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "";
    soft = /swiftshader|llvmpipe|software/i.test(name);
    probe?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    soft = false;
  }
  try {
    renderer = new THREE.WebGLRenderer({ antialias: !soft, alpha: true, powerPreference: "high-performance" });
  } catch {
    return null;
  }
  const small = window.innerWidth < 768;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  renderer.setPixelRatio(soft ? 1 : Math.min(window.devicePixelRatio || 1, small ? 1.25 : 1.5));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.domElement.style.display = "block";
  el.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  let w = Math.max(1, el.clientWidth);
  let h = Math.max(1, el.clientHeight);
  renderer.setSize(w, h, false);
  const resizers: ((w: number, h: number) => void)[] = [];
  const ro = new ResizeObserver(() => {
    const nw = Math.max(1, el.clientWidth);
    const nh = Math.max(1, el.clientHeight);
    if (nw === w && nh === h) return;
    w = nw;
    h = nh;
    renderer.setSize(w, h, false);
    resizers.forEach((f) => f(w, h));
  });
  ro.observe(el);

  let raf = 0;
  let prev = performance.now();
  const t0 = prev;
  let fn: ((dt: number, t: number) => void) | null = null;
  let frames = 0;
  let fpsAt = prev;
  const tick = () => {
    raf = requestAnimationFrame(tick);
    const now = performance.now();
    const dt = Math.min((now - prev) / 1000, 0.25);
    prev = now;
    if (document.visibilityState === "hidden") return;
    fn?.(dt, (now - t0) / 1000);
    frames++;
    if (now - fpsAt > 1000) {
      (window as unknown as { __fps?: number }).__fps = Math.round((frames * 1000) / (now - fpsAt));
      frames = 0;
      fpsAt = now;
    }
  };
  raf = requestAnimationFrame(tick);

  return {
    renderer,
    scene,
    small,
    reduce,
    size: () => ({ w, h }),
    onResize: (f) => resizers.push(f),
    loop: (f) => (fn = f),
    dispose: () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        const all = Array.isArray(mat) ? mat : mat ? [mat] : [];
        all.forEach((x) => {
          const map = (x as THREE.MeshBasicMaterial).map;
          map?.dispose();
          x.dispose();
        });
      });
      renderer.dispose();
      renderer.forceContextLoss();
      if (renderer.domElement.parentNode === el) el.removeChild(renderer.domElement);
    },
  };
}

export const cssVar = (name: string, fallback: string) => {
  if (typeof window === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
};

export const damp = (a: number, b: number, k: number, dt: number) => a + (b - a) * (1 - Math.exp(-k * dt));

let shadowTex: THREE.CanvasTexture | null = null;
/** contact shadow: a plane with a radial gradient, far cheaper than a shadow map */
export function softShadow(w: number, d: number, opacity = 0.35) {
  if (!shadowTex) {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d")!;
    const r = g.createRadialGradient(64, 64, 6, 64, 64, 64);
    r.addColorStop(0, "rgba(20,22,40,1)");
    r.addColorStop(0.55, "rgba(20,22,40,0.45)");
    r.addColorStop(1, "rgba(20,22,40,0)");
    g.fillStyle = r;
    g.fillRect(0, 0, 128, 128);
    shadowTex = new THREE.CanvasTexture(c);
  }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, opacity, depthWrite: false }));
  m.renderOrder = 1;
  return m;
}

/** a crisp text label texture for signs and price tags inside the scene */
export function labelTexture(text: string, o: { bg: string; color: string; w?: number; h?: number; size?: number; radius?: number; border?: string }) {
  const W = o.w ?? 256;
  const H = o.h ?? 96;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  const r = o.radius ?? H * 0.26;
  g.beginPath();
  g.moveTo(r, 0);
  g.arcTo(W, 0, W, H, r);
  g.arcTo(W, H, 0, H, r);
  g.arcTo(0, H, 0, 0, r);
  g.arcTo(0, 0, W, 0, r);
  g.closePath();
  g.fillStyle = o.bg;
  g.fill();
  if (o.border) {
    g.lineWidth = 6;
    g.strokeStyle = o.border;
    g.stroke();
  }
  const fam = getComputedStyle(document.body).fontFamily || "sans-serif";
  g.font = `800 ${o.size ?? 46}px ${fam}`;
  g.fillStyle = o.color;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, W / 2, H / 2 + 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
