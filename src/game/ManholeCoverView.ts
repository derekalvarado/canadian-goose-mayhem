import * as THREE from "three";
import { toonMaterial } from "./toonMaterial.ts";

/**
 * Photo-referenced Denver sewer manhole cover: a round cast-iron lid with a
 * diamond tread pattern, a pick hole, and rim lettering, set inside a flush
 * frame ring. The tread/text art is a canvas texture on the cover's top cap
 * so the lettering stays crisp without adding real geometry.
 */
const COVER_R = 0.36;
const FRAME_R = 0.4;
const FRAME_Y = 0.008;
const COVER_H = 0.026;
const IRON_DARK = 0x241d19;
const IRON_MID = 0x342a24;

function drawArcText(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  cy: number,
  radius: number,
  centerAngle: number,
  font: string,
  color: string,
  bottom: boolean,
): void {
  ctx.save();
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const dir = bottom ? -1 : 1;
  const chars = [...text];
  const angleWidths = chars.map((ch) => ctx.measureText(ch).width / radius);
  const total = angleWidths.reduce((a, b) => a + b, 0);
  let angle = centerAngle - (dir * total) / 2;
  for (let i = 0; i < chars.length; i++) {
    angle += (dir * angleWidths[i]) / 2;
    ctx.save();
    ctx.translate(cx + radius * Math.cos(angle), cy + radius * Math.sin(angle));
    ctx.rotate(angle + Math.PI / 2 + (bottom ? Math.PI : 0));
    ctx.fillText(chars[i], 0, 0);
    ctx.restore();
    angle += (dir * angleWidths[i]) / 2;
  }
  ctx.restore();
}

function paintCoverTexture(ctx: CanvasRenderingContext2D, size: number): void {
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2;

  ctx.fillStyle = "#241d19";
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();

  // Diamond tread field, clipped to the inner face so a plain band remains for lettering.
  const innerR = r * 0.74;
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, innerR, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = "#352a24";
  const spacing = size * 0.062;
  const half = spacing * 0.24;
  for (let y = -innerR; y <= innerR; y += spacing * 0.5) {
    const row = Math.round((y + innerR) / (spacing * 0.5));
    const offset = row % 2 ? spacing / 2 : 0;
    for (let x = -innerR - spacing; x <= innerR + spacing; x += spacing) {
      const px = x + offset;
      if (px * px + y * y > innerR * innerR) continue;
      ctx.save();
      ctx.translate(cx + px, cy + y);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-half, -half, half * 2, half * 2);
      ctx.restore();
    }
  }
  ctx.restore();

  // A raised, unornamented ring carries the rim lettering.
  ctx.strokeStyle = "#2c231e";
  ctx.lineWidth = r * 0.06;
  ctx.beginPath(); ctx.arc(cx, cy, (innerR + r) / 2, 0, Math.PI * 2); ctx.stroke();

  const textRadius = (innerR + r) / 2;
  const textColor = "#4c3f37";
  drawArcText(ctx, "COLORADO IRON WORKS", cx, cy, textRadius, -Math.PI / 2, `bold ${Math.round(size * 0.052)}px Georgia`, textColor, false);
  drawArcText(ctx, "SEWER", cx, cy, textRadius, Math.PI * 0.72, `bold ${Math.round(size * 0.052)}px Georgia`, textColor, true);
  drawArcText(ctx, "MANHOLE", cx, cy, textRadius, Math.PI * 0.28, `bold ${Math.round(size * 0.052)}px Georgia`, textColor, true);

  ctx.fillStyle = textColor;
  ctx.font = `bold ${Math.round(size * 0.09)}px Georgia`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("DENVER", cx, cy + size * 0.03);

  // The off-center pick hole seen in the reference photo.
  ctx.fillStyle = "#161210";
  ctx.beginPath(); ctx.arc(cx + size * 0.22, cy - size * 0.01, size * 0.022, 0, Math.PI * 2); ctx.fill();
}

function coverTopMaterial(): THREE.MeshToonMaterial {
  const material = toonMaterial(0xffffff, {}, true);
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    canvas.width = 512; canvas.height = 512;
    paintCoverTexture(canvas.getContext("2d")!, 512);
    material.map = new THREE.CanvasTexture(canvas);
    material.map.colorSpace = THREE.SRGBColorSpace;
  } else {
    material.color.set(IRON_DARK);
  }
  return material;
}

export function createManholeCover(): THREE.Group {
  const g = new THREE.Group();
  g.name = "Sewer manhole cover";

  const frame = new THREE.Mesh(new THREE.RingGeometry(COVER_R * 0.97, FRAME_R, 48), toonMaterial(IRON_DARK));
  frame.rotation.x = -Math.PI / 2;
  frame.position.y = FRAME_Y;
  frame.receiveShadow = true;
  g.add(frame);

  const sideMaterial = toonMaterial(IRON_MID);
  const bottomMaterial = toonMaterial(IRON_DARK);
  const topMaterial = coverTopMaterial();
  const cover = new THREE.Mesh(new THREE.CylinderGeometry(COVER_R, COVER_R, COVER_H, 48), [sideMaterial, topMaterial, bottomMaterial]);
  cover.position.y = FRAME_Y + COVER_H / 2;
  cover.castShadow = true;
  cover.receiveShadow = true;
  g.add(cover);

  return g;
}
