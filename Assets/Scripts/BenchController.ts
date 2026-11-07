/**
 * BenchController — the Virtual Electronics Bench.
 * Owns: real-size geometry for the desk stand-in, breadboard, 2xAA battery pack and parts tray
 *       (built under the authored roots, so moving a root in the Scene moves that thing);
 *       the grabbable parts (LED, 220 Ω resistor, jumper wires, battery leads); snapping into
 *       the board; sending parts back to their tray slot; and the LED's off / glow / red state.
 * Expects @inputs: the five authored roots and the two base materials.
 * Must not: show instruction cards or menus (the tutorial lives on the user's laptop).
 *
 * Public API (used by LEAF tests): isReady, getLedState, getPartHoles, getHoleWorldPosition,
 * getPartWorldPosition, getPartNames, resetBench.
 */
import WorldCameraFinderProvider from "SpectaclesInteractionKit.lspkg/Providers/CameraProvider/WorldCameraFinderProvider"
import {addVisual, BenchMaterials, boxMesh, cylinderMesh, holeGridMesh, setEmissive, sphereMesh} from "./BenchMeshes"
import {BenchPart, PartListener} from "./BenchPart"
import {BreadboardModel, RAIL_Z, THICKNESS, BOARD_DEPTH, BOARD_WIDTH, PITCH} from "./BreadboardModel"
import {evaluateCircuit, LedState} from "./CircuitChecker"

const LED_SPAN_COLS = 1
const RESISTOR_SPAN_COLS = 4
const END_TOP_Y = 1.1
/** How long a dropped part takes to slide back to its tray slot. */
const RETURN_SECONDS = 0.25
/** A marker pose turning more than this in one frame is treated as a tracking glitch... */
const MARKER_JUMP_DEG = 12
/** ...unless it persists for this many frames, which means the phone really moved. */
const MARKER_JUMP_FRAMES = 4
/**
 * Demo prebuild: the working circuit minus the LED, which is left in the tray for the presenter.
 * + rail → wire → column 10 → 220 Ω → column 14 (LED anode goes here) · column 15 → wire → − rail.
 */
const DEMO_PREBUILD: [string, string[]][] = [
  ["BatteryLead_Red", ["nearPos2"]],
  ["BatteryLead_Black", ["nearNeg2"]],
  ["Resistor220", ["c10", "c14"]],
  ["Wire1_EndA", ["nearPos7"]],
  ["Wire1_EndB", ["a10"]],
  ["Wire2_EndA", ["a15"]],
  ["Wire2_EndB", ["nearNeg16"]],
]
/** Demo drop guide: where the LED goes in the prebuilt circuit (anode/long leg in column 14). */
const GUIDE_HOLES = ["e14", "e15"]
const GUIDE_DOTS = 9
/** With "lock after first scan", frames of continuous tracking (smoothing settles) before locking. */
const MARKER_LOCK_FRAMES = 45

interface Wire {
  a: BenchPart
  b: BenchPart
  segments: SceneObject[]
}

interface Lead {
  part: BenchPart
  exitLocal: vec3
  segments: SceneObject[]
}

interface Tween {
  part: BenchPart
  from: vec3
  t: number
}

@component
export class BenchController extends BaseScriptComponent implements PartListener {
  @ui.label("Virtual Electronics Bench")
  @ui.group_start("Scene roots")
  @input
  @hint("Virtual desk at real desk height — a stand-in for the user's real desk in the preview")
  deskStandIn!: SceneObject
  @input
  @hint("Breadboard root: board center, on the desk surface")
  breadboardRoot!: SceneObject
  @input
  @hint("Battery pack root, on the desk surface")
  batteryRoot!: SceneObject
  @input
  @hint("Parts tray root, on the desk surface")
  trayRoot!: SceneObject
  @input
  @hint("Parent for the grabbable parts and wires")
  partsRoot!: SceneObject
  @ui.group_end
  @ui.group_start("Materials")
  @input
  @hint("Lit material cloned for every solid color")
  baseMaterial!: Material
  @input
  @hint("Unlit material cloned for additive glows and highlights")
  glowMaterial!: Material
  @ui.group_end
  @ui.group_start("Settings")
  @input
  @hint("Show the virtual desk. Turn off on real glasses, where the user's own desk is used")
  showDeskStandIn: boolean = true
  @input
  @hint("Jumper wires in the tray")
  @widget(new SliderWidget(1, 4, 1))
  jumperWireCount: number = 4
  @input
  @hint("How far past the board's edge (cm) a drop still snaps into the board")
  snapMarginCm: number = 2.0
  @ui.group_end
  @ui.group_start("Webcam preview")
  @input
  @hint(
    "For a fixed-view preview with no head tracking (webcam input): hides the virtual desk, moves the battery and tray closer, tilts the bench toward you and places it straight ahead so it all fits in view. Leave off on real glasses and in Interactive Preview",
  )
  webcamMode: boolean = false
  @input
  @hint("Gap (cm) between the board and the battery leads / tray in webcam mode")
  webcamGapCm: number = 4
  @input
  @hint("How far (degrees) the bench tilts toward you in webcam mode")
  webcamTiltDeg: number = 35
  @input
  @hint("How far below eye level (cm) the bench sits in webcam mode")
  webcamDropCm: number = 8
  @ui.group_end
  @ui.group_start("Desk marker")
  @input
  @allowUndefined
  @hint(
    "Optional: image marker lying on the real desk. Once the camera finds it, the bench lies flat on it with the board centered on the image and its 'toward you' edge toward the user",
  )
  markerTracker: MarkerTrackingComponent
  @input
  @allowUndefined
  @hint("Optional: the same marker with a mirrored image, for webcams (e.g. iPhone Continuity Camera) that send a mirrored picture")
  markerTrackerMirrored: MarkerTrackingComponent
  @input
  @allowUndefined
  @hint(
    "Optional: a small card lying anywhere near the board. While the desk marker and the card are both in view the bench learns where it sits relative to the card, then follows the card alone in close-ups",
  )
  closeUpTracker: MarkerTrackingComponent
  @input
  @allowUndefined
  @hint("Optional: the close-up card with a mirrored image, for mirrored webcams")
  closeUpTrackerMirrored: MarkerTrackingComponent
  @input
  @hint(
    "Place the bench from the first steady marker sighting, then stop following markers. Use on glasses (which track their own movement) or with the webcam on a stand; with a hand-held webcam the bench would slide off the marker",
  )
  lockAfterFirstScan: boolean = false
  @input
  @hint("How quickly the bench follows the marker. Lower is steadier but lags more when the phone moves")
  @widget(new SliderWidget(2, 30, 1))
  markerSmoothing: number = 10
  @input
  @hint("A marker jump bigger than this (cm) in one frame is treated as a tracking glitch unless it persists")
  markerJumpCm: number = 3
  @ui.group_end
  @ui.group_start("Demo")
  @input
  @hint(
    "Start with the circuit already built (battery leads, 220 Ω resistor, both wires) and only the LED left in the tray, so a demo ends on the one placement that lights it",
  )
  demoPrebuild: boolean = false
  @input
  @hint(
    "With the demo prebuild: show where the LED goes — glowing target holes with + / − labels, bouncing arrows over the LED and the target, and a dotted path between them. Hides once the LED lights",
  )
  showDropGuide: boolean = true
  @ui.group_end
  @ui.group_start("Debug")
  @input
  @hint("Draw every part's grab zone")
  debugColliders: boolean = false
  @ui.group_end

  private model = new BreadboardModel()
  private mats!: BenchMaterials
  private allNets: string[] = []
  private parts: {[name: string]: BenchPart} = {}
  private occupied: {[holeId: string]: string} = {}
  private wires: Wire[] = []
  private leads: Lead[] = []
  private tweens: Tween[] = []
  private markers: SceneObject[] = []
  private led!: BenchPart
  private resistor!: BenchPart
  private ledBodyMaterial!: Material
  private ledHalo!: SceneObject
  private ledState: LedState = "off"
  private ready = false
  private ledHeld = false
  private guideTime = 0
  private guideTarget: SceneObject | null = null
  private guidePulse: SceneObject | null = null
  private guideTargetArrow: SceneObject | null = null
  private guideTrayArrow: SceneObject | null = null
  private guideDots: SceneObject[] = []
  private markerFound = false
  private markerPoseSet = false
  private markerJumpFrames = 0
  private markerSteadyFrames = 0
  private markerLocked = false
  /** Bench pose in the close-up card's local space, learned while both markers are in view. */
  private cardToBenchPos: vec3 | null = null
  private cardToBenchRot: quat | null = null

  onAwake() {
    const missing = ["deskStandIn", "breadboardRoot", "batteryRoot", "trayRoot", "partsRoot", "baseMaterial", "glowMaterial"].filter(
      (k) => isNull((this as any)[k]),
    )
    if (missing.length > 0) {
      print(`[Bench] ERROR: inputs not wired: ${missing.join(", ")}`)
      return
    }
    this.createEvent("OnStartEvent").bind(() => this.build())
    this.createEvent("UpdateEvent").bind(() => this.onUpdate())
    this.createEvent("LateUpdateEvent").bind(() => this.followMarker())
  }

  // ---------- Public API ----------

  isReady(): boolean {
    return this.ready
  }

  getLedState(): LedState {
    return this.ledState
  }

  getPartNames(): string[] {
    return Object.keys(this.parts)
  }

  /** Holes a part's leads are in; empty when it is off the board. */
  getPartHoles(name: string): string[] {
    const p = this.parts[name]
    return p ? p.holes.slice() : []
  }

  getPartWorldPosition(name: string): vec3 {
    return this.parts[name].position
  }

  /** World position of a hole on the board's top face, e.g. "e15", "nearPos3". */
  getHoleWorldPosition(holeId: string): vec3 {
    const h = this.model.byId[holeId]
    return this.boardToWorld(h.x, THICKNESS, h.z)
  }

  /** Puts every part back in its tray slot. */
  resetBench(): void {
    for (const name of Object.keys(this.parts)) {
      const p = this.parts[name]
      this.freeHoles(p)
      p.setFlipped(false)
      p.position = p.home()
    }
    this.tweens = []
    this.evaluate()
  }

  // ---------- PartListener ----------

  onGrab(part: BenchPart): void {
    if (part === this.led) this.ledHeld = true
    this.tweens = this.tweens.filter((t) => t.part !== part)
    this.freeHoles(part)
    this.evaluate()
  }

  onMove(part: BenchPart): void {
    this.showMarkers(this.findPlacement(part))
  }

  onRelease(part: BenchPart, wasTap: boolean): void {
    if (part === this.led) this.ledHeld = false
    this.showMarkers(null)
    if (wasTap && part.grabHoles.length > 0) {
      // A quick pinch on a part in the board leaves it in its holes and turns it around (LED direction).
      this.place(part, part.grabHoles)
      if (part.kind === "led" || part.kind === "resistor") part.setFlipped(!part.flipped)
      this.evaluate()
      return
    }
    const holes = this.findPlacement(part)
    if (holes) {
      this.place(part, holes)
    } else {
      this.tweens.push({part, from: part.position, t: 0})
    }
    this.evaluate()
  }

  // ---------- Build ----------

  private build(): void {
    this.mats = new BenchMaterials(this.baseMaterial, this.glowMaterial)
    const nets: {[n: string]: boolean} = {}
    this.model.holes.forEach((h) => (nets[h.net] = true))
    this.allNets = Object.keys(nets)

    this.buildDesk()
    if (this.webcamMode) this.applyWebcamLayout()
    this.buildBreadboard()
    this.buildBattery()
    this.buildTray()
    this.buildParts()
    this.buildMarkers()

    for (const name of Object.keys(this.parts)) this.parts[name].setDebugCollider(this.debugColliders)
    this.resetBench()
    this.setLedVisual("off")
    if (this.demoPrebuild) {
      for (const [name, holes] of DEMO_PREBUILD) this.place(this.parts[name], holes)
      this.evaluate()
      print("[Bench] demo prebuild: circuit built, LED left in the tray")
      if (this.showDropGuide) {
        this.buildGuide()
        print(`[Bench] drop guide: LED goes in ${GUIDE_HOLES.join("–")}, long leg (+) in ${GUIDE_HOLES[0]}`)
      }
    }
    this.ready = true
    print(`[Bench] ready: ${Object.keys(this.parts).length} parts, ${this.model.holes.length} holes`)
  }

  private buildDesk(): void {
    this.deskStandIn.enabled = this.showDeskStandIn
    const wood = this.mats.solid(0.62, 0.48, 0.34, 0, 0.85)
    addVisual(this.deskStandIn, "DeskTop", boxMesh(120, 3, 60), wood, new vec3(0, -1.5, 0))
    for (const [x, z] of [[-56, -26], [56, -26], [-56, 26], [56, 26]]) {
      addVisual(this.deskStandIn, "DeskLeg", boxMesh(4, 72, 4), wood, new vec3(x, -39, z))
    }
  }

  /**
   * Webcam input has no head tracking, so the user cannot look down at the desk. Pull the battery
   * and tray in next to the board and place the whole bench straight ahead of the camera, tilted
   * toward it, at the distance where its full width fits the camera's horizontal field of view.
   */
  private applyWebcamLayout(): void {
    this.deskStandIn.enabled = false
    // Lead ends rest 6 cm right of the pack's center; tray slots span ±6 cm around the tray.
    const sideX = BOARD_WIDTH / 2 + this.webcamGapCm + 6.0
    this.batteryRoot.getTransform().setLocalPosition(new vec3(-sideX, 0, 0))
    this.trayRoot.getTransform().setLocalPosition(new vec3(sideX, 0, 0))
    const left = -sideX - 2.9
    const right = sideX + 6.0
    const centerX = (left + right) / 2
    const halfWidth = (right - left) / 2 + 1.5

    const cam = WorldCameraFinderProvider.getInstance().getComponent()
    const halfH = Math.atan(Math.tan(cam.fov / 2) * cam.aspect)
    const distance = halfWidth / Math.tan(halfH)
    const camT = cam.getTransform()
    const t = this.getTransform()
    t.setWorldPosition(camT.getWorldTransform().multiplyPoint(new vec3(-centerX, -this.webcamDropCm, -distance)))
    t.setWorldRotation(camT.getWorldRotation().multiply(quat.angleAxis((this.webcamTiltDeg * Math.PI) / 180, vec3.right())))
    print(`[Bench] webcam mode: bench ${distance.toFixed(0)} cm ahead, tilted ${this.webcamTiltDeg}°`)
  }

  /**
   * Desk marker: the bench lies on the marker like real objects on the desk. The marker's image
   * plane is its local XY with +Z out of the image, so the bench's up (+Y) is turned onto +Z and its
   * near edge (+Z) onto the image's bottom edge. The close-up card stands in for the desk marker
   * once it has seen both together. Until a marker is first found the bench keeps its starting
   * pose; when markers are lost it stays where it was.
   */
  private followMarker(): void {
    if (!this.ready || this.markerLocked) return
    const tracking = (m: MarkerTrackingComponent) => !isNull(m) && m.isTracking()
    const desk = [this.markerTracker, this.markerTrackerMirrored].find(tracking)
    const card = [this.closeUpTracker, this.closeUpTrackerMirrored].find(tracking)

    let targetPos: vec3
    let targetRot: quat
    let scale: vec3
    if (desk) {
      const mt = desk.getTransform()
      targetPos = mt.getWorldPosition()
      targetRot = mt.getWorldRotation().multiply(quat.angleAxis(Math.PI / 2, vec3.right()))
      scale = mt.getWorldScale()
      if (card) {
        const ct = card.getTransform()
        if (!this.cardToBenchPos) print("[Bench] close-up card learned: it can now hold the bench on its own")
        this.cardToBenchPos = ct.getInvertedWorldTransform().multiplyPoint(targetPos)
        this.cardToBenchRot = ct.getWorldRotation().invert().multiply(targetRot)
      }
    } else if (card && this.cardToBenchPos && this.cardToBenchRot) {
      const ct = card.getTransform()
      targetPos = ct.getWorldTransform().multiplyPoint(this.cardToBenchPos)
      targetRot = ct.getWorldRotation().multiply(this.cardToBenchRot)
      scale = ct.getWorldScale()
    } else {
      this.markerSteadyFrames = 0
      return
    }

    if (!this.markerFound) {
      this.markerFound = true
      if (!this.webcamMode) this.deskStandIn.enabled = false
      const mirrored = desk === this.markerTrackerMirrored
      print(`[Bench] marker found${mirrored ? " (mirrored camera)" : ""}: bench placed on the marker`)
    }
    if (this.lockAfterFirstScan && ++this.markerSteadyFrames >= MARKER_LOCK_FRAMES) {
      this.markerLocked = true
      print("[Bench] bench locked in place; markers are no longer followed")
    }
    const t = this.getTransform()
    t.setWorldScale(scale)

    if (!this.markerPoseSet) {
      this.markerPoseSet = true
      t.setWorldPosition(targetPos)
      t.setWorldRotation(targetRot)
      return
    }

    // With the marker half out of view the tracker returns single-frame jumps. A big jump is only
    // followed once it has held for a few frames (a real phone move); otherwise it is ignored.
    const pos = t.getWorldPosition()
    const rot = t.getWorldRotation()
    const jumpCm = targetPos.distance(pos)
    const jumpDeg = (quat.angleBetween(rot, targetRot) * 180) / Math.PI
    if (jumpCm > this.markerJumpCm || jumpDeg > MARKER_JUMP_DEG) {
      this.markerJumpFrames++
      if (this.markerJumpFrames < MARKER_JUMP_FRAMES) return
    }
    this.markerJumpFrames = 0

    // Ease toward the tracked pose so small frame-to-frame jitter does not shake the parts.
    const a = 1 - Math.exp(-getDeltaTime() * this.markerSmoothing)
    t.setWorldPosition(vec3.lerp(pos, targetPos, a))
    t.setWorldRotation(quat.slerp(rot, targetRot, a))
  }

  private buildBreadboard(): void {
    const root = this.breadboardRoot
    const top = THICKNESS
    addVisual(root, "BoardBody", boxMesh(BOARD_WIDTH, THICKNESS, BOARD_DEPTH), this.mats.solid(0.93, 0.93, 0.89, 0, 0.7), new vec3(0, top / 2, 0))
    addVisual(root, "CenterChannel", boxMesh(BOARD_WIDTH - 0.3, 0.01, 0.3), this.mats.solid(0.76, 0.76, 0.74), new vec3(0, top + 0.002, 0))
    addVisual(root, "Holes", holeGridMesh("bbHoles", this.model.holes, 0.11, top + 0.004), this.mats.solid(0.16, 0.16, 0.18, 0, 1), vec3.zero())

    // Rail markings: red line outside each "+" rail, blue line inside each "−" rail, plus +/− glyphs at both ends.
    const red = this.mats.solid(0.9, 0.15, 0.12)
    const blue = this.mats.solid(0.2, 0.45, 1.0)
    const lineLen = BOARD_WIDTH - 0.7
    for (const side of [-1, 1]) {
      const posZ = side < 0 ? RAIL_Z.farPos : RAIL_Z.nearPos
      const negZ = side < 0 ? RAIL_Z.farNeg : RAIL_Z.nearNeg
      addVisual(root, "PlusLine", boxMesh(lineLen, 0.01, 0.05), red, new vec3(0, top + 0.004, posZ + side * 0.246))
      addVisual(root, "MinusLine", boxMesh(lineLen, 0.01, 0.05), blue, new vec3(0, top + 0.004, negZ - side * 0.25))
      for (const x of [-3.95, 3.95]) {
        this.glyph(root, "+", new vec3(x, top + 0.004, posZ), 0.2, red)
        this.glyph(root, "-", new vec3(x, top + 0.004, negZ), 0.2, blue)
      }
    }
  }

  private buildBattery(): void {
    const root = this.batteryRoot
    const shell = this.mats.solid(0.46, 0.46, 0.52, 0, 0.6)
    const cell = this.mats.solid(0.25, 0.45, 0.85, 0.3, 0.35)
    const metal = this.mats.solid(0.8, 0.8, 0.83, 0.9, 0.3)
    const alongX = quat.angleAxis(Math.PI / 2, vec3.forward())
    addVisual(root, "PackShell", boxMesh(5.8, 1.5, 3.2), shell, new vec3(0, 0.75, 0))
    for (const z of [-0.78, 0.78]) {
      addVisual(root, "AACell", cylinderMesh(0.7, 5.0, 24), cell, new vec3(-0.3, 1.2, z), alongX)
      addVisual(root, "AACellTip", cylinderMesh(0.25, 0.12, 16), metal, new vec3(2.26, 1.2, z), alongX)
    }
    // Lead exits on the +X lip, labelled + (red lead) and − (black lead).
    this.glyph(root, "+", new vec3(2.55, 1.51, -0.78), 0.4, this.mats.solid(0.95, 0.2, 0.15))
    this.glyph(root, "-", new vec3(2.55, 1.51, 0.78), 0.4, this.mats.solid(0.85, 0.85, 0.85))
  }

  private buildTray(): void {
    const root = this.trayRoot
    const mat = this.mats.solid(0.55, 0.7, 0.76, 0, 0.7)
    addVisual(root, "TrayBase", boxMesh(12, 0.3, 8), mat, new vec3(0, 0.15, 0))
    addVisual(root, "TrayRim", boxMesh(12, 0.8, 0.3), mat, new vec3(0, 0.4, -3.85))
    addVisual(root, "TrayRim", boxMesh(12, 0.8, 0.3), mat, new vec3(0, 0.4, 3.85))
    addVisual(root, "TrayRim", boxMesh(0.3, 0.8, 8), mat, new vec3(-5.85, 0.4, 0))
    addVisual(root, "TrayRim", boxMesh(0.3, 0.8, 8), mat, new vec3(5.85, 0.4, 0))
  }

  private buildParts(): void {
    const ring = this.mats.glow(0.05, 0.45, 0.55)
    const metal = this.mats.solid(0.78, 0.78, 0.8, 0.85, 0.3)
    const trayPoint = (x: number, z: number) => () => this.localToWorld(this.trayRoot, new vec3(x, 0.3, z))

    // LED: long leg (anode, +) on its left with a visible kink; flat rim on the cathode (−) side.
    this.led = this.addPart(new BenchPart(this.partsRoot, "LED", "led", new vec3(3, 4, 3), ring, trayPoint(-3.5, -2.2), this))
    const lv = this.led.visual
    this.segment(lv, new vec3(0.127, 0.9, 0), new vec3(0.127, 0, 0), 0.05, metal)
    const anode = [new vec3(-0.127, 0.9, 0), new vec3(-0.127, 0.62, 0), new vec3(-0.36, 0.47, 0), new vec3(-0.127, 0.31, 0), new vec3(-0.127, 0, 0)]
    for (let i = 0; i + 1 < anode.length; i++) this.segment(lv, anode[i], anode[i + 1], 0.05, metal)
    this.ledBodyMaterial = this.mats.unique(0.55, 0.9, 0.6, 0, 0.15)
    addVisual(lv, "LedRim", cylinderMesh(0.29, 0.1, 24, 0.2), this.ledBodyMaterial, new vec3(0, 0.95, 0))
    addVisual(lv, "LedBody", cylinderMesh(0.25, 0.55, 24), this.ledBodyMaterial, new vec3(0, 1.275, 0))
    addVisual(lv, "LedDome", sphereMesh(0.25, 20), this.ledBodyMaterial, new vec3(0, 1.55, 0))
    this.ledHalo = global.scene.createSceneObject("LedGlow")
    this.ledHalo.setParent(this.led.obj)
    addVisual(this.ledHalo, "GlowOuter", sphereMesh(1.0, 20), this.mats.glow(0.04, 0.4, 0.1), new vec3(0, 1.35, 0))
    addVisual(this.ledHalo, "GlowInner", sphereMesh(0.5, 20), this.mats.glow(0.15, 0.7, 0.25), new vec3(0, 1.35, 0))

    // 220 Ω resistor: red-red-brown-gold bands, legs bent down 4 holes apart.
    this.resistor = this.addPart(new BenchPart(this.partsRoot, "Resistor220", "resistor", new vec3(3.5, 3, 2.5), ring, trayPoint(1.0, -2.2), this))
    const rv = this.resistor.visual
    const alongX = quat.angleAxis(Math.PI / 2, vec3.forward())
    const legX = (RESISTOR_SPAN_COLS * PITCH) / 2
    addVisual(rv, "ResistorBody", cylinderMesh(0.12, 0.62, 20), this.mats.solid(0.86, 0.76, 0.56, 0, 0.5), new vec3(0, 0.45, 0), alongX)
    const bands: [number, Material][] = [
      [-0.2, this.mats.solid(0.85, 0.1, 0.1)],
      [-0.11, this.mats.solid(0.85, 0.1, 0.1)],
      [-0.02, this.mats.solid(0.5, 0.28, 0.12)],
      [0.2, this.mats.solid(0.85, 0.68, 0.25, 0.9, 0.3)],
    ]
    for (const [x, m] of bands) addVisual(rv, "Band", cylinderMesh(0.128, 0.05, 20), m, new vec3(x, 0.45, 0), alongX)
    for (const s of [-1, 1]) {
      this.segment(rv, new vec3(s * 0.31, 0.45, 0), new vec3(s * legX, 0.45, 0), 0.05, metal)
      this.segment(rv, new vec3(s * legX, 0.45, 0), new vec3(s * legX, 0, 0), 0.05, metal)
    }

    // Jumper wires: two connector ends each, lying side by side in the tray.
    const colors = [[0.9, 0.15, 0.12], [0.35, 0.35, 0.38], [0.95, 0.8, 0.15], [0.2, 0.75, 0.3]]
    const count = Math.max(1, Math.min(4, Math.round(this.jumperWireCount)))
    for (let i = 0; i < count; i++) {
      const x = count === 1 ? 0 : -4.5 + (9 * i) / (count - 1)
      const c = colors[i]
      const mat = this.mats.solid(c[0], c[1], c[2], 0, 0.5)
      const a = this.addEnd(`Wire${i + 1}_EndA`, "wireEnd", mat, ring, metal, trayPoint(x, 0.6))
      const b = this.addEnd(`Wire${i + 1}_EndB`, "wireEnd", mat, ring, metal, trayPoint(x, 3.0))
      this.wires.push({a, b, segments: this.wireSegments(`Wire${i + 1}`, mat, 3)})
    }

    // Battery leads: red (+) and black (−), resting just right of the pack.
    const leadSpecs: [string, number[], number][] = [
      ["BatteryLead_Red", [0.9, 0.15, 0.12], -0.78],
      ["BatteryLead_Black", [0.3, 0.3, 0.33], 0.78],
    ]
    for (const [name, c, z] of leadSpecs) {
      const mat = this.mats.solid(c[0], c[1], c[2], 0, 0.5)
      const home = () => this.localToWorld(this.batteryRoot, new vec3(6.0, 0, z * 1.6))
      const part = this.addEnd(name, "leadEnd", mat, ring, metal, home)
      this.leads.push({part, exitLocal: new vec3(2.9, 0.9, z), segments: this.wireSegments(name, mat, 2)})
    }
  }

  private buildMarkers(): void {
    const mat = this.mats.glow(0.1, 0.65, 0.8)
    for (let i = 0; i < 2; i++) {
      const m = global.scene.createSceneObject(`SnapMarker${i}`)
      m.setParent(this.partsRoot)
      addVisual(m, "MarkerPin", boxMesh(0.12, 0.8, 0.12), mat, new vec3(0, 0.4, 0))
      m.enabled = false
      this.markers.push(m)
    }
  }

  private addPart(p: BenchPart): BenchPart {
    this.parts[p.name] = p
    p.obj.getTransform().setWorldRotation(this.partsRoot.getTransform().getWorldRotation())
    return p
  }

  /** A jumper-wire or battery-lead end: a colored connector housing on a metal pin. */
  private addEnd(name: string, kind: "wireEnd" | "leadEnd", mat: Material, ring: Material, metal: Material, home: () => vec3): BenchPart {
    const p = this.addPart(new BenchPart(this.partsRoot, name, kind, new vec3(2, 3, 2), ring, home, this))
    addVisual(p.visual, "Housing", boxMesh(0.25, 0.7, 0.25), mat, new vec3(0, 0.75, 0))
    addVisual(p.visual, "Pin", boxMesh(0.06, 0.4, 0.06), metal, new vec3(0, 0.2, 0))
    return p
  }

  // ---------- Snapping ----------

  /** Holes the part would go into if released now, or null when it is not over the board. */
  private findPlacement(part: BenchPart): string[] | null {
    const p = this.projectToBoard(part.position)
    if (!this.model.isOverBoard(p.x, p.z, this.snapMarginCm)) return null
    if (part.kind === "led" || part.kind === "resistor") {
      const span = part.kind === "led" ? LED_SPAN_COLS : RESISTOR_SPAN_COLS
      const pl = this.model.nearestTwoLegPlacement(p.x, p.z, span, this.occupied)
      return pl ? [pl.left.id, pl.right.id] : null
    }
    const h = this.model.nearestFreeHole(p.x, p.z, this.occupied)
    return h ? [h.id] : null
  }

  /**
   * Board-local point the user sees the part over: the ray from the eye through the part,
   * hit against the board's top face. Matches what the user sees whether the part is held
   * high in the hand or dragged at a distance.
   */
  private projectToBoard(world: vec3): vec3 {
    const bt = this.breadboardRoot.getTransform()
    const cam = WorldCameraFinderProvider.getInstance().getComponent().getTransform().getWorldPosition()
    const n = bt.up
    const origin = this.boardToWorld(0, THICKNESS, 0)
    const d = world.sub(cam)
    const denom = d.dot(n)
    let hit = world
    if (Math.abs(denom) > 1e-4) {
      const t = origin.sub(cam).dot(n) / denom
      if (t > 0) hit = cam.add(d.uniformScale(t))
    }
    return bt.getInvertedWorldTransform().multiplyPoint(hit)
  }

  private place(part: BenchPart, holes: string[]): void {
    part.holes = holes
    holes.forEach((h) => (this.occupied[h] = part.name))
    let pos = this.getHoleWorldPosition(holes[0])
    if (holes.length === 2) pos = pos.add(this.getHoleWorldPosition(holes[1])).uniformScale(0.5)
    part.position = pos
    part.obj.getTransform().setWorldRotation(this.breadboardRoot.getTransform().getWorldRotation())
  }

  private freeHoles(part: BenchPart): void {
    part.holes.forEach((h) => delete this.occupied[h])
    part.holes = []
  }

  private showMarkers(holes: string[] | null): void {
    this.markers.forEach((m, i) => {
      const on = !!holes && i < holes.length
      m.enabled = on
      if (on) m.getTransform().setWorldPosition(this.getHoleWorldPosition((holes as string[])[i]))
    })
  }

  // ---------- Circuit ----------

  private evaluate(): void {
    const net = (id: string | undefined) => (id ? this.model.byId[id].net : null)
    const ledIn = this.led.holes.length === 2
    const anodeHole = ledIn ? this.led.holes[this.led.flipped ? 1 : 0] : undefined
    const cathodeHole = ledIn ? this.led.holes[this.led.flipped ? 0 : 1] : undefined
    const wires: [string, string][] = []
    for (const w of this.wires) {
      if (w.a.holes.length && w.b.holes.length) wires.push([net(w.a.holes[0]) as string, net(w.b.holes[0]) as string])
    }
    const state = evaluateCircuit({
      ledAnode: net(anodeHole),
      ledCathode: net(cathodeHole),
      resistorA: net(this.resistor.holes[0]),
      resistorB: net(this.resistor.holes[1]),
      batteryPlus: net(this.leads[0].part.holes[0]),
      batteryMinus: net(this.leads[1].part.holes[0]),
      wires,
      railSign: BreadboardModel.railSign,
      allNets: this.allNets,
    })
    if (state !== this.ledState) {
      this.ledState = state
      this.setLedVisual(state)
      print(`[Bench] LED: ${state}`)
    }
  }

  private setLedVisual(state: LedState): void {
    const m = this.ledBodyMaterial
    if (state === "glow") {
      m.mainPass.baseColor = new vec4(0.7, 1, 0.7, 1)
      setEmissive(m, new vec3(0.3, 1.0, 0.4))
    } else if (state === "reversed") {
      m.mainPass.baseColor = new vec4(1, 0.18, 0.15, 1)
      setEmissive(m, new vec3(0.45, 0.04, 0.03))
    } else {
      m.mainPass.baseColor = new vec4(0.55, 0.9, 0.6, 1)
      setEmissive(m, vec3.zero())
    }
    this.ledHalo.enabled = state === "glow"
  }

  // ---------- Per-frame ----------

  private onUpdate(): void {
    if (!this.ready) return
    const dt = getDeltaTime()
    this.tweens = this.tweens.filter((tw) => {
      tw.t = Math.min(1, tw.t + dt / RETURN_SECONDS)
      const e = 1 - (1 - tw.t) * (1 - tw.t)
      tw.part.position = vec3.lerp(tw.from, tw.part.home(), e)
      if (tw.t >= 1) tw.part.obj.getTransform().setWorldRotation(this.partsRoot.getTransform().getWorldRotation())
      return tw.t < 1
    })
    const up = this.breadboardRoot.getTransform().up
    for (const w of this.wires) {
      const p0 = this.endTop(w.a)
      const p1 = this.endTop(w.b)
      const lift = up.uniformScale(0.8)
      this.layPath(w.segments, [p0, p0.add(lift), p1.add(lift), p1])
    }
    for (const l of this.leads) {
      const p0 = this.localToWorld(this.batteryRoot, l.exitLocal)
      const p1 = this.endTop(l.part)
      this.layPath(l.segments, [p0, p1.add(up.uniformScale(0.6)), p1])
    }
    this.updateGuide(dt)
  }

  // ---------- Demo drop guide ----------

  /**
   * Shows where the LED goes in the prebuilt circuit: glowing pads on the two target holes inside
   * a pulsing outline, + (long leg) and − (flat side) labels in the center channel beside them,
   * a bouncing arrow over the target and one over the LED in the tray, and a dotted path that
   * flows from the tray to the target.
   */
  private buildGuide(): void {
    const root = this.breadboardRoot
    const top = THICKNESS
    const [ha, hk] = GUIDE_HOLES.map((id) => this.model.byId[id])
    const cx = (ha.x + hk.x) / 2
    const cz = ha.z
    const yellow = this.mats.glow(0.95, 0.75, 0.1)
    const red = this.mats.glow(1.0, 0.2, 0.12)
    const blue = this.mats.glow(0.2, 0.5, 1.0)

    const target = global.scene.createSceneObject("LedDropGuide")
    target.setParent(root)
    target.getTransform().setLocalPosition(vec3.zero())
    this.guideTarget = target
    // Hole pads: red under the + leg, blue under the − leg.
    addVisual(target, "GuidePadPlus", boxMesh(0.2, 0.02, 0.2), red, new vec3(ha.x, top + 0.012, ha.z))
    addVisual(target, "GuidePadMinus", boxMesh(0.2, 0.02, 0.2), blue, new vec3(hk.x, top + 0.012, hk.z))
    // + / − labels in the center channel, right next to each target hole.
    this.glyph(target, "+", new vec3(ha.x, top + 0.02, 0), 0.22, red)
    this.glyph(target, "-", new vec3(hk.x, top + 0.02, 0), 0.22, blue)

    // Pulsing outline around the pair.
    const pulse = global.scene.createSceneObject("GuidePulse")
    pulse.setParent(target)
    pulse.getTransform().setLocalPosition(new vec3(cx, top + 0.015, cz))
    this.guidePulse = pulse
    const w = hk.x - ha.x + 0.42
    const d = 0.42
    const t = 0.04
    addVisual(pulse, "GuideRim", boxMesh(w, 0.02, t), yellow, new vec3(0, 0, -d / 2))
    addVisual(pulse, "GuideRim", boxMesh(w, 0.02, t), yellow, new vec3(0, 0, d / 2))
    addVisual(pulse, "GuideRim", boxMesh(t, 0.02, d), yellow, new vec3(-w / 2, 0, 0))
    addVisual(pulse, "GuideRim", boxMesh(t, 0.02, d), yellow, new vec3(w / 2, 0, 0))

    // Bouncing arrows: one over the target, one over the LED's tray slot.
    this.guideTargetArrow = this.guideArrow(target, new vec3(cx, top, cz), yellow)
    const trayLocal = this.trayRoot.getTransform().getInvertedWorldTransform().multiplyPoint(this.led.home())
    this.guideTrayArrow = this.guideArrow(this.trayRoot, trayLocal.add(new vec3(0, 1.4, 0)), yellow)

    for (let i = 0; i < GUIDE_DOTS; i++) {
      const dot = addVisual(this.partsRoot, `GuideDot${i}`, sphereMesh(0.09, 10), yellow, vec3.zero())
      this.guideDots.push(dot)
    }
  }

  /** Down-pointing arrow made of bars, tip about 1 cm above `base` (parent-local). Returns the holder; its first child bobs. */
  private guideArrow(parent: SceneObject, base: vec3, mat: Material): SceneObject {
    const arrow = global.scene.createSceneObject("GuideArrow")
    arrow.setParent(parent)
    arrow.getTransform().setLocalPosition(base)
    const bob = global.scene.createSceneObject("GuideArrowBob")
    bob.setParent(arrow)
    this.segment(bob, new vec3(0, 2.3, 0), new vec3(0, 1.0, 0), 0.09, mat)
    this.segment(bob, new vec3(-0.35, 1.35, 0), new vec3(0, 0.95, 0), 0.09, mat)
    this.segment(bob, new vec3(0.35, 1.35, 0), new vec3(0, 0.95, 0), 0.09, mat)
    return arrow
  }

  private updateGuide(dt: number): void {
    if (!this.guideTarget) return
    this.guideTime += dt
    const lit = this.ledState === "glow"
    const inBoard = this.led.holes.length === 2
    const showTarget = !lit
    const showPath = !lit && !inBoard && !this.ledHeld

    this.guideTarget.enabled = showTarget
    if (this.guideTrayArrow) this.guideTrayArrow.enabled = showPath
    this.guideDots.forEach((d) => (d.enabled = showPath))
    if (this.guideTargetArrow) this.guideTargetArrow.enabled = showTarget && !inBoard
    if (!showTarget) return

    const s = Math.sin(this.guideTime * 5)
    const bounce = 0.35 * (0.5 + 0.5 * s)
    if (this.guidePulse) {
      const k = 1 + 0.18 * (0.5 + 0.5 * s)
      this.guidePulse.getTransform().setLocalScale(new vec3(k, 1, k))
    }
    for (const a of [this.guideTargetArrow, this.guideTrayArrow]) {
      if (a) a.getChild(0).getTransform().setLocalPosition(new vec3(0, bounce, 0))
    }

    if (!showPath) return
    // Dots flow along an arc from the LED's tray slot to the target holes.
    const start = this.led.home()
    const end = this.getHoleWorldPosition(GUIDE_HOLES[0]).add(this.getHoleWorldPosition(GUIDE_HOLES[1])).uniformScale(0.5)
    const up = this.breadboardRoot.getTransform().up
    const lift = up.uniformScale(Math.max(1.5, start.distance(end) * 0.35))
    const flow = (this.guideTime * 0.35) % 1
    this.guideDots.forEach((dot, i) => {
      const u = (i / GUIDE_DOTS + flow) % 1
      const p = vec3.lerp(start, end, u).add(lift.uniformScale(4 * u * (1 - u))).add(up.uniformScale(0.6))
      const tr = dot.getTransform()
      tr.setWorldPosition(p)
      const fade = Math.min(1, Math.min(u, 1 - u) * 6)
      tr.setLocalScale(vec3.one().uniformScale(0.4 + 0.8 * fade))
    })
  }

  private endTop(p: BenchPart): vec3 {
    return p.obj.getTransform().getWorldTransform().multiplyPoint(new vec3(0, END_TOP_Y, 0))
  }

  // ---------- Geometry helpers ----------

  private boardToWorld(x: number, y: number, z: number): vec3 {
    return this.breadboardRoot.getTransform().getWorldTransform().multiplyPoint(new vec3(x, y, z))
  }

  private localToWorld(root: SceneObject, p: vec3): vec3 {
    return root.getTransform().getWorldTransform().multiplyPoint(p)
  }

  /** A thin straight bar from a to b (local space of parent). */
  private segment(parent: SceneObject, a: vec3, b: vec3, thickness: number, mat: Material): void {
    const d = b.sub(a)
    addVisual(parent, "Lead", boxMesh(1, 1, 1), mat, a.add(b).uniformScale(0.5), this.alignZ(d), new vec3(thickness, thickness, d.length))
  }

  private wireSegments(name: string, mat: Material, count: number): SceneObject[] {
    const segs: SceneObject[] = []
    for (let i = 0; i < count; i++) segs.push(addVisual(this.partsRoot, `${name}_Cable`, boxMesh(1, 1, 1), mat, vec3.zero()))
    return segs
  }

  /** Lays world-space cable segments along a polyline. */
  private layPath(segs: SceneObject[], pts: vec3[]): void {
    segs.forEach((s, i) => {
      const a = pts[i]
      const b = pts[i + 1]
      const d = b.sub(a)
      const t = s.getTransform()
      t.setWorldPosition(a.add(b).uniformScale(0.5))
      t.setWorldRotation(this.alignZ(d))
      t.setWorldScale(new vec3(0.12, 0.12, Math.max(0.01, d.length)))
    })
  }

  /** Rotation that points local Z along d. */
  private alignZ(d: vec3): quat {
    if (d.length < 1e-6) return quat.quatIdentity()
    const dir = d.normalize()
    const up = Math.abs(dir.y) > 0.95 ? vec3.forward() : vec3.up()
    return quat.lookAt(dir, up)
  }

  /** "+" or "-" glyph lying flat, made of bars. */
  private glyph(parent: SceneObject, kind: "+" | "-", center: vec3, size: number, mat: Material): void {
    const bar = size * 0.22
    addVisual(parent, "GlyphBar", boxMesh(size, 0.01, bar), mat, center)
    if (kind === "+") addVisual(parent, "GlyphBar", boxMesh(bar, 0.01, size), mat, center)
  }
}
