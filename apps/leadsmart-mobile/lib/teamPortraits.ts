import type { ImageSourcePropType } from "react-native";
import type { AssistantType } from "./teamSections";

/**
 * Portrait avatar per assistant — the CloseBoss AI-team characters, mirroring
 * the web personas served at `/avatars/personas/<name>.png`. Bundled statically
 * (Metro requires literal `require` paths) so the roster + hub can show the
 * character instead of a plain icon bubble.
 */
export const TEAM_PORTRAITS: Record<AssistantType, ImageSourcePropType> = {
  receptionist: require("../assets/team/emma.png"),
  sales: require("../assets/team/chris.png"),
  marketing: require("../assets/team/ruby.png"),
  transaction: require("../assets/team/grace.png"),
  accountant: require("../assets/team/oliver.png"),
};
