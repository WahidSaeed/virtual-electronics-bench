/**
 * Done criterion 3: with the battery, 220 Ω resistor, LED and jumper wires connected correctly,
 * the LED glows. Also checks the brief's follow-up: it goes off when the circuit is broken
 * (one wire end dragged back to the tray).
 */
import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {findSceneObjectByName} from "Leaf.lspkg/Utils/common/Utils"
import {BenchLeafInteractor} from "./BenchLeafInteractor"
import {CORRECT_CIRCUIT} from "./BenchCircuits"

@component
export class CircuitGlowScenario extends Scenario {
  async run(): Promise<void> {
    const it = new BenchLeafInteractor()
    await it.waitReady()
    await it.resetBench()

    for (const [name, holes] of CORRECT_CIRCUIT) {
      if (name === "LED") expect(it.bench.getLedState()).toBe("off")
      const landed = await it.placePart(name, holes)
      expect(landed.join(",")).toBe(holes.join(","))
    }

    expect(it.bench.getLedState()).toBe("glow")
    expect(it.isGlowVisible()).toBe(true)

    // Break the circuit: drop the "−" wire end back in the tray.
    const tray = findSceneObjectByName("PartsTray").getTransform()
    await it.dragPartTo("Wire2_EndB", () => tray.getWorldTransform().multiplyPoint(new vec3(2, 0.3, 2)))
    expect(it.bench.getPartHoles("Wire2_EndB").length).toBe(0)
    expect(it.bench.getLedState()).toBe("off")
    expect(it.isGlowVisible()).toBe(false)
  }
}
