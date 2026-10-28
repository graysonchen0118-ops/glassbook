"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { currentBoard, currentFill, currentOpen, currentPause, currentView, type Pulse, type View } from "@/lib/bus";
import { photo } from "@/lib/photos";
import { cssVar, damp, labelTexture, mount, softShadow } from "./kit";

// A night stadium. In front of the near stand stands the glass box: the betting contract.
// Every stake flies in through the slot on top and lands in one of three coin columns (home,
// draw, away of the market in focus). A gold line across the box is the market's ceiling.
// The slot shuts at kickoff. The scoreboard is the sports feed: when it signs a result,
// a beam runs from the board to the box. The server has no beam of its own.

type V3 = [number, number, number];
const CAM: Record<View, { p: V3; t: V3; ox: number; oy: number }> = {
  book: { p: [11.5, 7.6, 19], t: [2.2, 1.4, -1.2], ox: -0.24, oy: 0.04 },
  bets: { p: [12.5, 6.4, 15.5], t: [5.6, 1.9, 4.2], ox: -0.3, oy: 0.2 },
  results: { p: [-4.5, 6.4, 13], t: [-1.5, 4.6, -8], ox: -0.27, oy: 0.17 },
  house: { p: [15, 8.6, 18.5], t: [5.6, 1.9, 4.2], ox: -0.3, oy: 0.2 },
};

const VAULT = new THREE.Vector3(5.6, 0, 4.2);
const VAULT_T = new THREE.Vector3(3.2, 2.2, 0.5);
const VAULT_P = new THREE.Vector3(9.5, 7.5, 19);
const VW = 3.3;
const VH = 3.1;
const VD = 2.1;
const LANE_X = [-1.0, 0, 1.0];
const COIN_H = 0.085;
const MAX_COINS = 26;
const CEIL_Y = 0.32 + MAX_COINS * COIN_H;

function pitchTexture() {
  const W = 1024;
  const H = 664;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  for (let i = 0; i < 12; i++) {
    g.fillStyle = i % 2 ? "#1f6b3f" : "#237645";
    g.fillRect((i * W) / 12, 0, W / 12 + 1, H);
  }
  g.strokeStyle = "rgba(255,255,255,0.85)";
  g.lineWidth = 5;
  const m = 34;
  g.strokeRect(m, m, W - 2 * m, H - 2 * m);
  g.beginPath();
  g.moveTo(W / 2, m);
  g.lineTo(W / 2, H - m);
  g.stroke();
  g.beginPath();
  g.arc(W / 2, H / 2, 86, 0, Math.PI * 2);
  g.stroke();
  for (const x of [m, W - m]) {
    const dir = x === m ? 1 : -1;
    g.strokeRect(Math.min(x, x + dir * 160), H / 2 - 190, 160, 380);
    g.strokeRect(Math.min(x, x + dir * 56), H / 2 - 90, 56, 180);
  }
  g.fillStyle = "#fff";
  g.beginPath();
  g.arc(W / 2, H / 2, 6, 0, Math.PI * 2);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function glowTexture(rgb: string) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const r = g.createRadialGradient(64, 64, 2, 64, 64, 64);
  r.addColorStop(0, `rgba(${rgb},1)`);
  r.addColorStop(0.25, `rgba(${rgb},0.55)`);
  r.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

function drawBoard(c: HTMLCanvasElement, b: { top: string; mid: string; low: string } | null, accent: string) {
  const g = c.getContext("2d")!;
  const W = c.width;
  const H = c.height;
  g.fillStyle = "#05080f";
  g.fillRect(0, 0, W, H);
  g.strokeStyle = "rgba(63,216,194,0.5)";
  g.lineWidth = 6;
  g.strokeRect(8, 8, W - 16, H - 16);
  const fam = getComputedStyle(document.body).fontFamily || "sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillStyle = "#dfe7f7";
  g.font = `700 54px ${fam}`;
  g.fillText(b?.top ?? "GLASSBOOK", W / 2, 74);
  g.fillStyle = "#f2c15a";
  g.font = `800 132px ${fam}`;
  g.fillText(b?.mid ?? "--", W / 2, 200);
  g.fillStyle = accent;
  g.font = `700 46px ${fam}`;
  g.fillText(b?.low ?? "", W / 2, 318);
}

export default function Backdrop() {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const st = mount(el);
    if (!st) return;
    const { scene, small, reduce } = st;
    const accentHex = cssVar("--accent", "#3fd8c2");
    const accent = new THREE.Color(accentHex);
    const gold = new THREE.Color(cssVar("--support", "#f2c15a"));
    const bad = new THREE.Color(cssVar("--bad", "#fb7185"));
    const warn = new THREE.Color(cssVar("--warn", "#f5a524"));
    const okC = new THREE.Color(cssVar("--ok", "#34d399"));
    scene.fog = new THREE.Fog(0x070b16, 26, 62);

    const cam = new THREE.PerspectiveCamera(36, 1, 0.1, 120);
    scene.add(new THREE.HemisphereLight(0x9fb6e8, 0x0a1020, 1.25));
    const key = new THREE.DirectionalLight(0xeaf2ff, 1.35);
    key.position.set(-6, 14, 10);
    scene.add(key);
    const rim = new THREE.DirectionalLight(accent.clone().lerp(new THREE.Color(0xffffff), 0.4), 0.7);
    rim.position.set(12, 6, -8);
    scene.add(rim);

    const root = new THREE.Group();
    scene.add(root);
    const extra: { dispose: () => void }[] = [];
    const keep = <T extends { dispose: () => void }>(x: T) => {
      extra.push(x);
      return x;
    };

    // ---------- the ground: a floating slab, the pitch on top ----------
    const slabSide = new THREE.MeshLambertMaterial({ color: 0x101a2e });
    const slab = new THREE.Mesh(new THREE.BoxGeometry(30, 0.6, 26), slabSide);
    slab.position.set(0, -0.31, -2.5);
    root.add(slab);
    const under = softShadow(36, 30, 0.5);
    under.position.set(0, -1.6, -2.5);
    root.add(under);
    const pitch = new THREE.Mesh(new THREE.PlaneGeometry(17, 11).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: keep(pitchTexture()) }));
    pitch.position.set(-1.5, 0.01, -4);
    root.add(pitch);
    const apron = new THREE.Mesh(new THREE.PlaneGeometry(20, 13.6).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x184f31 }));
    apron.position.set(-1.5, 0.004, -4);
    root.add(apron);

    // ---------- stands: stepped tiers with a crowd on them ----------
    const tierMat = new THREE.MeshLambertMaterial({ color: 0x1b2640 });
    const tierTop = new THREE.MeshLambertMaterial({ color: 0x24304d });
    const seats: THREE.Vector3[] = [];
    const stand = (cx: number, cz: number, len: number, rotY: number, tiers: number) => {
      const g = new THREE.Group();
      g.position.set(cx, 0, cz);
      g.rotation.y = rotY;
      for (let i = 0; i < tiers; i++) {
        const h = 0.55 + i * 0.55;
        const m = new THREE.Mesh(new THREE.BoxGeometry(len, h, 0.9), [tierMat, tierMat, tierTop, tierMat, tierMat, tierMat]);
        m.position.set(0, h / 2, -i * 0.9);
        g.add(m);
        const n = Math.floor(len / (small ? 0.62 : 0.42));
        for (let k = 0; k < n; k++) {
          const v = new THREE.Vector3(-len / 2 + 0.25 + (k * (len - 0.5)) / Math.max(1, n - 1), h + 0.16, -i * 0.9 + (Math.random() - 0.5) * 0.25);
          g.localToWorld(v);
          seats.push(v);
        }
      }
      // roof
      const roof = new THREE.Mesh(new THREE.BoxGeometry(len + 0.6, 0.12, tiers * 0.9 + 0.6), new THREE.MeshLambertMaterial({ color: 0x2b3756 }));
      roof.position.set(0, 0.55 * tiers + 1.6, -(tiers - 1) * 0.45 - 0.2);
      g.add(roof);
      root.add(g);
      g.updateMatrixWorld(true);
      return g;
    };
    const s1 = stand(-1.5, -11.2, 19, 0, 4);
    const s2 = stand(-11.6, -4, 12.4, Math.PI / 2, 3);
    const s3 = stand(8.6, -4, 12.4, -Math.PI / 2, 3);
    [s1, s2, s3].forEach((g) => g.updateMatrixWorld(true));
    // rebuild seat positions after the stands have their world matrices
    seats.length = 0;
    const fill = (g: THREE.Group, len: number, tiers: number) => {
      for (let i = 0; i < tiers; i++) {
        const h = 0.55 + i * 0.55;
        const n = Math.floor(len / (small ? 0.62 : 0.42));
        for (let k = 0; k < n; k++) {
          const v = new THREE.Vector3(-len / 2 + 0.25 + (k * (len - 0.5)) / Math.max(1, n - 1), h + 0.16, -i * 0.9 + (Math.random() - 0.5) * 0.2);
          seats.push(g.localToWorld(v));
        }
      }
    };
    fill(s1, 19, 4);
    fill(s2, 12.4, 3);
    fill(s3, 12.4, 3);
    const crowdGeo = new THREE.BoxGeometry(0.22, 0.3, 0.2);
    const crowd = new THREE.InstancedMesh(crowdGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), seats.length);
    crowd.frustumCulled = false;
    const tints = [0x3fd8c2, 0xf2c15a, 0xdfe7f7, 0x8b9cc8, 0x2b3a63, 0xe86a6a, 0x5d7bd8];
    const dummy = new THREE.Object3D();
    const crowdPhase = seats.map(() => Math.random() * Math.PI * 2);
    seats.forEach((p, i) => {
      dummy.position.copy(p);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      crowd.setMatrixAt(i, dummy.matrix);
      crowd.setColorAt(i, new THREE.Color(tints[Math.floor(Math.random() * tints.length)]).multiplyScalar(0.55 + Math.random() * 0.45));
    });
    root.add(crowd);

    // ---------- floodlights ----------
    const haloT = keep(glowTexture("255,248,226"));
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x2a3552 });
    const lampMat = new THREE.MeshLambertMaterial({ color: 0xfff6dd, emissive: new THREE.Color(0xfff2cc), emissiveIntensity: 1 });
    const halos: THREE.Sprite[] = [];
    for (const [x, z] of [[-11.2, -10.6], [8.2, -10.6], [-11.2, 3.2], [8.2, 3.2]] as [number, number][]) {
      const pole = new THREE.Mesh(new THREE.BoxGeometry(0.22, 8.4, 0.22), poleMat);
      pole.position.set(x, 4.2, z);
      root.add(pole);
      const head = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.8, 0.18), lampMat);
      head.position.set(x, 8.6, z);
      head.lookAt(-1.5, 0, -4);
      root.add(head);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloT, color: 0xfff3d6, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }));
      halo.position.copy(head.position);
      halo.scale.setScalar(small ? 2.6 : 3.2);
      root.add(halo);
      halos.push(halo);

    }

    // ---------- goals ----------
    const postM = new THREE.MeshLambertMaterial({ color: 0xffffff });
    for (const gx of [-9.6, 6.6]) {
      const g = new THREE.Group();
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 2.4), postM);
      bar.position.set(0, 0.8, 0);
      g.add(bar);
      for (const z of [-1.2, 1.2]) {
        const p = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.8, 0.08), postM);
        p.position.set(0, 0.4, z);
        g.add(p);
      }
      g.position.set(gx, 0, -4);
      root.add(g);
    }
    // a ball near the centre spot
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.16, 20, 14), new THREE.MeshPhongMaterial({ color: 0xffffff, shininess: 60 }));
    ball.position.set(-1.2, 0.16, -3.6);
    root.add(ball);

    // ---------- the scoreboard: the sports feed ----------
    const boardC = document.createElement("canvas");
    boardC.width = 1024;
    boardC.height = 384;
    drawBoard(boardC, currentBoard(), accentHex);
    const boardT = keep(new THREE.CanvasTexture(boardC));
    boardT.colorSpace = THREE.SRGBColorSpace;
    const boardG = new THREE.Group();
    const frame = new THREE.Mesh(new THREE.BoxGeometry(6.6, 2.7, 0.3), new THREE.MeshLambertMaterial({ color: 0x1a2238 }));
    boardG.add(frame);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(6.3, 2.36), new THREE.MeshBasicMaterial({ map: boardT }));
    face.position.z = 0.16;
    boardG.add(face);
    for (const x of [-2.4, 2.4]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 4.6, 0.2), poleMat);
      leg.position.set(x, -3.4, -0.1);
      boardG.add(leg);
    }
    boardG.position.set(-1.5, 6.3, -15.2);
    root.add(boardG);
    const feedDot = new THREE.Sprite(new THREE.SpriteMaterial({ map: keep(glowTexture("63,216,194")), transparent: true, opacity: 0.0, depthWrite: false, blending: THREE.AdditiveBlending }));
    feedDot.position.set(-1.5, 8.0, -15);
    feedDot.scale.setScalar(2.4);
    root.add(feedDot);
    const onBoard = (e: Event) => {
      drawBoard(boardC, (e as CustomEvent).detail, accentHex);
      boardT.needsUpdate = true;
    };
    window.addEventListener("gb:board", onBoard);

    // ---------- LED boards around the pitch, with real photos ----------
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");
    const ledKeys = ["fans_1", "stadium_night_1", "football_action_2"];
    ledKeys.forEach((k, i) => {
      const t = loader.load(photo(k, 640, 120));
      t.colorSpace = THREE.SRGBColorSpace;
      keep(t);
      const led = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 0.62), new THREE.MeshBasicMaterial({ map: t, color: 0xb9c4dc }));
      led.position.set(-7.2 + i * 5.7, 0.36, -10.0);
      root.add(led);
    });

    // ---------- the glass box: the contract ----------
    const vault = new THREE.Group();
    vault.position.copy(VAULT);
    root.add(vault);
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(VW + 0.7, 0.3, VD + 0.7), new THREE.MeshLambertMaterial({ color: 0x1a2440 }));
    plinth.position.y = 0.15;
    vault.add(plinth);
    const plinthGlow = new THREE.Mesh(new THREE.BoxGeometry(VW + 0.74, 0.04, VD + 0.74), new THREE.MeshBasicMaterial({ color: accent }));
    plinthGlow.position.y = 0.31;
    vault.add(plinthGlow);
    const vShadow = softShadow(VW + 2.6, VD + 2.4, 0.55);
    vShadow.position.y = 0.012;
    vault.add(vShadow);
    const glassM = new THREE.MeshPhongMaterial({ color: accent.clone().lerp(new THREE.Color(0xffffff), 0.35), transparent: true, opacity: 0.13, shininess: 120, specular: 0xffffff, depthWrite: false, side: THREE.DoubleSide });
    const glass = new THREE.Mesh(new THREE.BoxGeometry(VW, VH, VD), glassM);
    glass.position.y = 0.32 + VH / 2;
    glass.renderOrder = 3;
    vault.add(glass);
    const edgeM = new THREE.LineBasicMaterial({ color: accent, transparent: true, opacity: 0.95 });
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(VW, VH, VD)), edgeM);
    edges.position.copy(glass.position);
    vault.add(edges);
    // lid with a slot
    const lidM = new THREE.MeshLambertMaterial({ color: 0x2a3a60 });
    const SW = VW * 0.7;
    const SD = 0.34;
    for (const [w, d, x, z] of [[SW + 0.16, 0.08, 0, -SD / 2 - 0.04], [SW + 0.16, 0.08, 0, SD / 2 + 0.04], [0.08, SD, -SW / 2 - 0.04, 0], [0.08, SD, SW / 2 + 0.04, 0]] as [number, number, number, number][]) {
      const rimB = new THREE.Mesh(new THREE.BoxGeometry(w, 0.09, d), lidM);
      rimB.position.set(x, 0.32 + VH + 0.045, z);
      vault.add(rimB);
    }
    const shutterM = new THREE.MeshLambertMaterial({ color: 0x8b9cc8, emissive: new THREE.Color(0x000000) });
    const shutter = new THREE.Mesh(new THREE.BoxGeometry(SW, 0.06, SD), shutterM);
    shutter.position.set(0, 0.32 + VH + 0.05, 0);
    vault.add(shutter);
    const slotGlow = new THREE.Mesh(new THREE.PlaneGeometry(SW, SD).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: gold, transparent: true, opacity: 0.6 }));
    slotGlow.position.set(0, 0.32 + VH + 0.02, 0);
    vault.add(slotGlow);
    const lockTag = new THREE.Sprite(new THREE.SpriteMaterial({ map: keep(labelTexture("BOOK CLOSED", { bg: "#1b2640", color: "#dfe7f7", w: 340, h: 84, size: 40, border: "#8b9cc8" })), transparent: true, opacity: 0, depthWrite: false }));
    lockTag.position.set(0, 0.32 + VH + 0.75, 0);
    lockTag.scale.set(2.0, 0.5, 1);
    vault.add(lockTag);
    const pauseTag = new THREE.Sprite(new THREE.SpriteMaterial({ map: keep(labelTexture("PAUSED", { bg: "#3a2606", color: "#ffd28a", w: 260, h: 84, size: 42, border: "#f5a524" })), transparent: true, opacity: 0, depthWrite: false }));
    pauseTag.position.set(0, 0.32 + VH + 0.75, 0);
    pauseTag.scale.set(1.6, 0.52, 1);
    vault.add(pauseTag);

    // coin columns
    const coinGeo = new THREE.CylinderGeometry(0.34, 0.34, COIN_H * 0.86, 28);
    const coinMat = new THREE.MeshPhongMaterial({ color: gold, emissive: gold.clone().multiplyScalar(0.12), shininess: 90, specular: 0xfff2c4 });
    const stacks = LANE_X.map((x) => {
      const m = new THREE.InstancedMesh(coinGeo, coinMat, MAX_COINS + 4);
      m.frustumCulled = false;
      for (let i = 0; i < MAX_COINS + 4; i++) {
        dummy.position.set(x + (Math.random() - 0.5) * 0.04, 0.32 + COIN_H / 2 + i * COIN_H, (Math.random() - 0.5) * 0.04);
        dummy.rotation.set(0, Math.random() * 3, 0);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        m.setMatrixAt(i, dummy.matrix);
      }
      m.count = 0;
      vault.add(m);
      return { m, shown: 0, want: 0, bump: 0 };
    });
    const laneTags = ["1", "X", "2"].map((t, i) => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: keep(labelTexture(t, { bg: "rgba(5,9,19,0.85)", color: "#f2c15a", w: 96, h: 96, size: 54, radius: 48, border: "#f2c15a" })), transparent: true, depthWrite: false }));
      s.position.set(LANE_X[i], 0.32 + 0.05, VD / 2 + 0.5);
      s.scale.setScalar(0.42);
      vault.add(s);
      return s;
    });
    // the ceiling: a gold line across the box
    const ceilM = new THREE.MeshBasicMaterial({ color: gold, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(VW - 0.06, VD - 0.06).rotateX(-Math.PI / 2), ceilM);
    ceil.position.y = CEIL_Y;
    ceil.renderOrder = 4;
    vault.add(ceil);
    const ceilEdgeM = new THREE.LineBasicMaterial({ color: gold, transparent: true, opacity: 0.9 });
    const ceilEdge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(VW - 0.06, VD - 0.06).rotateX(-Math.PI / 2)), ceilEdgeM);
    ceilEdge.position.y = CEIL_Y;
    vault.add(ceilEdge);
    const ceilTag = new THREE.Sprite(new THREE.SpriteMaterial({ map: keep(labelTexture("CEILING", { bg: "rgba(42,28,0,0.9)", color: "#f2c15a", w: 260, h: 70, size: 36, border: "#f2c15a" })), transparent: true, depthWrite: false }));
    ceilTag.position.set(-VW / 2 - 0.72, CEIL_Y, 0);
    ceilTag.scale.set(1.15, 0.31, 1);
    vault.add(ceilTag);

    // the beam from the scoreboard (the feed) to the box
    const beamM = new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    const from = new THREE.Vector3(-1.5, 7.8, -15);
    const to = VAULT.clone().add(new THREE.Vector3(0, 0.32 + VH + 0.2, 0));
    const len = from.distanceTo(to);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, len, 10, 1, true), beamM);
    beam.position.copy(from).lerp(to, 0.5);
    beam.lookAt(to);
    beam.rotateX(Math.PI / 2);
    root.add(beam);
    const sealM = new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    const seal = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.62, 48).rotateX(-Math.PI / 2), sealM);
    seal.position.copy(to);
    root.add(seal);

    // flying coins
    interface Fly { m: THREE.Mesh; t: number; dur: number; a: THREE.Vector3; b: THREE.Vector3; lane: number; mode: "in" | "bounce" | "out"; on: boolean }
    const flyGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.07, 24);
    const flies: Fly[] = Array.from({ length: 14 }, () => {
      const m = new THREE.Mesh(flyGeo, coinMat);
      m.visible = false;
      root.add(m);
      return { m, t: 0, dur: 1, a: new THREE.Vector3(), b: new THREE.Vector3(), lane: 0, mode: "in" as const, on: false };
    });
    const slotTop = VAULT.clone().add(new THREE.Vector3(0, 0.32 + VH + 0.12, 0));
    const launch = (mode: Fly["mode"], lane = 1) => {
      const f = flies.find((x) => !x.on);
      if (!f) return;
      f.on = true;
      f.t = 0;
      f.mode = mode;
      f.lane = lane;
      if (mode === "out") {
        f.a.copy(slotTop);
        f.b.set(VAULT.x + 4 + Math.random() * 3, 1 + Math.random() * 2, VAULT.z + 6 + Math.random() * 2);
        f.dur = 1.3;
      } else {
        const s = seats[Math.floor(Math.random() * seats.length)];
        f.a.copy(s).add(new THREE.Vector3(0, 0.4, 0));
        f.b.copy(slotTop).add(new THREE.Vector3(LANE_X[lane], 0, 0));
        f.dur = 1.6 + Math.random() * 0.4;
      }
      f.m.visible = true;
    };

    // state pushed by the page
    let v: View = currentView();
    let lanes = currentFill();
    let open = currentOpen();
    let paused = currentPause();
    let lockFlash = 0;
    let refuse = 0;
    let signT = 0;
    let finalT = 0;
    let ceilFlash = 0;
    let slotK = open ? 0 : 1;
    const setLanes = (l: number[]) => {
      lanes = l;
      l.forEach((x, i) => {
        stacks[i].want = Math.round(Math.min(1, x) * MAX_COINS);
        if (x >= 0.999) ceilFlash = Math.max(ceilFlash, 1.2);
      });
    };
    setLanes(lanes);
    stacks.forEach((s) => (s.shown = s.want));

    const onPulse = (e: Event) => {
      const p = (e as CustomEvent).detail as Pulse;
      if (p.kind === "stake") {
        launch("in", p.lane);
        if (p.big) setTimeout(() => launch("in", p.lane), 180);
      } else if (p.kind === "refused") {
        refuse = 1;
        launch("bounce", 1);
      } else if (p.kind === "lock") {
        open = false;
        lockFlash = 3.5;
      } else if (p.kind === "sign") {
        signT = 2.4;
      } else if (p.kind === "final") {
        finalT = 1.8;
        signT = Math.max(signT, 1.4);
      } else if (p.kind === "payout") {
        for (let i = 0; i < 5; i++) setTimeout(() => launch("out"), i * 120);
      } else if (p.kind === "ceiling") {
        ceilFlash = 1.4;
      } else if (p.kind === "pause") {
        paused = p.on;
      } else if (p.kind === "fill") {
        open = p.open;
        setLanes(p.lanes);
        laneTags[1].visible = p.lanes[1] > 0 || true;
      }
    };
    const onView = (e: Event) => (v = (e as CustomEvent).detail as View);
    window.addEventListener("gb:pulse", onPulse);
    window.addEventListener("gb:view", onView);

    let px = 0;
    let py = 0;
    const onMove = (e: PointerEvent) => {
      px = (e.clientX / window.innerWidth - 0.5) * 2;
      py = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener("pointermove", onMove, { passive: true });

    const onResize = (w: number, h: number) => {
      cam.aspect = w / h;
      cam.updateProjectionMatrix();
    };
    st.onResize(onResize);
    const { w: w0, h: h0 } = st.size();
    onResize(w0, h0);

    const camP = new THREE.Vector3(...CAM[v].p);
    const camT = new THREE.Vector3(...CAM[v].t);
    const tmpP = new THREE.Vector3();
    const tmpT = new THREE.Vector3();
    const edgeBase = accent.clone();
    let ox = CAM[v].ox;
    let oy = CAM[v].oy;

    st.loop((dt, t) => {
      const { w, h } = st.size();
      const narrow = w < 900;
      const preset = CAM[v];
      const sy = Math.min(window.scrollY, 1800);
      tmpT.set(...preset.t);
      tmpP.set(...preset.p);
      if (narrow) {
        tmpT.lerp(VAULT_T, 0.55);
        tmpP.lerp(VAULT_P, 0.55);
      }
      const dist = tmpP.distanceTo(tmpT);
      const minDist = w < 560 ? 24 : narrow ? 21 : 0;
      if (dist < minDist) tmpP.sub(tmpT).multiplyScalar(minDist / dist).add(tmpT);
      tmpP.x += px * 1.3;
      tmpP.y += -py * 0.7 + sy * 0.0032;
      tmpT.y += sy * 0.0018;
      tmpP.z -= sy * 0.0016;
      camP.x = damp(camP.x, tmpP.x, 2.0, dt);
      camP.y = damp(camP.y, tmpP.y, 2.0, dt);
      camP.z = damp(camP.z, tmpP.z, 2.0, dt);
      camT.x = damp(camT.x, tmpT.x, 2.2, dt);
      camT.y = damp(camT.y, tmpT.y, 2.2, dt);
      camT.z = damp(camT.z, tmpT.z, 2.2, dt);
      ox = damp(ox, narrow ? 0 : preset.ox, 2.0, dt);
      oy = damp(oy, narrow ? 0.28 : preset.oy, 2.0, dt);
      cam.position.copy(camP);
      cam.lookAt(camT);
      cam.setViewOffset(w, h, w * ox, h * oy, w, h);
      root.rotation.y = reduce ? 0 : Math.sin(t * 0.08) * 0.025;

      // crowd sways a little
      if (!reduce && !small) {
        const k = Math.floor(t * 8) % 4;
        for (let i = k; i < seats.length; i += 4) {
          dummy.position.copy(seats[i]);
          dummy.position.y += Math.max(0, Math.sin(t * 2.2 + crowdPhase[i])) * 0.06;
          dummy.rotation.set(0, 0, 0);
          dummy.scale.setScalar(1);
          dummy.updateMatrix();
          crowd.setMatrixAt(i, dummy.matrix);
        }
        crowd.instanceMatrix.needsUpdate = true;
      }
      halos.forEach((hh, i) => (hh.material.opacity = 0.72 + Math.sin(t * 1.3 + i) * 0.06));

      // coin columns grow towards their target, one coin at a time
      for (const s of stacks) {
        if (s.shown < s.want) s.shown = Math.min(s.want, s.shown + dt * 18);
        else if (s.shown > s.want) s.shown = Math.max(s.want, s.shown - dt * 22);
        s.m.count = Math.max(0, Math.round(s.shown) + Math.round(s.bump));
        s.bump = Math.max(0, s.bump - dt * 0.6);
      }

      // slot: open while the market in focus takes bets
      slotK = damp(slotK, open ? 0 : 1, 5, dt);
      shutter.scale.x = Math.max(0.001, slotK);
      shutter.position.x = -SW / 2 + (SW / 2) * slotK;
      shutter.visible = slotK > 0.01;
      (slotGlow.material as THREE.MeshBasicMaterial).opacity = (1 - slotK) * (0.45 + Math.sin(t * 3) * 0.12);
      shutterM.emissive.copy(warn).multiplyScalar(Math.max(0, lockFlash > 0 ? Math.abs(Math.sin(t * 6)) * 0.35 : 0));
      lockFlash = Math.max(0, lockFlash - dt);
      (lockTag.material as THREE.SpriteMaterial).opacity = damp((lockTag.material as THREE.SpriteMaterial).opacity, !open && !paused ? 1 : 0, 4, dt);
      (pauseTag.material as THREE.SpriteMaterial).opacity = damp((pauseTag.material as THREE.SpriteMaterial).opacity, paused ? 1 : 0, 4, dt);

      // edges: teal at rest, red on a refusal, green on a final result, amber when paused
      refuse = Math.max(0, refuse - dt * 1.2);
      finalT = Math.max(0, finalT - dt);
      const ec = edgeBase.clone();
      if (paused) ec.lerp(warn, 0.85);
      if (finalT > 0) ec.lerp(okC, Math.min(1, finalT));
      if (refuse > 0) ec.lerp(bad, Math.min(1, refuse * 1.3));
      edgeM.color.copy(ec);
      glassM.color.copy(ec.clone().lerp(new THREE.Color(0xffffff), 0.35));
      glassM.opacity = 0.12 + refuse * 0.14 + finalT * 0.05;
      (plinthGlow.material as THREE.MeshBasicMaterial).color.copy(ec);

      // ceiling line
      ceilFlash = Math.max(0, ceilFlash - dt * 0.7);
      const full = lanes.some((x) => x >= 0.999);
      ceilM.color.copy(full ? bad : gold);
      ceilM.opacity = 0.16 + (full ? 0.18 + Math.abs(Math.sin(t * 5)) * 0.2 : 0) + ceilFlash * 0.25;
      ceilEdgeM.color.copy(full ? bad : gold);

      // the feed's beam
      signT = Math.max(0, signT - dt);
      beamM.opacity = Math.min(0.8, signT * 0.7) * (0.75 + Math.sin(t * 14) * 0.25);
      (feedDot.material as THREE.SpriteMaterial).opacity = 0.25 + Math.min(0.75, signT * 0.6) + (v === "results" ? 0.25 : 0);
      sealM.opacity = signT > 0 ? Math.min(1, signT) * 0.9 : 0;
      seal.scale.setScalar(1 + (2.4 - signT) * 0.9);

      // flying coins
      for (const f of flies) {
        if (!f.on) continue;
        f.t += dt / f.dur;
        const k = Math.min(1, f.t);
        if (f.mode === "bounce") {
          const kk = Math.min(1, k * 1.6);
          if (k < 0.62) {
            f.m.position.lerpVectors(f.a, slotTop, kk);
            f.m.position.y += Math.sin(kk * Math.PI) * 3.2;
          } else {
            const q = (k - 0.62) / 0.38;
            f.m.position.set(slotTop.x + q * 2.2, slotTop.y + Math.sin(q * Math.PI) * 1.1 - q * q * 3.2, slotTop.z + q * 1.6);
          }
        } else {
          f.m.position.lerpVectors(f.a, f.b, k);
          f.m.position.y += Math.sin(k * Math.PI) * (f.mode === "out" ? 2 : 3.6);
        }
        f.m.rotation.x += dt * 9;
        f.m.rotation.z += dt * 4;
        f.m.scale.setScalar(f.mode === "out" ? Math.max(0.001, 1 - k * 0.7) : 0.7 + k * 0.3);
        if (k >= 1) {
          f.on = false;
          f.m.visible = false;
          if (f.mode === "in") stacks[f.lane].bump = Math.min(2, stacks[f.lane].bump + 1);
        }
      }

      st.renderer.render(scene, cam);
    });

    return () => {
      window.removeEventListener("gb:pulse", onPulse);
      window.removeEventListener("gb:view", onView);
      window.removeEventListener("gb:board", onBoard);
      window.removeEventListener("pointermove", onMove);
      extra.forEach((d) => d.dispose());
      st.dispose();
    };
  }, []);

  return <div className="backdrop" ref={ref} aria-hidden="true" />;
}
