import { ErrorMapper } from "utils/ErrorMapper";
import { kernel } from "./Kernel";
// eslint-disable-next-line sort-imports
import "Processes";

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

  // TODO: getting a generator is already running error, need to investigate bootstraphauler

  // TODO: look into typing arguments for registerprocess based on supplied generator for typesafety
  // TODO: global reset detection, code upload detection as a seperate thing from global resets, even though they are technically the same, but we want to render them differnetly in grafana
  // TODO: A bootstrap stage MWC creeps
  // TODO: A spawn process that can handle multiple spawns, the ability to cancel a request spawn request, perhaps a callback, perhaps intershard?
  // TODO: some sort of task / state management for a creep might reuse my modified screeps-tasks
  // TODO: A logistics/request system that can handle resource requests
  // TODO: Stats in segments or some sort of wrapper for storing data either in memory, segments or heap?
  // TODO: The ability to request help from other rooms (energy request, creep request)
  // TODO: An objective/mission system. e.g. kill player XYZ inside that there is a set of "tasks/missions" to fulfill said objective.

  // Objectives
  // - harvest sources
  // does requests turn into objectives? are requests just objectives?
});
