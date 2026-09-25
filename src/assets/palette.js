import * as THREE from 'three';

// Colors sampled from the mascot artwork and the Dlicom brand kit.
export const COLORS = {
  suit: 0x2f9bfa,
  glove: 0x1f7fe8,
  head: 0x1677f5,
  face: 0x0b1f5c,
  white: 0xf5f8ff,
  collar: 0x7fd3ff,
  cape: 0x1b63e8,
  glass: 0xcfeaff,
  brandNavy: 0x0b1440,
  brandCyan: 0x2ecdd1,
  echo: 0x14a0ff,
  echoGlow: 0x00c8ff,
};

export function createHeroMaterials() {
  const std = (name, color, extra = {}) =>
    new THREE.MeshStandardMaterial({ name, color, roughness: 0.55, metalness: 0, ...extra });

  return {
    suit: std('Suit', COLORS.suit),
    glove: std('Glove', COLORS.glove),
    head: new THREE.MeshPhysicalMaterial({
      name: 'Head', color: COLORS.head, roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.2,
    }),
    face: std('Face', COLORS.face, { roughness: 0.4 }),
    white: std('White', COLORS.white, { roughness: 0.35 }),
    logo: std('DlicomLogo', 0xffffff, { roughness: 0.3, emissive: 0xffffff, emissiveIntensity: 0.08 }),
    collar: std('Collar', COLORS.collar, { roughness: 0.3 }),
    cape: std('Cape', COLORS.cape, { roughness: 0.65, side: THREE.DoubleSide }),
    glass: new THREE.MeshPhysicalMaterial({
      name: 'HelmetGlass',
      color: COLORS.glass,
      roughness: 0.05,
      metalness: 0,
      transmission: 0.9,
      thickness: 0.04,
      ior: 1.3,
      clearcoat: 1,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    }),
    shine: new THREE.MeshBasicMaterial({
      name: 'HelmetShine', color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide,
    }),
  };
}

// Echo = the solid, crystallized remains of a failed attempt.
export function createEchoMaterials() {
  const crystal = new THREE.MeshPhysicalMaterial({
    name: 'EchoCrystal',
    color: COLORS.echo,
    emissive: COLORS.echoGlow,
    emissiveIntensity: 0.5,
    roughness: 0.15,
    metalness: 0.1,
    clearcoat: 0.5,
  });
  const core = crystal.clone();
  core.name = 'EchoCore';
  core.color.set(0x0a78ff);
  core.emissive.set(0x0060ff);
  core.emissiveIntensity = 0.9;
  const glow = new THREE.MeshStandardMaterial({
    name: 'EchoGlow', color: 0xffffff, emissive: 0x9ff8ff, emissiveIntensity: 2.2, roughness: 0.2,
  });
  const glass = new THREE.MeshPhysicalMaterial({
    name: 'EchoGlass', color: 0xaef4ff, emissive: COLORS.echoGlow, emissiveIntensity: 0.25,
    roughness: 0.1, transparent: true, opacity: 0.35, depthWrite: false,
  });
  const cape = crystal.clone();
  cape.name = 'EchoCape';
  cape.color.set(0x2aa8ff);
  cape.emissive.set(0x0055ff);
  cape.side = THREE.DoubleSide;
  return { crystal, core, glow, glass, cape };
}

// Maps each hero material name to its Echo counterpart slot.
export const ECHO_SLOT = {
  Suit: 'crystal', Glove: 'crystal', White: 'crystal', Collar: 'crystal',
  Head: 'core', Face: 'glow', DlicomLogo: 'glow',
  Cape: 'cape', HelmetGlass: 'glass', HelmetShine: 'glass',
};
