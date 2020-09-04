import { ProcessContext, ProcessGeneratorResult, kernel, sleep } from "../Kernel";
import { deref, derefRoomObjects } from "utils/Deref";
import { buildUntillNoEnergy, findDroppedEnergy } from "utils/Creep";
import { requestCreep } from "./SpawnProcess";

kernel.registerProcess("AutonomousBuilderProcess", autonomousBuilderProcess);

const builders: Map<string, string[]> = new Map<string, string[]>();
function* autonomousBuilderProcess<T extends any[]>(context: ProcessContext<T>): ProcessGeneratorResult {
  // never ending process
  while (true) {
    const rooms = Object.values(Game.rooms);
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
        for (let i = 0; i < neededBuilders; i++) {
          // objective, build csites untill death
          const creepName = `build ${Game.time}`;

          roomBuilders?.push(creepName);

          requestCreep(
            {
              body: [WORK, CARRY, MOVE],
              name: creepName,
              opts: { memory: { role: `build`, target: room.controller.id, task: "build" } }
            },
            () => kernel.registerProcess(`${room.name}:build:${creepName}`, builder, room.name, creepName)
          );

          yield;
        }
        yield;
      }
    }

    yield;
  }
}

function* builder<T extends any[]>(
  context: ProcessContext<T>,
  roomName: string,
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
      const remainingTime = creep.body.length * CREEP_SPAWN_TIME;
      context.info(`Waiting on spawn to finish in ${remainingTime} ticks`);
      yield* sleep(remainingTime);
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
