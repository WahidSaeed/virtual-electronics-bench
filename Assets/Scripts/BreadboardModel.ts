/**
 * BreadboardModel — the half-size breadboard's holes, nets and snapping math, in board-local cm.
 * Board-local frame: origin at the board's center on the desk surface, +X along the numbered
 * columns (1..30, left to right), +Z toward the user, +Y up. Holes sit on the top face (y = THICKNESS).
 *
 * Layout (real half-size board, 0.1" / 2.54 mm pitch):
 *   - Terminal strips: columns 1..30; rows a–e (far half) and f–j (near half) separated by the
 *     center channel. Each column's a–e is one net, f–j another.
 *   - Power rails along both long edges: outer rail "+" (red line), inner rail "−" (blue line).
 *     Each rail is one net running the full length.
 * Must not: touch scene objects.
 */

export const PITCH = 0.254
export const BOARD_WIDTH = 8.3
export const BOARD_DEPTH = 5.5
export const THICKNESS = 0.9
export const COLUMNS = 30
export const ROWS = "abcdefghij"

export type RailName = "farPos" | "farNeg" | "nearNeg" | "nearPos"

export const RAIL_Z: {[k in RailName]: number} = {
  farPos: -2.254,
  farNeg: -2.0,
  nearNeg: 2.0,
  nearPos: 2.254,
}

export interface Hole {
  id: string
  x: number
  z: number
  net: string
  kind: "terminal" | "rail"
}

export interface TwoLegPlacement {
  left: Hole
  right: Hole
}

export class BreadboardModel {
  readonly holes: Hole[] = []
  readonly byId: {[id: string]: Hole} = {}

  constructor() {
    for (let c = 1; c <= COLUMNS; c++) {
      for (let i = 0; i < ROWS.length; i++) {
        this.add({
          id: `${ROWS[i]}${c}`,
          x: BreadboardModel.colX(c),
          z: BreadboardModel.rowZ(ROWS[i]),
          net: `T${c}${i < 5 ? "top" : "bot"}`,
          kind: "terminal",
        })
      }
    }
    for (const rail of Object.keys(RAIL_Z) as RailName[]) {
      for (let c = 1; c <= COLUMNS; c++) {
        // Real rails come in groups of five with a gap after each group.
        if (c % 6 === 0) continue
        this.add({id: `${rail}${c}`, x: BreadboardModel.colX(c), z: RAIL_Z[rail], net: `R_${rail}`, kind: "rail"})
      }
    }
  }

  static colX(col: number): number {
    return (col - (COLUMNS + 1) / 2) * PITCH
  }

  static rowZ(row: string): number {
    const i = ROWS.indexOf(row)
    return i < 5 ? -(0.381 + (4 - i) * PITCH) : 0.381 + (i - 5) * PITCH
  }

  /** +1 for a net marked "+", −1 for "−", 0 for an unmarked terminal strip. */
  static railSign(net: string): number {
    if (net.indexOf("Pos") >= 0 && net.indexOf("R_") === 0) return 1
    if (net.indexOf("Neg") >= 0 && net.indexOf("R_") === 0) return -1
    return 0
  }

  /** True when a board-local point is over the board, expanded by `margin` cm. */
  isOverBoard(x: number, z: number, margin: number): boolean {
    return Math.abs(x) <= BOARD_WIDTH / 2 + margin && Math.abs(z) <= BOARD_DEPTH / 2 + margin
  }

  /** Nearest free hole to a board-local point (wire ends, battery leads). */
  nearestFreeHole(x: number, z: number, occupied: {[id: string]: string}): Hole | null {
    let best: Hole | null = null
    let bestD = Infinity
    for (const h of this.holes) {
      if (occupied[h.id]) continue
      const d = (h.x - x) * (h.x - x) + (h.z - z) * (h.z - z)
      if (d < bestD) {
        bestD = d
        best = h
      }
    }
    return best
  }

  /**
   * Nearest free placement for a two-legged part lying along X with its legs `spanCols`
   * columns apart, both legs in the same lettered row (so each leg lands in its own numbered row).
   * (x, z) is the point between the legs.
   */
  nearestTwoLegPlacement(x: number, z: number, spanCols: number, occupied: {[id: string]: string}): TwoLegPlacement | null {
    let best: TwoLegPlacement | null = null
    let bestD = Infinity
    for (const row of ROWS) {
      const rz = BreadboardModel.rowZ(row)
      for (let c = 1; c + spanCols <= COLUMNS; c++) {
        const left = this.byId[`${row}${c}`]
        const right = this.byId[`${row}${c + spanCols}`]
        if (occupied[left.id] || occupied[right.id]) continue
        const cx = (left.x + right.x) / 2
        const d = (cx - x) * (cx - x) + (rz - z) * (rz - z)
        if (d < bestD) {
          bestD = d
          best = {left, right}
        }
      }
    }
    return best
  }

  private add(h: Hole): void {
    this.holes.push(h)
    this.byId[h.id] = h
  }
}
