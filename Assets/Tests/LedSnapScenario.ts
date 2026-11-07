/**
 * Done criterion 1: dragging the LED from the tray onto the breadboard snaps it into a row.
 * The LED is released slightly off the holes; it must snap so its two legs sit exactly in
 * neighbouring numbered rows (e14 + e15).
 */
import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {BenchLeafInteractor} from "./BenchLeafInteractor"

@component
export class LedSnapScenario extends Scenario {
  async run(): Promise<void> {
    const it = new BenchLeafInteractor()
    await it.waitReady()
    await it.resetBench()
    expect(it.bench.getPartHoles("LED").length).toBe(0)

    // Release 0.6 mm right and 0.5 mm toward the user of the e14/e15 pair.
    const holes = await it.placePart("LED", ["e14", "e15"], new vec3(0.06, 0, 0.05))

    expect(holes.length).toBe(2)
    expect(holes[0]).toBe("e14")
    expect(holes[1]).toBe("e15")
    const snapError = it.bench.getPartWorldPosition("LED").distance(it.holesCenter(["e14", "e15"]))
    expect(snapError).toBeLessThan(0.01)
  }
}
