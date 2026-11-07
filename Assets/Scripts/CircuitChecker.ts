/**
 * CircuitChecker — decides what the LED shows from what is plugged into the breadboard.
 * Only two checks are in scope (design brief): LED direction, and whether the
 * battery → 220 Ω resistor → LED loop is complete. No current/voltage simulation.
 * Must not: touch scene objects.
 */

export type LedState = "off" | "glow" | "reversed"

export interface CircuitInput {
  /** Net under each lead, or null when that lead is not in the board. */
  ledAnode: string | null
  ledCathode: string | null
  resistorA: string | null
  resistorB: string | null
  batteryPlus: string | null
  batteryMinus: string | null
  /** Jumper wires with both ends in the board, as net pairs. */
  wires: [string, string][]
  /** +1 / −1 for nets printed "+" / "−" on the board, 0 otherwise. */
  railSign: (net: string) => number
  /** Every net on the board (used to find the printed rails). */
  allNets: string[]
}

export function evaluateCircuit(input: CircuitInput): LedState {
  if (input.ledAnode === null || input.ledCathode === null) return "off"

  const parent: {[net: string]: string} = {}
  const find = (n: string): string => {
    if (parent[n] === undefined) parent[n] = n
    while (parent[n] !== n) {
      parent[n] = parent[parent[n]]
      n = parent[n]
    }
    return n
  }
  for (const [a, b] of input.wires) parent[find(a)] = find(b)

  const A = find(input.ledAnode)
  const K = find(input.ledCathode)
  const P = input.batteryPlus !== null ? find(input.batteryPlus) : null
  const N = input.batteryMinus !== null ? find(input.batteryMinus) : null
  const resistorIn = input.resistorA !== null && input.resistorB !== null
  const R1 = resistorIn ? find(input.resistorA as string) : null
  const R2 = resistorIn ? find(input.resistorB as string) : null
  const resistorUsable = resistorIn && R1 !== R2

  // Complete, correct loop: + → resistor → LED → −, or + → LED → resistor → −.
  if (P !== null && N !== null && P !== N && A !== K && resistorUsable) {
    const throughResistor = (x: string, y: string) => (R1 === x && R2 === y) || (R1 === y && R2 === x)
    const resistorFirst = throughResistor(P, A) && K === N
    const resistorLast = A === P && throughResistor(K, N)
    if (resistorFirst || resistorLast) return "glow"
  }

  // Direction: the battery lead decides a side's polarity; before it is plugged in,
  // the printed "+" / "−" rails stand in for it.
  const pos: {[root: string]: boolean} = {}
  const neg: {[root: string]: boolean} = {}
  if (P !== null) pos[P] = true
  if (N !== null) neg[N] = true
  for (const net of input.allNets) {
    const sign = input.railSign(net)
    if (sign > 0 && P === null && !neg[find(net)]) pos[find(net)] = true
    if (sign < 0 && N === null && !pos[find(net)]) neg[find(net)] = true
  }
  // A resistor passes polarity through to its other end.
  if (resistorUsable) {
    const r1 = R1 as string
    const r2 = R2 as string
    const posR1 = pos[r1]
    const posR2 = pos[r2]
    const negR1 = neg[r1]
    const negR2 = neg[r2]
    if (posR1 && !negR2) pos[r2] = true
    if (posR2 && !negR1) pos[r1] = true
    if (negR1 && !posR2) neg[r2] = true
    if (negR2 && !posR1) neg[r1] = true
  }

  const backwards = !!pos[K] || !!neg[A]
  const forwards = !!pos[A] || !!neg[K]
  if (backwards && !forwards) return "reversed"
  return "off"
}
