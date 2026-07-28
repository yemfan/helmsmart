import { Config } from "@remotion/cli/config";

// Remotion CLI config (Studio + local `remotion render`). Lambda rendering takes
// its settings from the render call, not this file.
Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
Config.setConcurrency(2);
