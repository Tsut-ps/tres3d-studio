import { newNode, type BNode } from './store'

type Parts = { geometry?: BNode; material?: BNode; children?: BNode[]; behaviors?: BNode[] }
const N = (def: string, props: Record<string, any> = {}, parts: Parts = {}): BNode =>
  Object.assign(newNode(def, props, false), parts)
const geo = (id: string, props: Record<string, any> = {}) => N(`three:${id}Geometry`, props)
const mat = (id: string, props: Record<string, any> = {}) => N(`three:${id}`, props)
const bhv = (id: string, props: Record<string, any> = {}) => N(`bhv:${id}`, props)
const PI = Math.PI

export interface Sample {
  id: string
  label: string
  note: string
  build: () => { canvas: Record<string, any>; children: BNode[] }
}

export const SAMPLES: Sample[] = [
  {
    id: 'first',
    label: 'はじめの一歩',
    note: '回る箱・浮かぶ球・金属のノット',
    build: () => ({
      canvas: { clearColor: '#171b2e', shadows: true },
      children: [
        N('three:PerspectiveCamera'),
        N('vue:OrbitControls'),
        N('three:AmbientLight', { intensity: 0.5 }),
        N('three:DirectionalLight', {
          'shadow-mapSize': [2048, 2048],
          'shadow-camera-left': -10,
          'shadow-camera-right': 10,
          'shadow-camera-top': 10,
          'shadow-camera-bottom': -10,
        }),
        N('custom:StudioEnv', { intensity: 0.6 }),
        N(
          'three:Mesh',
          { position: [0, 0, 0], rotation: [-PI / 2, 0, 0], castShadow: false },
          {
            geometry: geo('Plane', { width: 30, height: 30 }),
            material: mat('MeshStandardMaterial', { color: '#262c47', roughness: 0.9 }),
          },
        ),
        N(
          'three:Mesh',
          { position: [-2.2, 0.5, 0] },
          {
            geometry: geo('Box'),
            material: mat('MeshStandardMaterial', { color: '#ef6b5b', roughness: 0.4 }),
            behaviors: [bhv('spin', { speed: [0, 0.8, 0] })],
          },
        ),
        N(
          'three:Mesh',
          { position: [0, 0.9, 0] },
          {
            geometry: geo('Sphere', { radius: 0.9, widthSegments: 48, heightSegments: 32 }),
            material: mat('MeshPhysicalMaterial', {
              color: '#5b8def',
              roughness: 0.1,
              metalness: 0.2,
              clearcoat: 1,
              clearcoatRoughness: 0.1,
            }),
            behaviors: [bhv('bob', { amplitude: 0.3, frequency: 0.4 })],
          },
        ),
        N(
          'three:Mesh',
          { position: [2.4, 1.1, 0] },
          {
            geometry: geo('TorusKnot', {
              radius: 0.6,
              tube: 0.2,
              tubularSegments: 128,
              radialSegments: 16,
            }),
            material: mat('MeshStandardMaterial', {
              color: '#f0b429',
              roughness: 0.2,
              metalness: 0.9,
            }),
            behaviors: [bhv('spin', { speed: [0.3, 0.6, 0] })],
          },
        ),
      ],
    }),
  },
  {
    id: 'glass',
    label: 'ガラスと発光',
    note: '透過ガラス・ブルーム・フォグ',
    build: () => ({
      canvas: { clearColor: '#050510' },
      children: [
        N('three:PerspectiveCamera', { position: [0, 1.5, 8] }),
        N('vue:OrbitControls', { autoRotate: true, autoRotateSpeed: 1.2 }),
        N('three:Fog', { color: '#050510', near: 8, far: 30 }),
        N('custom:StudioEnv', { intensity: 0.8 }),
        N('three:PointLight', { position: [0, 2, 3], color: '#7aa2ff', intensity: 80 }),
        N(
          'three:Mesh',
          { position: [0, 0, -2.5] },
          {
            geometry: geo('Torus', { radius: 2.4, tube: 0.12, tubularSegments: 96 }),
            material: mat('MeshStandardMaterial', {
              color: '#ff4fa3',
              emissive: '#ff4fa3',
              emissiveIntensity: 2.5,
            }),
            behaviors: [bhv('spin', { speed: [0, 0, 0.4] })],
          },
        ),
        N(
          'three:Mesh',
          { position: [-1.6, 0, 0] },
          {
            geometry: geo('Sphere', { radius: 1, widthSegments: 64, heightSegments: 48 }),
            material: mat('MeshPhysicalMaterial', {
              color: '#ffffff',
              roughness: 0.05,
              metalness: 0,
              transmission: 1,
              thickness: 1.2,
              ior: 1.5,
            }),
          },
        ),
        N(
          'three:Mesh',
          { position: [1.6, 0, 0] },
          {
            geometry: geo('Icosahedron', { radius: 1, detail: 1 }),
            material: mat('MeshPhysicalMaterial', {
              color: '#9fe8ff',
              roughness: 0.1,
              transmission: 1,
              thickness: 1.5,
              ior: 1.7,
              iridescence: 1,
            }),
            behaviors: [bhv('spin', { speed: [0.2, 0.5, 0] })],
          },
        ),
        N(
          'post:Composer',
          {},
          {
            children: [
              N('post:BloomPmndrs'),
              N('post:VignettePmndrs'),
              N('post:ChromaticAberrationPmndrs', { offset: [0.0012, 0.0008] }),
            ],
          },
        ),
      ],
    }),
  },
  {
    id: 'orbit',
    label: '惑星の軌道',
    note: '入れ子のグループ・周回・星空',
    build: () => ({
      canvas: { clearColor: '#03040c' },
      children: [
        N('three:PerspectiveCamera', { position: [0, 9, 13] }),
        N('vue:OrbitControls'),
        N('vue:Stars', { count: 4000, size: 0.12 }),
        N('three:AmbientLight', { intensity: 0.15 }),
        N('three:PointLight', { position: [0, 0, 0], color: '#ffd27a', intensity: 600, decay: 2 }),
        N(
          'three:Mesh',
          { position: [0, 0, 0] },
          {
            geometry: geo('Sphere', { radius: 1.1, widthSegments: 48, heightSegments: 32 }),
            material: mat('MeshBasicMaterial', { color: '#ffcf5a' }),
            behaviors: [bhv('pulse', { amount: 0.03, frequency: 0.6 })],
          },
        ),
        N(
          'three:Mesh',
          {},
          {
            geometry: geo('Sphere', { radius: 0.32 }),
            material: mat('MeshStandardMaterial', { color: '#9aa5b4', roughness: 0.8 }),
            behaviors: [bhv('orbit', { radius: 3, speed: 1.1 })],
          },
        ),
        N(
          'three:Mesh',
          {},
          {
            geometry: geo('Sphere', { radius: 0.5 }),
            material: mat('MeshStandardMaterial', { color: '#4cc3d9', roughness: 0.5 }),
            behaviors: [bhv('orbit', { radius: 5, speed: 0.7, phase: 1.5 })],
          },
        ),
        N(
          'three:Group',
          {},
          {
            behaviors: [bhv('orbit', { radius: 8, speed: 0.4, phase: 3 })],
            children: [
              N(
                'three:Mesh',
                { position: [0, 0, 0], castShadow: false },
                {
                  geometry: geo('Sphere', { radius: 0.8, widthSegments: 40, heightSegments: 28 }),
                  material: mat('MeshStandardMaterial', { color: '#f0b429', roughness: 0.6 }),
                },
              ),
              N(
                'three:Mesh',
                { position: [0, 0, 0], rotation: [-PI / 2 + 0.4, 0, 0], castShadow: false },
                {
                  geometry: geo('Ring', { innerRadius: 1.2, outerRadius: 1.9, thetaSegments: 64 }),
                  material: mat('MeshBasicMaterial', {
                    color: '#e7d3a1',
                    side: 2,
                    transparent: true,
                    opacity: 0.8,
                  }),
                },
              ),
            ],
          },
        ),
        N(
          'post:Composer',
          {},
          { children: [N('post:BloomPmndrs', { intensity: 0.9, luminanceThreshold: 0.8 })] },
        ),
      ],
    }),
  },
  {
    id: 'blank',
    label: 'からっぽ',
    note: '何もない状態から始める',
    build: () => ({ canvas: { clearColor: '#171b2e', shadows: true }, children: [] }),
  },
]
