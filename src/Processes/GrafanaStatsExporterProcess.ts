import { ProcessContext, ProcessGeneratorResult, YieldAction, kernel } from "../Kernel";
import Stats from "utils/Stats";
kernel.registerProcess("GrafanaStatsExporterProcess", grafanastatsexporterprocess);

declare global {
  interface Memory {
    stats: any;
  }
}

// TODO: how do we make this process run at the end of ticks? and is it important?
function* grafanastatsexporterprocess<T extends any[]>(context: ProcessContext<T>): ProcessGeneratorResult {
  // never ending process
  while (true) {
    Memory.stats = Stats;
    yield YieldAction.NEXT_TICK;
  }
}
