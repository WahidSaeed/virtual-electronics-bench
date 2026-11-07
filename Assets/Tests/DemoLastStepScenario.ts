/**
 * Demo check: with "Demo Prebuild" on, the Lens starts with everything but the LED on the board
 * and the LED dark. Placing the LED (long leg next to the resistor) is the one step left, and it
 * must make the LED glow. Unlike the criterion scenarios this does not reset the bench first.
 */
import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {BenchLeafInteractor} from "./BenchLeafInteractor"

@component
export class DemoLastStepScenario extends Scenario {
  async run(): Promise<void> {
    const it = new BenchLeafInteractor()
    await it.waitReady()

    expect(it.bench.getPartHoles("Resistor220").join(",")).toBe("c10,c14")
    expect(it.bench.getPartHoles("Wire2_EndB").join(",")).toBe("nearNeg16")
    expect(it.bench.getPartHoles("LED").length).toBe(0)
    expect(it.bench.getLedState()).toBe("off")

    expect((await it.placePart("LED", ["e14", "e15"])).join(",")).toBe("e14,e15")
    expect(it.bench.getLedState()).toBe("glow")
    expect(it.isGlowVisible()).toBe(true)
  }
}
