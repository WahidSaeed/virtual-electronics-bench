/**
 * BenchLeafInteractor — LEAF actions for the Virtual Electronics Bench.
 * Drags go through the real SIK path (hover → pinch → drag → release on the part's Interactable),
 * so the Lens's own snapping decides where a part lands. Each drag is steered every frame toward
 * a target point on the board, because LEAF's drag vector is applied once per frame and a fixed
 * vector cannot land on a 2.54 mm hole reliably.
 */
import {DefaultLeafInteractor} from "Leaf.lspkg/Interactors/interactor/DefaultLeafInteractor"
import {findInteractableByName} from "Leaf.lspkg/Interactors/InteractableUtils"
import {findSceneObjectByName, nextFrame, sleep} from "Leaf.lspkg/Utils/common/Utils"
import {BenchController} from "../Scripts/BenchController"

/** A part name and where it should go: one hole for wire / lead ends, two for the LED and resistor. */
export type Placement = [string, string[]]

// SIK smooths manipulated objects, so the part trails the pinch by a few frames; a gentle gain
// and a longer drag let it settle on the target before release instead of overshooting a hole.
const DRAG_MS = 3000
const STEER_GAIN = 0.15
const MAX_STEP_CM = 3

export class BenchLeafInteractor extends DefaultLeafInteractor {
  readonly bench: BenchController

  constructor() {
    super("BenchLeafInteractor")
    const root = findSceneObjectByName("VirtualBench")
    this.bench = root.getComponent(BenchController.getTypeName()) as BenchController
  }

  async waitReady(): Promise<void> {
    for (let i = 0; i < 100 && !this.bench.isReady(); i++) await sleep(50)
    if (!this.bench.isReady()) throw new Error("VirtualBench never became ready")
  }

  /** World point between a part's target holes, on the board's top face. */
  holesCenter(holes: string[]): vec3 {
    let sum = vec3.zero()
    for (const h of holes) sum = sum.add(this.bench.getHoleWorldPosition(h))
    return sum.uniformScale(1 / holes.length)
  }

  /**
   * Pinch a part and drag it so it is released at `target` (world space). Pass a function when
   * the target sits on the bench: in webcam marker mode the bench follows the printed marker and
   * can move mid-drag, so the target is re-read every frame.
   */
  async dragPartTo(name: string, target: vec3 | (() => vec3)): Promise<void> {
    const interactable = findInteractableByName(name)
    if (!interactable) throw new Error(`Interactable "${name}" not found`)
    const targetNow = typeof target === "function" ? target : () => target
    const step = vec3.zero()
    let steering = true
    const steer = async () => {
      while (steering) {
        const err = targetNow().sub(this.bench.getPartWorldPosition(name))
        let s = err.length > 0.005 ? err.uniformScale(STEER_GAIN) : vec3.zero()
        if (s.length > MAX_STEP_CM) s = s.normalize().uniformScale(MAX_STEP_CM)
        step.x = s.x
        step.y = s.y
        step.z = s.z
        await nextFrame()
      }
    }
    steer()
    await this.drag(interactable, step, DRAG_MS)
    steering = false
    const miss = targetNow().sub(this.bench.getPartWorldPosition(name)).length
    if (miss > 0.5) print(`[BenchLeaf] ${name} released ${miss.toFixed(2)} cm from its target`)
    await sleep(200)
    print(`[BenchLeaf] ${name} landed in ${this.bench.getPartHoles(name).join(",") || "tray"}`)
  }

  /** Drag a part onto the given holes (aiming between them for two-legged parts). */
  async placePart(name: string, holes: string[], offset: vec3 = vec3.zero()): Promise<string[]> {
    await this.dragPartTo(name, () => this.holesCenter(holes).add(offset))
    return this.bench.getPartHoles(name)
  }

  /** Pinch a part briefly without moving it (turns a placed LED around). */
  async tapPart(name: string): Promise<void> {
    const interactable = findInteractableByName(name)
    if (!interactable) throw new Error(`Interactable "${name}" not found`)
    await this.trigger(interactable)
    await sleep(200)
  }

  /** Puts everything back in the tray and waits a frame. */
  async resetBench(): Promise<void> {
    this.bench.resetBench()
    await sleep(200)
  }

  isGlowVisible(): boolean {
    const glow = findSceneObjectByName("LedGlow")
    return !!glow && glow.isEnabledInHierarchy
  }
}
