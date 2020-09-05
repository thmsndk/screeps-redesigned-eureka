import { ProcessContext, ProcessGeneratorResult, kernel, sleep } from "../Kernel";
import { deref, derefRoomObjects } from "utils/Deref";
import { findDroppedEnergy, harvest, moveToTarget, upgradeUntillNoEnergy } from "utils/Creep";
import { requestCreep } from "./SpawnProcess";

kernel.registerProcess("BootstrapProcess", bootstrapProcess);

// gonna use a cache here, but context.memory is probably smarter?
function* bootstrapProcess<T extends any[]>(context: ProcessContext<T>): ProcessGeneratorResult {
  while (true) {
    context.debug("Awakened");

    // TODO: request/spawn x multipurpose creeps?
    const rooms = Object.values(Game.rooms);

    for (const room of rooms) {
      if (!room.controller?.my) {
        continue;
      }

      const creeps = room.find(FIND_MY_CREEPS);
      const hasHarvesters = creeps.some(c => c.memory.task === "harvest"); // TODO: should be a lookup after goal/objectives

      if (creeps.length === 0 || !hasHarvesters) {
        // TODO: put room in bootstrap mode, normal harvest process should react accordingly
        //
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
    // TODO: verify that they have spawned, need to do something smart once we reach intershard requests
    // TODO: finish bootstrapping
    const sources = room.find(FIND_SOURCES);

    for (const source of sources) {
      // objective, mine source untill death
      spawnCreep(source.id, source.room.name, "harvest");
      yield;

      // objective, haul untill death, primarly from source
      spawnCreep(source.id, source.room.name, "haul");
      yield;
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

function spawnCreep(sourceId: Id<Source>, roomName: string, task: string): void {
  const creepName = `bootstrap ${Game.time}`;
  requestCreep(
    {
      body: [WORK, CARRY, MOVE],
      name: creepName,
      opts: {
        memory: { role: `bootstrap:${task}`, target: sourceId, task }
      }
    },
    () => kernel.registerProcess(`boostrap:${roomName}:${creepName}`, bootstrapCreep, creepName)
  );
}

function* bootstrapCreep<T extends any[]>(context: ProcessContext<T>, creepName: string): ProcessGeneratorResult {
  const creep = Game.creeps[creepName];

  if (!creep) {
    // creep is dead / gone, finish task
    context.info(`${creepName} could not be found, terminating task`);
    return;
  }

  if (creep.spawning) {
    const remainingTime = creep.body.length * CREEP_SPAWN_TIME;
    context.info(`Waiting on spawn to finish in ${remainingTime} ticks`);
    yield* sleep(remainingTime);
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
      yield* findDroppedEnergy(creepName);
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
