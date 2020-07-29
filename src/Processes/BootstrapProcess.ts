import { ProcessContext, ProcessGeneratorResult, kernel, sleep } from "../Kernel";
import { deref, derefRoomObjects } from "utils/Deref";
import { harvest, moveToTarget, upgradeUntillNoEnergy } from "utils/Creep";

kernel.registerProcess("BootstrapProcess", bootstrapProcess);

// gonna use a cache here, but context.memory is probably smarter?
function* bootstrapProcess<T extends any[]>(context: ProcessContext<T>): ProcessGeneratorResult {
  while (true) {
    context.debug("Awakened");

    // this process should run per room?
    // TODO: request/spawn x multipurpose creeps
    const rooms = Object.values(Game.rooms);

    for (const room of rooms) {
      if (!room.controller?.my) {
        continue;
      }

      const creeps = room.find(FIND_MY_CREEPS);
      const hasHarvesters = creeps.some(c => c.memory.task === "harvest"); // TODO: should be a lookup after goal/objectives

      if (creeps.length === 0 || !hasHarvesters) {
        // TODO: spawn bootstrap thread
        const key = `${context.processName}:${room.name}:bootstrap`;
        if (!kernel.hasProcess(key)) {
          kernel.registerProcess(key, bootstrapRoom, room.name);
        }
      }
    }

    context.debug("Sleeping for 100 ticks");
    yield* sleep(100);
  }
}
const AVERAGE_FILL_TIME = 50;
const offsetSpawnRequest = () => CREEP_SPAWN_TIME * 3 + AVERAGE_FILL_TIME; // WCM
function* bootstrapRoom<T extends any[]>(context: ProcessContext<T>, roomName: string): ProcessGeneratorResult {
  context.info(`Bootstrapping initialized for ${roomName}`);
  let memory = Memory.rooms[roomName];
  if (!memory) {
    memory = { bootstrap: true };
  }
  while (true) {
    const room = Game.rooms[roomName];

    // TODO: here we need objectives / missions so we can queue that, and something else is responsible for running that
    // TODO: request help or spawn yourself
    // TODO: spawn 1 worker and 1 hauler for each source
    // TODO: verify that they have spawned, need to do something smart once we reach intershard requests
    // TODO: finish bootstrapping
    const sources = room.find(FIND_SOURCES);
    const spawns = room.find(FIND_MY_SPAWNS).map(spawn => spawn.id);

    let offset = 0;
    for (const source of sources) {
      const key = (index: string) => `${context.processName}:${room.name}:bootstrap:spawnCreep:${index}`;

      // objective, mine source untill death
      kernel.registerProcess(key(`${source.id}:harvest`), spawnCreep, source.id, spawns, "harvest");
      offset += offsetSpawnRequest();
      context.info(`Sleeping for ${offset}`);
      yield* sleep(offset);

      // objective, haul untill death, primarly from source
      kernel.registerProcess(key(`${source.id}:haul`), spawnCreep, source.id, spawns, "haul");
      offset += offsetSpawnRequest();
      context.info(`Sleeping for ${offset}`);
      yield* sleep(offset);
    }

    // TODO: do we need to do other things?

    // end process
    memory = Memory.rooms[roomName];
    if (memory) {
      memory.bootstrap = false;
    }

    return;
  }
}

const workCarryMoveCost = BODYPART_COST[WORK] + BODYPART_COST[CARRY] + BODYPART_COST[MOVE];

function* spawnCreep<T extends any[]>(
  context: ProcessContext<T>,
  sourceId: Id<Source>,
  spawnIds: Id<StructureSpawn>[],
  task: string
): ProcessGeneratorResult {
  context.info(`${spawnIds.length} ${spawnIds.join(",")}`);
  while (true) {
    const spawns = derefRoomObjects(spawnIds);

    for (const spawn of spawns) {
      if (spawn.spawning) {
        continue;
      }

      if (spawn.room.energyAvailable >= workCarryMoveCost) {
        const creepName = `bootstrap ${Game.time}`;
        const result = spawn.spawnCreep([WORK, CARRY, MOVE], creepName, {
          memory: { role: `bootstrap:${task}`, target: sourceId, task }
        });

        // TODO: verify result?
        // TODO: spawn creep management with a predefined sleep interval for spawntime
        kernel.registerProcess(`boostrap:${spawn.room.name}:${creepName}`, bootstrapCreep, spawn.id, creepName);

        return;
      }

      yield;
    }
  }
}

function* bootstrapCreep<T extends any[]>(
  context: ProcessContext<T>,
  spawnId: Id<StructureSpawn>,
  creepName: string
): ProcessGeneratorResult {
  const creep = Game.creeps[creepName];

  if (!creep) {
    // creep is dead / gone, finish task
    context.info(`${creepName} could not be found, terminating task`);
    return;
  }

  if (creep.spawning) {
    const spawn = deref(spawnId);
    if (spawn && spawn.spawning) {
      const remainingTime = spawn.spawning.remainingTime;
      context.info(`Waiting on spawn to finish in ${remainingTime} ticks`);
      yield* sleep(remainingTime);
    }
  }

  switch (creep.memory.task) {
    case "harvest":
      kernel.registerProcess(`${context.processName}:harvest`, bootstrapHarvester, creepName);
      break;
    case "haul":
      kernel.registerProcess(`${context.processName}:haul`, bootstrapHauler, creepName);
      break;
  }
}

function* bootstrapHarvester<T extends any[]>(context: ProcessContext<T>, creepName: string): ProcessGeneratorResult {
  while (true) {
    const creep = Game.creeps[creepName];

    if (!creep) {
      // creep is dead / gone, finish task
      context.info(`${creepName} could not be found, terminating task`);
      return;
    }
    // const sourceId = creep.memory.target as Id<Source>;

    yield* moveToTarget(creepName, creep.memory.target);

    yield* harvest(creepName, creep.memory.target);

    yield;
  }
}

function* bootstrapHauler<T extends any[]>(context: ProcessContext<T>, creepName: string): ProcessGeneratorResult {
  while (true) {
    const creep = Game.creeps[creepName];

    if (!creep) {
      // creep is dead / gone, finish task
      context.info(`${creepName} could not be found, terminating`);
      return;
    }

    if (creep.store.getFreeCapacity(RESOURCE_ENERGY) >= 0) {
      const groundResources = creep.room.find(FIND_DROPPED_RESOURCES, { filter: RESOURCE_ENERGY }).map(r => r.id);
      // TODO: some sort of task statemachine
      for (const resourceId of groundResources) {
        const resource = deref(resourceId);
        if (!resource) {
          continue;
        }

        yield* moveToTarget(creepName, resource.id);
        const creep2 = deref(creep.id); // creep2 because we have yielded and need to refresh the creep

        if (!creep2) {
          // creep is dead / gone, finish task
          context.info(`${creepName} could not be found, terminating`);
          return;
        }

        const resource2 = deref(resourceId);
        if (creep2 && resource2) {
          creep2.pickup(resource2);
        }
        if (creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0) {
          break;
        }
      }
    }

    if (creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0) {
      const spawnsOrExtensions = creep.room
        .find<StructureSpawn | StructureExtension>(FIND_MY_STRUCTURES, {
          filter: structure =>
            structure.structureType === STRUCTURE_SPAWN || structure.structureType === STRUCTURE_EXTENSION
        })
        .map(s => s.id);
      for (const id of spawnsOrExtensions) {
        const structure = deref<StructureSpawn | StructureExtension>(id);
        if (!structure) {
          continue;
        }

        if (structure.store.getFreeCapacity(RESOURCE_ENERGY) === 0) {
          continue;
        }
        yield* moveToTarget(creepName, structure.id);

        const creep2 = deref(creep.id);
        if (!creep2) {
          // creep is dead / gone, finish task
          context.info(`${creepName} could not be found, terminating`);
          return;
        }

        const structure2 = deref<StructureSpawn | StructureExtension>(id);
        if (creep2 && structure2) {
          creep2.transfer(structure2, RESOURCE_ENERGY);
        }

        if (creep2.store.getUsedCapacity(RESOURCE_ENERGY) === 0) {
          break;
        }
      }
      // fallback to upgrading
      yield* upgradeUntillNoEnergy(creepName);
    }

    yield;
  }
}
