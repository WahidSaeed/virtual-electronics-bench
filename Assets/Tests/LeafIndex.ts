import {scenariosIndex} from "Leaf.lspkg/Scenarios/decorator/ScenarioIndexDecorator"
import {ScenarioMetadata} from "Leaf.lspkg/Scenarios/scenario/ScenarioMetadata"
import {CircuitGlowScenario} from "./CircuitGlowScenario"
import {DemoLastStepScenario} from "./DemoLastStepScenario"
import {LedBackwardsScenario} from "./LedBackwardsScenario"
import {LedFlipFixScenario} from "./LedFlipFixScenario"
import {LedSnapScenario} from "./LedSnapScenario"

@component
export class LeafIndex extends BaseScriptComponent {
  @scenariosIndex
  static scenariosIndex: ScenarioMetadata[] = [
    {id: "criterion1-led-snaps-into-row", typename: LedSnapScenario.getTypeName()},
    {id: "criterion2-backwards-led-turns-red", typename: LedBackwardsScenario.getTypeName()},
    {id: "criterion3-correct-circuit-glows", typename: CircuitGlowScenario.getTypeName()},
    {id: "criterion2b-turning-led-around-clears-red", typename: LedFlipFixScenario.getTypeName()},
    {id: "demo-last-step-led-glows", typename: DemoLastStepScenario.getTypeName()},
  ]
}
