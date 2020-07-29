import { ProcessContext, ProcessGeneratorResult, kernel, sleep } from "../Kernel";
import { deref, derefRoomObjects } from "utils/Deref";
import { buildUntillNoEnergy, findDroppedEnergy } from "utils/Creep";

kernel.registerProcess("AutonomousBuilderProcess", autonomousBuilderProcess);

const AVERAGE_FILL_TIME = 50;
const offsetSpawnRequest = () => CREEP_SPAWN_TIME * 3 + AVERAGE_FILL_TIME; // WCM
const workCarryMoveCost = BODYPART_COST[WORK] + BODYPART_COST[CARRY] + BODYPART_COST[MOVE];

const builders: Map<string, string[]> = new Map<string, string[]>();
function* autonomousBuilderProcess<T extends any[]>(context: ProcessContext<T>): ProcessGeneratorResult {
  // never ending process
  while (true) {
    const rooms = Object.values(Game.rooms);
    let offset = 0;
    for (const room of rooms) {
      if (!room.controller?.my) {
        continue;
      }

      if (!builders.get(room.name)) {
        builders.set(room.name, []);
      }

      let roomBuilders = builders.get(room.name);

      // clean up upgraders
      if (roomBuilders) {
        // context.info(`${roomBuilders?.length ?? 0} builders before filter`);
        roomBuilders = roomBuilders?.filter(name => Game.creeps[name]);
        // context.info(`${roomBuilders?.length ?? 0} builders after filter`);

        builders.set(room.name, roomBuilders);
      }

      const cSites = room.find(FIND_MY_CONSTRUCTION_SITES);
      const neededBuilders = Math.min(Math.ceil(cSites.length / 10), 1) - (roomBuilders?.length ?? 0);
      //   context.info(`${roomBuilders?.length ?? 0} builders, ${neededBuilders}`);
      if (neededBuilders > 0) {
        const spawns = room.find(FIND_MY_SPAWNS).map(spawn => spawn.id);

        for (let i = 0; i < neededBuilders; i++) {
          const key = (index: string) => `${context.processName}:${room.name}:spawnCreep:${index}`;

          // objective, build csites untill death
          kernel.registerProcess(key(`${Game.time}:${i}`), spawnBuilder, spawns, "build", offset, i);
          offset += offsetSpawnRequest();
          yield* sleep(offset);
        }
        yield;
      }
    }

    yield;
  }
}

function* spawnBuilder<T extends any[]>(
  context: ProcessContext<T>,
  spawnIds: Id<StructureSpawn>[],
  task: string,
  offset: number,
  spawnIndex: number
): ProcessGeneratorResult {
  yield* sleep(offset);

  while (true) {
    const spawns = derefRoomObjects(spawnIds);

    for (const spawn of spawns) {
      if (spawn.spawning) {
        continue;
      }

      if (spawn.room.energyAvailable >= workCarryMoveCost) {
        const creepName = `build ${Game.time} ${spawnIndex}`;
        const result = spawn.spawnCreep([WORK, CARRY, MOVE], creepName, {
          memory: { role: `build`, task }
        });

        const roomBuilders = builders.get(spawn.room.name);
        if (roomBuilders) {
          const creep = Game.creeps[creepName];
          if (creep) {
            roomBuilders.push(creep.name);
            kernel.registerProcess(
              `${spawn.room.name}:build:${creepName}`,
              builder,
              spawn.room.name,
              spawn.id,
              creepName
            );
            return;
          }
        }
      }
    }
    yield;
  }
}

function* builder<T extends any[]>(
  context: ProcessContext<T>,
  roomName: string,
  spawnId: Id<StructureSpawn>,
  creepName: string
): ProcessGeneratorResult {
  while (true) {
    let creep: Creep = Game.creeps[creepName];

    if (!creep) {
      // creep is dead / gone, finish task
      context.info(`${creepName} could not be found, terminating task`);
      const roomBuilders = builders.get(roomName);
      if (roomBuilders) {
        roomBuilders.splice(roomBuilders.indexOf(creepName), 1);
      }
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

    creep = Game.creeps[creepName];

    if (creep && creep.store.getFreeCapacity(RESOURCE_ENERGY) >= 0) {
      yield* findDroppedEnergy(creepName);
    }

    if (creep && creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0) {
      // We full, start ubuilding
      yield* buildUntillNoEnergy(creepName);
    }

    yield;
  }
}
