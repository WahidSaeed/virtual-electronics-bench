/**
 * Done criterion 2: placing the LED backwards in the circuit turns it red.
 * Builds the battery + resistor + wires first, then drops the LED in last with its long leg
 * on the "−" side — it must turn red right away and stay dark (no glow).
 */
import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {BenchLeafInteractor} from "./BenchLeafInteractor"
import {BACKWARDS_CIRCUIT} from "./BenchCircuits"

@component
export class LedBackwardsScenario extends Scenario {
  async run(): Promise<void> {
    const it = new BenchLeafInteractor()
    await it.waitReady()
    await it.resetBench()

    for (const [name, holes] of BACKWARDS_CIRCUIT) {
      if (name === "LED") expect(it.bench.getLedState()).toBe("off")
      const landed = await it.placePart(name, holes)
      expect(landed.join(",")).toBe(holes.join(","))
    }

    expect(it.bench.getLedState()).toBe("reversed")
    expect(it.isGlowVisible()).toBe(false)
  }
}
