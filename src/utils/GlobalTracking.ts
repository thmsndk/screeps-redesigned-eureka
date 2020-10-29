import { log } from "Logger";
import stats from "./Stats";

declare global {
  interface Memory {
    BUILD_TIME: any;
    SCRIPT_VERSION: any;
  }
}
const BUILD_TIME = "__BUILD_TIME__";
const REVISION = "__REVISION__";
class GlobalTracking {
  /**
   * run
   */
  public run() {
    if (!Memory.BUILD_TIME || Memory.BUILD_TIME !== BUILD_TIME) {
      Memory.BUILD_TIME = BUILD_TIME;
      Memory.SCRIPT_VERSION = REVISION;
      log.warning(`New code uploaded ${BUILD_TIME} (${REVISION})`);
      stats.cache("persistent.lastCodeReset", Game.time);
    } else {
      stats.cache("persistent.lastGlobalReset", Game.time);
    }
  }
}

const globalTracking = new GlobalTracking();
export default globalTracking;

// Memory.stats.persistent.lastMemoryReset = Game.time
// // Handle global time
// if (!global.age) {
//     global.age = 0
//   }
//   global.age++
//   Memory.stats.persistent.globalAge = global.age
