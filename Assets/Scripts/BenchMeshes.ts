/**
 * BenchMeshes — procedural real-size meshes (all sizes in cm) and colored material clones.
 * Owns: MeshBuilder box / cylinder / sphere / hole-grid generation, mesh + material caches,
 *       and a helper that parents a mesh visual under a SceneObject.
 * Must not: hold bench state or interaction logic.
 */

const LAYOUT = [
  {name: "position", components: 3},
  {name: "normal", components: 3, normalized: true},
  {name: "texture0", components: 2},
]

const FACES = [
  {n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0]},
  {n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0]},
  {n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1]},
  {n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1]},
  {n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0]},
  {n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0]},
]

const meshCache: {[key: string]: RenderMesh} = {}

function newBuilder(): MeshBuilder {
  const mb = new MeshBuilder(LAYOUT)
  mb.topology = MeshTopology.Triangles
  mb.indexType = MeshIndexType.UInt16
  return mb
}

function finish(key: string, mb: MeshBuilder): RenderMesh {
  mb.updateMesh()
  const mesh = mb.getMesh()
  meshCache[key] = mesh
  return mesh
}

/** Axis-aligned box centered on the origin. */
export function boxMesh(w: number, h: number, d: number): RenderMesh {
  const key = `box_${w}_${h}_${d}`
  if (meshCache[key]) return meshCache[key]
  const half = [w / 2, h / 2, d / 2]
  const mb = newBuilder()
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]]
  FACES.forEach((f, fi) => {
    for (const [su, sv] of corners) {
      const p = [0, 1, 2].map((i) => (f.n[i] + f.u[i] * su + f.v[i] * sv) * half[i])
      mb.appendVerticesInterleaved([p[0], p[1], p[2], f.n[0], f.n[1], f.n[2], (su + 1) / 2, (sv + 1) / 2])
    }
    const b = fi * 4
    mb.appendIndices([b, b + 1, b + 2, b, b + 2, b + 3])
  })
  return finish(key, mb)
}

/**
 * Cylinder along +Y centered on the origin. `flatX` clips the +X side flat
 * (used for the LED rim's flat cathode side).
 */
export function cylinderMesh(r: number, h: number, segments: number = 20, flatX: number = Infinity): RenderMesh {
  const key = `cyl_${r}_${h}_${segments}_${flatX}`
  if (meshCache[key]) return meshCache[key]
  const mb = newBuilder()
  const hy = h / 2
  let idx = 0
  const ring: number[][] = []
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2
    let x = Math.cos(a) * r
    const z = Math.sin(a) * r
    let nx = Math.cos(a)
    let nz = Math.sin(a)
    if (x > flatX) {
      x = flatX
      nx = 1
      nz = 0
    }
    ring.push([x, z, nx, nz, i / segments])
  }
  // Side.
  for (let i = 0; i < segments; i++) {
    const p0 = ring[i]
    const p1 = ring[i + 1]
    mb.appendVerticesInterleaved([
      p0[0], -hy, p0[1], p0[2], 0, p0[3], p0[4], 0,
      p0[0], hy, p0[1], p0[2], 0, p0[3], p0[4], 1,
      p1[0], hy, p1[1], p1[2], 0, p1[3], p1[4], 1,
      p1[0], -hy, p1[1], p1[2], 0, p1[3], p1[4], 0,
    ])
    mb.appendIndices([idx, idx + 1, idx + 2, idx, idx + 2, idx + 3])
    idx += 4
  }
  // Caps.
  for (const sy of [1, -1]) {
    const center = idx
    mb.appendVerticesInterleaved([0, sy * hy, 0, 0, sy, 0, 0.5, 0.5])
    idx++
    for (let i = 0; i <= segments; i++) {
      const p = ring[i]
      mb.appendVerticesInterleaved([p[0], sy * hy, p[1], 0, sy, 0, 0.5, 0.5])
      idx++
    }
    for (let i = 0; i < segments; i++) {
      mb.appendIndices(sy > 0 ? [center, center + 2 + i, center + 1 + i] : [center, center + 1 + i, center + 2 + i])
    }
  }
  return finish(key, mb)
}

/** UV sphere centered on the origin. */
export function sphereMesh(r: number, segments: number = 16): RenderMesh {
  const key = `sph_${r}_${segments}`
  if (meshCache[key]) return meshCache[key]
  const mb = newBuilder()
  const rings = Math.max(6, Math.floor(segments / 2))
  for (let y = 0; y <= rings; y++) {
    const v = y / rings
    const phi = v * Math.PI
    for (let x = 0; x <= segments; x++) {
      const u = x / segments
      const theta = u * Math.PI * 2
      const nx = Math.sin(phi) * Math.cos(theta)
      const ny = Math.cos(phi)
      const nz = Math.sin(phi) * Math.sin(theta)
      mb.appendVerticesInterleaved([nx * r, ny * r, nz * r, nx, ny, nz, u, v])
    }
  }
  const stride = segments + 1
  for (let y = 0; y < rings; y++) {
    for (let x = 0; x < segments; x++) {
      const a = y * stride + x
      const b = a + stride
      mb.appendIndices([a, a + 1, b, a + 1, b + 1, b])
    }
  }
  return finish(key, mb)
}

/** Flat upward-facing squares (one per point) — the breadboard's hole pattern in a single mesh. */
export function holeGridMesh(key: string, points: {x: number; z: number}[], size: number, y: number): RenderMesh {
  if (meshCache[key]) return meshCache[key]
  const mb = newBuilder()
  const s = size / 2
  points.forEach((p, i) => {
    mb.appendVerticesInterleaved([
      p.x - s, y, p.z + s, 0, 1, 0, 0, 0,
      p.x + s, y, p.z + s, 0, 1, 0, 1, 0,
      p.x + s, y, p.z - s, 0, 1, 0, 1, 1,
      p.x - s, y, p.z - s, 0, 1, 0, 0, 1,
    ])
    const b = i * 4
    mb.appendIndices([b, b + 1, b + 2, b, b + 2, b + 3])
  })
  return finish(key, mb)
}

/** Clones the bench's two base materials into colored variants, cached per color. */
export class BenchMaterials {
  private cache: {[key: string]: Material} = {}

  constructor(
    private pbr: Material,
    private unlit: Material,
  ) {}

  /** Lit, opaque surface. */
  solid(r: number, g: number, b: number, metallic: number = 0, roughness: number = 0.6): Material {
    const key = `s_${r}_${g}_${b}_${metallic}_${roughness}`
    if (!this.cache[key]) this.cache[key] = this.makeSolid(r, g, b, metallic, roughness)
    return this.cache[key]
  }

  /** A solid material that is never shared, for parts whose color changes at runtime. */
  unique(r: number, g: number, b: number, metallic: number = 0, roughness: number = 0.6): Material {
    return this.makeSolid(r, g, b, metallic, roughness)
  }

  /** Additive, unlit glow — reads as light on the additive Specs display. */
  glow(r: number, g: number, b: number): Material {
    const key = `g_${r}_${g}_${b}`
    if (this.cache[key]) return this.cache[key]
    const m = this.unlit.clone()
    m.mainPass.baseColor = new vec4(r, g, b, 1)
    m.mainPass.blendMode = BlendMode.Add
    m.mainPass.depthWrite = false
    m.mainPass.twoSided = true
    this.cache[key] = m
    return m
  }

  private makeSolid(r: number, g: number, b: number, metallic: number, roughness: number): Material {
    const m = this.pbr.clone()
    m.mainPass.baseColor = new vec4(r, g, b, 1)
    m.mainPass.metallic = metallic
    m.mainPass.roughness = roughness
    m.mainPass.twoSided = true
    return m
  }
}

/** Creates a child SceneObject showing `mesh` at a local position / rotation / scale. */
export function addVisual(
  parent: SceneObject,
  name: string,
  mesh: RenderMesh,
  material: Material,
  position: vec3,
  rotation: quat = quat.quatIdentity(),
  scale: vec3 = vec3.one(),
): SceneObject {
  const obj = global.scene.createSceneObject(name)
  obj.setParent(parent)
  const t = obj.getTransform()
  t.setLocalPosition(position)
  t.setLocalRotation(rotation)
  t.setLocalScale(scale)
  const visual = obj.createComponent("Component.RenderMeshVisual") as RenderMeshVisual
  visual.mesh = mesh
  visual.mainMaterial = material
  return obj
}

/** Sets a lit material's emissive color (Simple PBR exposes it as a graph port). */
export function setEmissive(material: Material, color: vec3): void {
  ;(material.mainPass as any)["Port_Emissive_N006"] = color
}
