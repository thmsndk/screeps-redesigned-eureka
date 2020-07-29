import { ProcessContext, ProcessGeneratorResult, kernel, sleep } from "../Kernel";
import { deref, derefRoomObjects } from "utils/Deref";
import { findDroppedEnergy, moveToTarget, upgradeUntillNoEnergy } from "utils/Creep";

kernel.registerProcess("UpgraderProcess", upgraderprocess);

const upgraders: Map<string, string[]> = new Map<string, string[]>();
function* upgraderprocess<T extends any[]>(context: ProcessContext<T>): ProcessGeneratorResult {
  // never ending process
  while (true) {
    // TODO: spawn requests like bootstrap
    // calculate how many upgraders we need
    // if no creeps with controller as target and upgrade goal spawn N creeps with the purpose of upgrading the controller
    // TODO: upgrader creep process

    const rooms = Object.values(Game.rooms);
    for (const room of rooms) {
      if (!room.controller?.my) {
        continue;
      }

      if (!upgraders.has(room.name)) {
        upgraders.set(room.name, []);
      }

      const key = `${context.processName}:${room.name}:upgade`;
      if (!kernel.hasProcess(key)) {
        kernel.registerProcess(key, upgradeRoom, room.name);
      }
    }

    yield;
  }
}

const AVERAGE_FILL_TIME = 50;
const offsetSpawnRequest = () => CREEP_SPAWN_TIME * 3 + AVERAGE_FILL_TIME; // WCM
const workCarryMoveCost = BODYPART_COST[WORK] + BODYPART_COST[CARRY] + BODYPART_COST[MOVE];
function* upgradeRoom<T extends any[]>(context: ProcessContext<T>, roomName: string): ProcessGeneratorResult {
  while (true) {
    const memory = Memory.rooms[roomName];
    if (!memory || memory?.bootstrap) {
      yield* sleep(80);
    }

    // TODO: determine amount of upgraders needed in a sane way
    const room = Game.rooms[roomName];
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
      // TODO: spawn request
      const room = Game.rooms[roomName];
      if (!room.controller) {
        return;
      }
      const spawns = room.find(FIND_MY_SPAWNS).map(spawn => spawn.id);
      let offset = 0;
      // eslint-disable-next-line @typescript-eslint/prefer-for-of
      for (let i = roomUpgraders.length - 1; i < neededUpgraders; i++) {
        const key = (index: string) => `${context.processName}:${roomName}:upgrade:spawnCreep:${index}`;

        // objective, mine source untill death
        kernel.registerProcess(key(`${Game.time}:${i}`), spawnCreep, room.controller.id, spawns, "upgrade", offset);
        offset += offsetSpawnRequest();
        yield* sleep(offset);
      }
    }

    yield;
  }
}

function* spawnCreep<T extends any[]>(
  context: ProcessContext<T>,
  controllerId: Id<StructureController>,
  spawnIds: Id<StructureSpawn>[],
  task: string,
  offset: number
): ProcessGeneratorResult {
  yield* sleep(offset);

  while (true) {
    const spawns = derefRoomObjects(spawnIds);

    for (const spawn of spawns) {
      if (spawn.spawning) {
        continue;
      }

      if (spawn.room.energyAvailable >= workCarryMoveCost) {
        const creepName = `upgrade ${Game.time}`;
        const result = spawn.spawnCreep([WORK, CARRY, MOVE], creepName, {
          memory: { role: `upgrade`, target: controllerId, task }
        });

        const roomUpgreaders = upgraders.get(spawn.room.name);
        if (roomUpgreaders) {
          const creep = Game.creeps[creepName];
          roomUpgreaders.push(creep.name);
        }

        // TODO: verify result?
        // TODO: spawn creep management with a predefined sleep interval for spawntime
        kernel.registerProcess(
          `upgrade:${spawn.room.name}:${creepName}`,
          upgradeController,
          spawn.room.name,
          spawn.id,
          creepName
        );

        return;
      }
    }
    yield;
  }
}

export function* upgradeController<T extends any[]>(
  context: ProcessContext<T>,
  roomName: string,
  spawnId: Id<StructureSpawn>,
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
      const spawn = deref(spawnId);
      if (spawn && spawn.spawning) {
        const remainingTime = spawn.spawning.remainingTime;
        context.info(`Waiting on spawn to finish in ${remainingTime} ticks`);
        yield* sleep(remainingTime);
      }
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
