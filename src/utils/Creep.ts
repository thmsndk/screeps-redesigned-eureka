import { ProcessGeneratorResult } from "Kernel";

export function* moveToTarget(creepName: string, id: Id<RoomObject> | undefined, range = 1): ProcessGeneratorResult {
  while (true) {
    const creep = Game.creeps[creepName];

    if (!id || !creep) {
      return;
    }

    const target = Game.getObjectById(id);
    if (!target) {
      return;
    }

    if (creep.pos.inRangeTo(target.pos, range)) {
      return;
    }

    creep.moveTo(target.pos, { range });

    yield;
  }
}

export function* harvest(creepName: string, id: Id<RoomObject> | undefined): ProcessGeneratorResult {
  while (true) {
    const creep = Game.creeps[creepName];
    if (!id || !creep) {
      return;
    }

    const source = Game.getObjectById<Source>(id);
    if (source) {
      if (source.energy > 0) {
        creep.harvest(source);
        yield;
      }
    }
  }
}

export function* upgradeUntillNoEnergy(creepName: string): ProcessGeneratorResult {
  let creep = Game.creeps[creepName];

  yield* moveToTarget(creepName, creep.room.controller?.id, 3);

  while (creep && creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
    if (creep.room.controller) {
      creep.upgradeController(creep.room.controller);
      creep = Game.creeps[creepName];
    }
    yield;
  }
}
