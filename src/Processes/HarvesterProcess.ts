import { ProcessContext, ProcessGeneratorResult, kernel, sleep } from "../Kernel";
import { deref, derefRoomObjects } from "utils/Deref";
import { findDroppedEnergy, harvest, moveToTarget, upgradeUntillNoEnergy } from "utils/Creep";
import { requestCreep } from "./SpawnProcess";

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

    const key = `${room.name}:harvest`;
    if (!kernel.hasProcess(key)) {
      kernel.registerProcess(key, harvestRoom, room.name);
    }
  }
}

function* harvestRoom<T extends any[]>(context: ProcessContext<T>, roomName: string): ProcessGeneratorResult {
  while (true) {
    const room = Game.rooms[roomName];
    const sources = room.find(FIND_SOURCES);

    const roomHarvesters = harvesters.get(roomName);
    const roomHaulers = haulers.get(roomName);

    // TODO: #7 scale amount of harvesters based on mining spots and room level
    const neededHarvesters = sources.length;
    // TODO: #8 haulers should be spawned based on some sort of resource "delivery" "request" that runs on repeat.
    const neededHaulers = sources.length;

    for (const source of sources) {
      const key = (index: string) => `${context.processName}:${index}`;

      if (roomHarvesters && roomHarvesters.length < neededHarvesters) {
        // objective, mine source untill death
        spawnCreep(key(`${source.id}:harvest`), roomHarvesters, "harvest", source.id);
      }

      if (roomHaulers && roomHaulers.length < neededHaulers) {
        // objective, haul untill death, primarly from source
        spawnCreep(key(`${source.id}:haul`), roomHaulers, "haul", source.id);
      }
    }

    yield;
  }
}

function spawnCreep(processName: string, creepList: string[], task: string, sourceId: Id<Source>) {
  const creepName = `${task} ${Game.time}`;

  const request = {
    body: [WORK, CARRY, MOVE],
    name: creepName,
    opts: { memory: { role: task, target: sourceId, task } }
  };

  switch (task) {
    case "harvest":
      requestCreep(request, () => kernel.registerProcess(processName, harvester, creepName));
      break;
    case "haul":
      requestCreep(request, () => kernel.registerProcess(processName, hauler, creepName));
      break;
  }

  creepList.push(creepName);
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
