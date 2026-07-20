import { config } from "@vue/test-utils";
import { createFormblatt } from "../src/plugin";
import { TEST_CONTROLS } from "./controls-kit";

// the package is headless — every mounted app registers the kit the way a
// real app would, through the plugin; specs override per form via `controls`
config.global.plugins = [...config.global.plugins, createFormblatt({ controls: TEST_CONTROLS })];
