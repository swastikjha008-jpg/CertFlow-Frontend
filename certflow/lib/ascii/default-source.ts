import type { AsciiSource, CanvasFactory } from "./types";

/**
 * Procedurally drawn default source image: a surfer in front of a curling wave.
 *
 * Drawn with Canvas2D so there is no external image to go missing or 404.
 * Tones are deliberately bold: pale sky, mid-blue sea, near-black wave mass, white foam
 * and a dark surfer silhouette – these survive the heavy downsampling to an ASCII grid and
 * stay recognisable as a subject. With `invert: true` dark areas become the brightest marks.
 */
export function createDefaultSurfSource(create: CanvasFactory): AsciiSource {
  const W = 1920;
  const H = 1080;
  const canvas = create(W, H);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D context unavailable");

  // ---- sky
  const sky = ctx.createLinearGradient(0, 0, 0, 700);
  sky.addColorStop(0, "#b7d0f4");
  sky.addColorStop(1, "#f1f7ff");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  // soft clouds
  ctx.fillStyle = "rgba(255,255,255,0.65)";
  const clouds: Array<[number, number, number, number]> = [
    [260, 170, 240, 38],
    [520, 250, 300, 30],
    [180, 340, 200, 26],
    [1560, 120, 260, 30],
  ];
  for (const [x, y, rx, ry] of clouds) {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // ---- sea
  const sea = ctx.createLinearGradient(0, 640, 0, H);
  sea.addColorStop(0, "#7da0d6");
  sea.addColorStop(0.45, "#3a63a9");
  sea.addColorStop(1, "#16336f");
  ctx.fillStyle = sea;
  ctx.fillRect(0, 640, W, H - 640);

  // sea ripples
  ctx.strokeStyle = "rgba(235,244,255,0.55)";
  ctx.lineCap = "round";
  for (let i = 0; i < 16; i++) {
    const y = 680 + i * 26;
    const x = (i * 211) % 900;
    ctx.lineWidth = 3 + (i % 3);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + 110, y - 12, x + 230, y);
    ctx.stroke();
  }

  // ---- wave mass (dark) with a barrel notch under the lip
  const wave = new Path2D();
  wave.moveTo(560, H);
  wave.bezierCurveTo(660, 950, 740, 790, 870, 650);
  wave.bezierCurveTo(960, 565, 1040, 520, 1110, 470);
  wave.bezierCurveTo(1190, 420, 1250, 400, 1300, 372);
  wave.bezierCurveTo(1210, 326, 1100, 334, 1030, 384);
  wave.bezierCurveTo(990, 412, 962, 436, 948, 462);
  wave.bezierCurveTo(930, 390, 990, 290, 1120, 246);
  wave.bezierCurveTo(1260, 200, 1460, 186, 1630, 256);
  wave.bezierCurveTo(1810, 330, 1920, 480, 1920, 650);
  wave.lineTo(W, H);
  wave.closePath();
  const waveFill = ctx.createLinearGradient(900, 200, 1500, H);
  waveFill.addColorStop(0, "#0a1b4a");
  waveFill.addColorStop(0.5, "#0c2358");
  waveFill.addColorStop(1, "#071538");
  ctx.fillStyle = waveFill;
  ctx.fill(wave);

  // face ripples (lighter streaks that follow the curve)
  ctx.save();
  ctx.clip(wave);
  ctx.strokeStyle = "rgba(70,120,205,0.55)";
  for (let i = 0; i < 9; i++) {
    ctx.lineWidth = 5 + (i % 3) * 2;
    ctx.beginPath();
    ctx.moveTo(760 + i * 70, H);
    ctx.bezierCurveTo(840 + i * 78, 820 - i * 18, 980 + i * 70, 640 - i * 24, 1180 + i * 70, 560 - i * 10);
    ctx.stroke();
  }
  ctx.restore();

  // ---- foam along the crest and lip
  ctx.strokeStyle = "rgba(255,255,255,0.95)";
  ctx.lineCap = "round";
  ctx.lineWidth = 20;
  ctx.beginPath();
  ctx.moveTo(950, 450);
  ctx.bezierCurveTo(930, 380, 990, 285, 1120, 242);
  ctx.bezierCurveTo(1260, 196, 1460, 182, 1630, 252);
  ctx.stroke();
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.moveTo(1630, 252);
  ctx.bezierCurveTo(1780, 318, 1880, 430, 1910, 560);
  ctx.stroke();

  ctx.fillStyle = "rgba(255,255,255,0.9)";
  for (let i = 0; i < 46; i++) {
    const a = (i * 137.5 * Math.PI) / 180;
    const rad = 18 + ((i * 53) % 120);
    const x = 1010 + Math.cos(a) * rad * 1.6;
    const y = 300 + Math.sin(a) * rad * 0.8 - (i % 5) * 6;
    ctx.beginPath();
    ctx.arc(x, y, 3 + (i % 4) * 2.2, 0, Math.PI * 2);
    ctx.fill();
  }

  // whitewater at the base of the wave
  const wash = ctx.createRadialGradient(780, 960, 20, 780, 960, 320);
  wash.addColorStop(0, "rgba(255,255,255,0.95)");
  wash.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = wash;
  ctx.fillRect(400, 700, 800, 380);

  // ---- surfer
  const sx = 690;
  const sy = 790;
  // pale mist so the silhouette reads clearly
  const mist = ctx.createRadialGradient(sx + 20, sy - 120, 10, sx + 20, sy - 120, 290);
  mist.addColorStop(0, "rgba(255,255,255,0.95)");
  mist.addColorStop(0.55, "rgba(255,255,255,0.7)");
  mist.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = mist;
  ctx.fillRect(sx - 320, sy - 420, 640, 560);

  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(-0.07);
  ctx.fillStyle = "#050a1f";
  ctx.strokeStyle = "#050a1f";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // board
  ctx.save();
  ctx.rotate(-0.1);
  ctx.beginPath();
  ctx.ellipse(0, 0, 190, 15, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // legs (bent, wide stance)
  ctx.lineWidth = 30;
  ctx.beginPath();
  ctx.moveTo(-58, -10);
  ctx.lineTo(-24, -92);
  ctx.lineTo(8, -128);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(62, -16);
  ctx.lineTo(66, -90);
  ctx.lineTo(22, -130);
  ctx.stroke();

  // torso
  ctx.lineWidth = 50;
  ctx.beginPath();
  ctx.moveTo(14, -132);
  ctx.lineTo(34, -222);
  ctx.stroke();

  // arms (balanced out to both sides)
  ctx.lineWidth = 18;
  ctx.beginPath();
  ctx.moveTo(30, -214);
  ctx.lineTo(-62, -176);
  ctx.lineTo(-96, -190);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(38, -212);
  ctx.lineTo(118, -178);
  ctx.lineTo(150, -196);
  ctx.stroke();

  // head
  ctx.beginPath();
  ctx.arc(42, -266, 25, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // spray off the tail of the board
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  for (let i = 0; i < 26; i++) {
    const x = sx - 210 - i * 11 + ((i * 29) % 20);
    const y = sy - 6 - ((i * 17) % 52);
    ctx.beginPath();
    ctx.arc(x, y, 4 + (i % 4) * 2, 0, Math.PI * 2);
    ctx.fill();
  }

  return { image: canvas, width: W, height: H, focusX: 0.62, focusY: 0.5 };
}
