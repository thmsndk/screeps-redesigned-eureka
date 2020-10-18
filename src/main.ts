import { init } from "./lib/Profiler";
import { ErrorMapper } from "utils/ErrorMapper";
import { kernel } from "./Kernel";
import Stats from "utils/Stats";
// eslint-disable-next-line sort-imports
import "Processes";

// eslint-disable-next-line @typescript-eslint/no-namespace
global.Profiler = init();

// When compiling TS to JS and bundling with rollup, the line numbers and file names in error messages change
// This utility uses source maps to get the line numbers and file names of the original, TS source code
export const loop = ErrorMapper.wrapLoop(() => {
  // Automatically delete memory of missing creeps
  for (const name in Memory.creeps) {
    if (!(name in Game.creeps)) {
      delete Memory.creeps[name];
    }
  }

  kernel.tick();
  Stats.run();
  // TODO: getting a generator is already running error, need to investigate bootstraphauler

  // TODO: #12 global reset detection & code upload detection as a seperate thing from global resets, even though they are technically the same, but we want to render them differnetly in grafana

  // TODO: #13 some sort of task / state management for a creep might reuse my modified screeps-tasks
  // TODO: A logistics/request system that can handle resource requests
  // TODO: #14 Stats in segments or some sort of wrapper for storing data either in memory, segments or heap?
  // TODO: #15 The ability to request help from other rooms (energy request, creep request)
  // TODO: #16 An objective/mission system. e.g. kill player XYZ inside that there is a set of "tasks/missions" to fulfill said objective.

  // Objectives
  // - harvest sources
  // does requests turn into objectives? are requests just objectives?
});
