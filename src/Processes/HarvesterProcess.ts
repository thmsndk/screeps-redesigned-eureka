import { ProcessContext, ProcessGeneratorResult, kernel, sleep } from "../Kernel";
import { deref, derefRoomObjects } from "utils/Deref";
import { findDroppedEnergy, harvest, moveToTarget, upgradeUntillNoEnergy } from "utils/Creep";

kernel.registerProcess("HarvesterProcess", harvesterprocess);

const harvesters: Map<string, string[]> = new Map<string, string[]>();
const haulers: Map<string, string[]> = new Map<string, string[]>();
function* harvesterprocess<T extends any[]>(context: ProcessContext<T>): ProcessGeneratorResult {
  const rooms = Object.values(Game.rooms);
  for (const room of rooms) {
    if (!room.controller?.my) {
      continue;
    }

    if (!harvesters.has(room.name)) {
      harvesters.set(room.name, []);
    }

    if (!haulers.has(room.name)) {
      haulers.set(room.name, []);
    }

    const key = `${context.processName}:${room.name}:harvest`;
    if (!kernel.hasProcess(key)) {
      kernel.registerProcess(key, harvestRoom, room.name);
    }
  }
}

const AVERAGE_FILL_TIME = 50;
const offsetSpawnRequest = () => CREEP_SPAWN_TIME * 3 + AVERAGE_FILL_TIME; // WCM

function* harvestRoom<T extends any[]>(context: ProcessContext<T>, roomName: string): ProcessGeneratorResult {
  while (true) {
    const room = Game.rooms[roomName];
    const sources = room.find(FIND_SOURCES);
    const spawns = room.find(FIND_MY_SPAWNS).map(spawn => spawn.id);

    const roomHarvesters = harvesters.get(roomName);
    const roomHHaulers = haulers.get(roomName);

    // TODO: #7 scale amount of harvesters based on mining spots and room level
    const neededHarvesters = sources.length;
    // TODO: #8 haulers should be spawned based on some sort of resource "delivery" "request" that runs on repeat.
    const neededHaulers = sources.length;

    let offset = 0;
    for (const source of sources) {
      const key = (index: string) => `${context.processName}:spawnCreep:${index}`;

      if (roomHarvesters && roomHarvesters.length < neededHarvesters) {
        // objective, mine source untill death
        kernel.registerProcess(key(`${source.id}:harvest`), spawnCreep, source.id, spawns, "harvest", offset);
        offset += offsetSpawnRequest();
        context.info(`Sleeping for ${offset}`);
        yield* sleep(offset);
      }

      if (roomHHaulers && roomHHaulers.length < neededHaulers) {
        // objective, haul untill death, primarly from source
        kernel.registerProcess(key(`${source.id}:haul`), spawnCreep, source.id, spawns, "haul", offset);
        offset += offsetSpawnRequest();
        context.info(`Sleeping for ${offset}`);
        yield* sleep(offset);
      }
    }

    yield;
  }
}

const workCarryMoveCost = BODYPART_COST[WORK] + BODYPART_COST[CARRY] + BODYPART_COST[MOVE];
function* spawnCreep<T extends any[]>(
  context: ProcessContext<T>,
  sourceId: Id<Source>,
  spawnIds: Id<StructureSpawn>[],
  task: string,
  offset: number
): ProcessGeneratorResult {
  yield* sleep(offset);

  while (true) {
    const spawns = derefRoomObjects(spawnIds);
    const source = deref(sourceId);

    if (!source) {
      // will probably fail in multiroom due to lack of vision
      return;
    }

    const roomHarvesters = harvesters.get(source.pos.roomName);
    const roomHHaulers = haulers.get(source.pos.roomName);

    for (const spawn of spawns) {
      if (spawn.spawning) {
        continue;
      }

      if (spawn.room.energyAvailable >= workCarryMoveCost) {
        const creepName = `${task} ${Game.time}`;
        const result = spawn.spawnCreep([WORK, CARRY, MOVE], creepName, {
          memory: { role: task, target: sourceId, task }
        });

        switch (task) {
          case "harvest":
            if (roomHarvesters) {
              const creep = Game.creeps[creepName];
              roomHarvesters.push(creep.name);
            }
            kernel.registerProcess(`${context.processName}:harvest`, harvester, creepName);
            break;
          case "haul":
            if (roomHHaulers) {
              const creep = Game.creeps[creepName];
              roomHHaulers.push(creep.name);
            }
            kernel.registerProcess(`${context.processName}:haul`, hauler, creepName);
            break;
        }

        return;
      }
    }
    yield;
  }
}

function* harvester<T extends any[]>(context: ProcessContext<T>, creepName: string): ProcessGeneratorResult {
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

function* hauler<T extends any[]>(context: ProcessContext<T>, creepName: string): ProcessGeneratorResult {
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
