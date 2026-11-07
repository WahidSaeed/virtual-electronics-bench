/**
 * Supporting check for criterion 2 ("the red clears as soon as it's fixed"): build the
 * backwards circuit, then pinch the LED once to turn it around in place. It must stop being
 * red and glow, without moving out of its holes.
 */
import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {BenchLeafInteractor} from "./BenchLeafInteractor"
import {BACKWARDS_CIRCUIT} from "./BenchCircuits"

@component
export class LedFlipFixScenario extends Scenario {
  async run(): Promise<void> {
    const it = new BenchLeafInteractor()
    await it.waitReady()
    await it.resetBench()

    for (const [name, holes] of BACKWARDS_CIRCUIT) await it.placePart(name, holes)
    expect(it.bench.getLedState()).toBe("reversed")

    await it.tapPart("LED")

    expect(it.bench.getPartHoles("LED").join(",")).toBe("e14,e15")
    expect(it.bench.getLedState()).toBe("glow")
  }
}
