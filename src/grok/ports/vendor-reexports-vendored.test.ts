import { describe, expect, test } from "vitest"

import * as agentBuilderCore from "../../core/omo/agent-builder"
import * as boulderStateCore from "../../core/omo/boulder-state"
import * as delegateCore from "../../core/omo/delegate-core"
import * as modelCore from "../../core/omo/model-core"
import * as rulesEngineCore from "../../core/omo/rules-engine"
import * as skillsLoaderCore from "../../core/omo/skills-loader-core"
import * as agentBuilderVendor from "./vendor/agent-builder-vendored"
import * as boulderStateVendor from "./vendor/boulder-state-vendored"
import * as delegateVendor from "./vendor/delegate-core-vendored"
import * as modelVendor from "./vendor/model-core-vendored"
import * as rulesEngineVendor from "./vendor/rules-engine-vendored"
import * as skillsLoaderVendor from "./vendor/skills-loader-core-vendored"

describe("grok/ports/vendor re-export shims", () => {
  test("point vendored compatibility imports at core-owned implementations", () => {
    expect(agentBuilderVendor.buildAgent).toBe(agentBuilderCore.buildAgent)
    expect(boulderStateVendor.createBoulderState).toBe(boulderStateCore.createBoulderState)
    expect(delegateVendor.resolveModelForDelegateTask).toBe(delegateCore.resolveModelForDelegateTask)
    expect(modelVendor.resolveModelPipeline).toBe(modelCore.resolveModelPipeline)
    expect(rulesEngineVendor.parseRuleFrontmatter).toBe(rulesEngineCore.parseRuleFrontmatter)
    expect(skillsLoaderVendor.parseJsonc).toBe(skillsLoaderCore.parseJsonc)
  })
})
