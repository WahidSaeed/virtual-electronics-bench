/**
 * BenchCircuits — the breadboard layouts the scenarios build, as (part, holes) lists.
 *
 * Both circuits share: battery red lead in the near "+" rail, black lead in the near "−" rail,
 * 220 Ω resistor across columns 10–14 (row c), LED legs in e14 (long leg / anode, left)
 * and e15 (cathode, right).
 */
import {Placement} from "./BenchLeafInteractor"

const shared: Placement[] = [
  ["BatteryLead_Red", ["nearPos2"]],
  ["BatteryLead_Black", ["nearNeg2"]],
  ["Resistor220", ["c10", "c14"]],
]

/** + rail → resistor → LED anode; LED cathode → − rail. The LED should glow. */
export const CORRECT_CIRCUIT: Placement[] = shared.concat([
  ["Wire1_EndA", ["nearPos7"]],
  ["Wire1_EndB", ["a10"]],
  ["Wire2_EndA", ["a15"]],
  ["Wire2_EndB", ["nearNeg16"]],
  ["LED", ["e14", "e15"]],
])

/** + rail → LED cathode; LED anode → resistor → − rail. The LED is in backwards. */
export const BACKWARDS_CIRCUIT: Placement[] = shared.concat([
  ["Wire1_EndA", ["nearPos7"]],
  ["Wire1_EndB", ["a15"]],
  ["Wire2_EndA", ["a10"]],
  ["Wire2_EndB", ["nearNeg11"]],
  ["LED", ["e14", "e15"]],
])
