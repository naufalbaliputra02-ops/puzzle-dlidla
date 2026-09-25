import * as THREE from 'three';
import logo from './dlicomLogoData.js';

function toShape(points, scale) {
  const shape = new THREE.Shape();
  points.forEach(([x, y], i) => (i === 0 ? shape.moveTo(x * scale, y * scale) : shape.lineTo(x * scale, y * scale)));
  shape.closePath();
  return shape;
}

/** Flat 2D shapes of the Dlicom mark, `width` wide, centered on the origin. */
export function createDlicomLogoShapes(width = 1) {
  const s = width / 2;
  const blades = logo.blades.map((pts) => toShape(pts, s));
  const { cx, cy, r } = logo.diamond;
  const diamond = new THREE.Shape()
    .moveTo((cx + r) * s, cy * s)
    .lineTo(cx * s, (cy + r) * s)
    .lineTo((cx - r) * s, cy * s)
    .lineTo(cx * s, (cy - r) * s)
    .closePath();
  return [...blades, diamond];
}

/** Extruded Dlicom logo geometry; back face at z = 0, front face at z = depth. */
export function createDlicomLogoGeometry({ width = 1, depth = 0.05, bevel = 0.01 } = {}) {
  const geo = new THREE.ExtrudeGeometry(createDlicomLogoShapes(width), {
    depth: Math.max(depth - bevel * 2, 0.0001),
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel * 0.8,
    bevelSegments: 3,
    curveSegments: 4,
  });
  geo.translate(0, 0, bevel);
  return geo;
}

function roundedSquare(size, radiusRatio = 0.18) {
  const r = size * radiusRatio;
  const h = size / 2 - r;
  const e = size / 2;
  return new THREE.Shape()
    .moveTo(-h, -e)
    .lineTo(h, -e)
    .quadraticCurveTo(e, -e, e, -h)
    .lineTo(e, h)
    .quadraticCurveTo(e, e, h, e)
    .lineTo(-h, e)
    .quadraticCurveTo(-e, e, -e, h)
    .lineTo(-e, -h)
    .quadraticCurveTo(-e, -e, -h, -e);
}

/** Standalone brand badge: white mark on a rounded navy plate (signage, checkpoints). */
export function createDlicomBadge({ size = 1 } = {}) {
  const mats = {
    plate: new THREE.MeshStandardMaterial({ name: 'BadgeNavy', color: 0x0b1440, roughness: 0.4 }),
    rim: new THREE.MeshStandardMaterial({
      name: 'BadgeRim', color: 0x2ecdd1, emissive: 0x2ecdd1, emissiveIntensity: 0.6, roughness: 0.3,
    }),
    mark: new THREE.MeshStandardMaterial({ name: 'DlicomLogo', color: 0xffffff, roughness: 0.3 }),
  };
  const group = new THREE.Group();
  group.name = 'DlicomBadge';
  group.userData = { asset: 'dlicom-badge', units: 'meters' };

  const plateDepth = size * 0.08;
  const plateGeo = new THREE.ExtrudeGeometry(roundedSquare(size), {
    depth: plateDepth, bevelEnabled: true, bevelThickness: size * 0.02, bevelSize: size * 0.02, bevelSegments: 3, curveSegments: 12,
  });
  plateGeo.translate(0, 0, -plateDepth);
  const plate = new THREE.Mesh(plateGeo, mats.plate);
  plate.name = 'BadgePlate';
  group.add(plate);

  const rim = new THREE.Mesh(
    new THREE.ExtrudeGeometry(roundedSquare(size * 1.08), { depth: size * 0.03, bevelEnabled: false, curveSegments: 12 }),
    mats.rim,
  );
  rim.name = 'BadgeRim';
  rim.position.z = -plateDepth - size * 0.05;
  group.add(rim);

  const mark = new THREE.Mesh(createDlicomLogoGeometry({ width: size * 0.78, depth: size * 0.05, bevel: size * 0.01 }), mats.mark);
  mark.name = 'DlicomMark';
  mark.position.z = size * 0.015;
  group.add(mark);
  return group;
}
