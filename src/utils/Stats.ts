/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { exponentialMovingAverage } from "utils";

class Stats {
  public cpu: { processes: { [index: string]: { cpu: number; iterations: number } } };
  [index: string]: any;

  /**
   *
   */
  public constructor() {
    this.cpu = { processes: {} };
  }
  /**
   * Recursively set a value of an object given a dot-separated key, adding intermediate properties as necessary
   * Ex: Stats.setDeep(Memory.colonies, 'E1S1.miningSites.siteID.stats.uptime', 0.5)
   */
  private static setDeep(object: any, keyString: string, value: any): void {
    const keys = keyString.split(".");

    // eslint-disable-next-line no-underscore-dangle
    return Stats._setDeep(object, keys, value);
  }

  private static _setDeep(object: any, keys: string[], value: any): void {
    const key = _.first(keys);
    keys = _.drop(keys);
    if (keys.length === 0) {
      // At the end of the recursion
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      object[key] = value;

      return;
    } else {
      if (!object[key]) {
        object[key] = {};
      }

      // eslint-disable-next-line no-underscore-dangle
      return Stats._setDeep(object[key], keys, value);
    }
  }

  public cache(key: string, value: any) {
    Stats.setDeep(this, key, value);
  }
  public run(): void {
    // if (Game.time % LOG_STATS_INTERVAL === 0) {
    // Record IVM heap statistics
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    const heapStatistics = Game.cpu.getHeapStatistics ? Game.cpu.getHeapStatistics() : null;
    this.cache("cpu.heapStatistics", heapStatistics);
    // Log GCL
    this.cache("gcl.progress", Game.gcl.progress);
    this.cache("gcl.progressTotal", Game.gcl.progressTotal);
    this.cache("gcl.level", Game.gcl.level);
    // Log memory usage
    this.cache("memory.used", RawMemory.get().length);
    // Log CPU
    this.cache("cpu.limit", Game.cpu.limit);
    this.cache("cpu.bucket", Game.cpu.bucket);
    // }

    const used = Game.cpu.getUsed();
    this.cache("cpu.getUsed", used);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    this.cache("cpu.avgCPU", exponentialMovingAverage(used, this.persistent?.avgCPU, 100));

    // TODO: export to segments
    const json = JSON.stringify(this);
    this.cache("memory.stats.used", exponentialMovingAverage(json.length, this.memory?.stats?.used, 100));
    RawMemory.segments[99] = json;
  }
}

const stats = new Stats();
export default stats;
