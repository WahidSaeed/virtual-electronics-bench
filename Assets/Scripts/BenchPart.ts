/**
 * BenchPart — one grabbable thing on the bench (LED, resistor, jumper-wire end, battery-lead end).
 * Owns: its SceneObject, a grab-zone collider larger than the visible part, SIK Interactable +
 *       InteractableManipulation (translate only), the hover highlight ring, and tap detection.
 * Origin convention: the part's origin is the point where its lead(s) meet the board surface,
 * so a part placed on the board sits with its origin on the hole (or between its two holes).
 * Must not: decide where the part snaps — the listener (BenchController) does that.
 */
import {Interactable} from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable"
import {InteractableManipulation} from "SpectaclesInteractionKit.lspkg/Components/Interaction/InteractableManipulation/InteractableManipulation"
import {addVisual, cylinderMesh} from "./BenchMeshes"

export type PartKind = "led" | "resistor" | "wireEnd" | "leadEnd"

export interface PartListener {
  onGrab(part: BenchPart): void
  onMove(part: BenchPart): void
  onRelease(part: BenchPart, wasTap: boolean): void
}

/** A pinch shorter than this that never starts a SIK drag counts as a tap. */
const TAP_MAX_SECONDS = 0.6

export class BenchPart {
  readonly obj: SceneObject
  /** Child that holds the visible geometry; rotated 180° when the part is turned around. */
  readonly visual: SceneObject
  /** Holes the part's leads are in, empty when it is off the board. LED: [left, right]. */
  holes: string[] = []
  /** Holes the part was in when the current pinch started (restored on a tap). */
  grabHoles: string[] = []
  flipped = false
  dragging = false

  private interactable: Interactable
  private manipulation: InteractableManipulation
  private collider: ColliderComponent
  private hoverRing: SceneObject
  private hovered = false
  private grabTime = 0
  private movedSinceGrab = false

  constructor(
    parent: SceneObject,
    readonly name: string,
    readonly kind: PartKind,
    grabSize: vec3,
    ringMaterial: Material,
    /** Where the part rests when it is not on the board (tray slot or next to the battery). */
    readonly home: () => vec3,
    private listener: PartListener,
  ) {
    this.obj = global.scene.createSceneObject(name)
    this.obj.setParent(parent)
    this.visual = global.scene.createSceneObject(`${name}_Visual`)
    this.visual.setParent(this.obj)

    // Grab zone: real-size parts are too small to pinch reliably, so the collider is much larger.
    this.collider = this.obj.createComponent("Physics.ColliderComponent") as ColliderComponent
    const shape = Shape.createBoxShape()
    shape.size = grabSize
    this.collider.shape = shape
    this.collider.fitVisual = false

    const ringRadius = Math.max(grabSize.x, grabSize.z) / 2
    this.hoverRing = addVisual(this.obj, `${name}_Highlight`, cylinderMesh(ringRadius, 0.04, 28), ringMaterial, new vec3(0, 0.03, 0))
    this.hoverRing.enabled = false

    this.interactable = this.obj.createComponent(Interactable.getTypeName()) as Interactable
    this.manipulation = this.obj.createComponent(InteractableManipulation.getTypeName()) as InteractableManipulation
    this.manipulation.setCanRotate(false)
    this.manipulation.setCanScale(false)

    this.interactable.onHoverEnter.add(() => {
      this.hovered = true
      this.refreshHighlight()
    })
    this.interactable.onHoverExit.add(() => {
      this.hovered = false
      this.refreshHighlight()
    })
    // SIK only starts a drag once the pinch has really moved, so hand jitter stays a tap.
    this.interactable.onDragStart.add(() => (this.movedSinceGrab = true))
    this.manipulation.onManipulationStart.add(() => {
      this.dragging = true
      this.grabTime = getTime()
      this.movedSinceGrab = false
      this.grabHoles = this.holes.slice()
      this.refreshHighlight()
      this.listener.onGrab(this)
    })
    this.manipulation.onManipulationUpdate.add(() => this.listener.onMove(this))
    this.manipulation.onManipulationEnd.add(() => {
      this.dragging = false
      const wasTap = !this.movedSinceGrab && getTime() - this.grabTime < TAP_MAX_SECONDS
      this.refreshHighlight()
      this.listener.onRelease(this, wasTap)
    })
  }

  get position(): vec3 {
    return this.obj.getTransform().getWorldPosition()
  }

  set position(p: vec3) {
    this.obj.getTransform().setWorldPosition(p)
  }

  setFlipped(flipped: boolean): void {
    this.flipped = flipped
    this.visual.getTransform().setLocalRotation(flipped ? quat.angleAxis(Math.PI, vec3.up()) : quat.quatIdentity())
  }

  setDebugCollider(on: boolean): void {
    this.collider.debugDrawEnabled = on
  }

  private refreshHighlight(): void {
    this.hoverRing.enabled = this.hovered || this.dragging
  }
}
