import { ProcessGeneratorResult } from "Kernel";
import { deref } from "./Deref";

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
  if (!creep) {
    // creep is dead / gone, finish task
    return;
  }

  yield* moveToTarget(creepName, creep.room.controller?.id, 3);
  creep = Game.creeps[creepName];

  while (creep && creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
    if (creep.room.controller) {
      creep.upgradeController(creep.room.controller);
      creep = Game.creeps[creepName];
    }
    yield;
  }
}

export function* findDroppedEnergy(creepName: string): ProcessGeneratorResult {
  let creep = Game.creeps[creepName];

  if (!creep) {
    // creep is dead / gone, finish task
    return;
  }

  const groundResources = creep.room.find(FIND_DROPPED_RESOURCES, { filter: RESOURCE_ENERGY }).map(r => r.id);
  // TODO: some sort of task statemachine
  for (const resourceId of groundResources) {
    let resource = deref(resourceId);
    if (!resource) {
      continue;
    }

    yield* moveToTarget(creepName, resource.id);
    creep = Game.creeps[creepName];
    resource = deref(resourceId);

    if (!creep) {
      // creep is dead / gone, finish task
      return;
    }

    if (creep && resource) {
      creep.pickup(resource);
    }
    if (creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0) {
      break;
    }
  }

  yield;
}

export function* buildUntillNoEnergy(creepName: string): ProcessGeneratorResult {
  let creep = Game.creeps[creepName];

  if (!creep) {
    // creep is dead / gone, finish task
    return;
  }

  const cSites = creep.room.find(FIND_MY_CONSTRUCTION_SITES).map(r => r.id);

  for (const cSiteId of cSites) {
    let cSite = deref(cSiteId);
    if (!cSite) {
      continue;
    }

    yield* moveToTarget(creepName, cSite.id, 3);

    while (creep && cSite && creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
      creep = Game.creeps[creepName];
      cSite = deref(cSiteId);

      if (creep && cSite) {
        creep.build(cSite);

        if (creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) {
          break;
        }
      }

      yield;
    }
  }

  yield;
}
