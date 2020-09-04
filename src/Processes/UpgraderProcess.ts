import { ProcessContext, ProcessGeneratorResult, kernel, sleep } from "../Kernel";
import { deref, derefRoomObjects } from "utils/Deref";
import { findDroppedEnergy, moveToTarget, upgradeUntillNoEnergy } from "utils/Creep";
import { requestCreep } from "./SpawnProcess";

kernel.registerProcess("UpgraderProcess", upgraderprocess);

// TODO: this really should be an "objective" :thinking:

const upgraders: Map<string, string[]> = new Map<string, string[]>();
function* upgraderprocess<T extends any[]>(context: ProcessContext<T>): ProcessGeneratorResult {
  // never ending process
  while (true) {
    const rooms = Object.values(Game.rooms);
    for (const room of rooms) {
      if (!room.controller?.my) {
        continue;
      }

      if (!upgraders.has(room.name)) {
        upgraders.set(room.name, []);
      }

      const key = `${context.processName}:${room.name}:upgrade`;
      if (!kernel.hasProcess(key)) {
        kernel.registerProcess(key, upgradeRoom, room.name);
      }
    }

    yield;
  }
}

function* upgradeRoom<T extends any[]>(context: ProcessContext<T>, roomName: string): ProcessGeneratorResult {
  while (true) {
    const memory = Memory.rooms[roomName];
    if (!memory || memory?.bootstrap) {
      yield* sleep(80);
    }

    let room = Game.rooms[roomName];
    // TODO: #11 handle amount and size of upgraders at RCL 8
    const neededUpgraders = room.storage
      ? Math.ceil(room.storage.store.getUsedCapacity(RESOURCE_ENERGY) / 1000)
      : Math.floor(room.energyAvailable / 60);

    let roomUpgraders = upgraders.get(roomName);

    // clean up upgraders
    if (roomUpgraders) {
      roomUpgraders = roomUpgraders?.filter(name => Game.creeps[name]);
      upgraders.set(roomName, roomUpgraders);
    }

    if (roomUpgraders && roomUpgraders.length < neededUpgraders) {
      room = Game.rooms[roomName];
      if (!room.controller) {
        return;
      }

      // eslint-disable-next-line @typescript-eslint/prefer-for-of
      for (let i = roomUpgraders.length - 1; i < neededUpgraders; i++) {
        const creepName = `upgrade ${Game.time}`;

        // objective, upgrade untill death
        roomUpgraders.push(creepName);

        requestCreep(
          {
            body: [WORK, CARRY, MOVE],
            name: creepName,
            opts: { memory: { role: `upgrade`, target: room.controller.id, task: "upgrade" } }
          },
          () => kernel.registerProcess(`upgrade:${roomName}:${creepName}`, upgradeController, roomName, creepName)
        );
      }
    }

    yield;
  }
}

export function* upgradeController<T extends any[]>(
  context: ProcessContext<T>,
  roomName: string,
  creepName: string
): ProcessGeneratorResult {
  while (true) {
    const creep: Creep = Game.creeps[creepName];

    if (!creep) {
      // creep is dead / gone, finish task
      context.info(`${creepName} could not be found, terminating task`);
      const roomUpgreaders = upgraders.get(roomName);
      if (roomUpgreaders) {
        roomUpgreaders.splice(roomUpgreaders.indexOf(creepName), 1);
      }
      return;
    }

    if (creep.spawning) {
      const remainingTime = creep.body.length * CREEP_SPAWN_TIME;
      context.info(`Waiting on spawn to finish in ${remainingTime} ticks`);
      yield* sleep(remainingTime);
    }

    if (creep.store.getFreeCapacity(RESOURCE_ENERGY) >= 0) {
      yield* findDroppedEnergy(creepName);
    }

    if (creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0) {
      // We full, start upgrade process
      yield* upgradeUntillNoEnergy(creepName);
    }

    yield;
  }
}
