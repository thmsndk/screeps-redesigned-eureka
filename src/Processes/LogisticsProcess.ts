import { ProcessContext, ProcessGeneratorResult, kernel } from "../Kernel";
import { uuidv4 } from "utils";
import { deref, derefRoomObjects } from "utils/Deref";
import { moveToTarget } from "utils/Creep";
import { requestCreep } from "./SpawnProcess";

kernel.registerProcess("LogisticsProcess", logisticsProcess);

declare global {
  interface CreepMemory {
    ticket?: string;
  }
}

// A list of tickets of future haulers
const futureHaulers = new Map<string, string[]>();

const haulers: Map<string, Id<Creep>[]> = new Map<string, Id<Creep>[]>();

// TODO: when is a ticket done?
const tickets = new Map<
  string,
  { creeps: Id<Creep>[]; parameters: DeliveryRequest | PickupRequest; onSuccess: (ticket: string) => void }
>();

// cache per room for potential delivery locations for usage later
const potentialDeliveryLocations = new Map<
  string,
  Id<StructureSpawn | StructureExtension | StructureSpawn | StructureContainer | StructureStorage>[]
>();

function* logisticsProcess<T extends any[]>(context: ProcessContext<T>): ProcessGeneratorResult {
  // never ending process
  while (true) {
    // perhaps we need a process per "vilage/owned room"?

    const carryCapacity = new Map<string, number>();

    for (const [roomName, creeps] of haulers) {
      const roomHaulers = creeps.reduce((roomCreeps, creepName) => {
        const creep = Game.creeps[creepName];
        if (creep) {
          roomCreeps.push(creep);
        }
        return roomCreeps;
      }, [] as Creep[]);

      const roomHaulingCapacity = calculateCapacity(roomHaulers);
      const roomCarryCapacity = (roomHaulingCapacity.carry ?? 0) * CARRY_CAPACITY;
      // TODO: could refresh this every X ticks or when a creep dies / spawns.
      carryCapacity.set(roomName, roomCarryCapacity);
    }

    // TODO: lets take a naive approach, 1 creep per ticket, unless creep can handle the ticket
    // How do we detect if a creep is in queue vs actually having been spawned. and once a creep as been spawned, we have to adjust the room carry capacity

    const neededHaulingCapacity = new Map<string, number>();
    // TODO: if we have requested a hauler, wait with requesting a new one untill that request has been fulfilled. because when it has been fulfilled we can calculate the increase in hauling power, should be per room though and what when we get multiple spawns?

    // TODO: acquire potential dropoff locations for all rooms for pickup requests
    // drop locations are storage, containers (non mining), link, extensions, spawn, other resource requests.
    // should spawn / extensions place resource requests themself?

    for (const [ticket, request] of tickets) {
      // do we handle 1 request at a time, or do we make something fancy that looks at all requests and does something accordingly?
      // once a creep has fulfilled a request do we sacrifice it, or do we keep it around to use for other requests?
      // How do we select the "proper" creep for a task? and what if a link can fulfill the request together with a creep?
      // a request could be split into sub requests when solving the request.
      // if pickup and source, scan for droppped energy around it, deposit it "somewhere" preferably, spawn, extension or storage or non mining container
      // if delivery collect from storage or container (or make creep that did a pickup deliver it. to save the storage roundtrip?)
      // e.g. upgraders or upgrade container requesting energy
      // if a creep can not deliver energy to spawn/extension/storage it can fulfill delivery requests?

      if (isPickupRequest(request.parameters)) {
        // pickup request
        if (request.parameters.pickup instanceof RoomPosition) {
          const position = request.parameters.pickup;
          // it's a position, scan for the requested type here or in a container
        } else {
          const pickup = deref(request.parameters.pickup);

          if (pickup) {
            const pickupRoom = pickup.room;

            const deliveryLocations: AnyStoreStructure[] = [];

            if (pickupRoom) {
              // TODO: using pickupRoom will not work with remotes.
              const roomDeliveryLocations = pickupRoom.find<AnyStoreStructure>(FIND_MY_STRUCTURES, {
                filter: structure => {
                  switch (structure.structureType) {
                    case STRUCTURE_SPAWN:
                    case STRUCTURE_EXTENSION:
                    case STRUCTURE_CONTAINER:
                      return true;
                  }
                  return false;
                }
              });
              deliveryLocations.push(...roomDeliveryLocations);
            }

            // it's a source, scan for the requested type as dropped resources or in mining container
            if (pickup instanceof Source) {
              // TODO: handle decay rate, and spawn haulers accordingly?
              // TODO: does anyone have this as a target?, if not assign someone, reduce available carry capacity accordingly.
              // calculate assigned capacity? how do we decide how much hauling capacity we need? I guess we need so much capacity that we are depositing 10e/t per source?
              // TODO: for now, find an available hauler, and assign it. if we can't find a hauler, request a new one.
              // TODO we adjust needed power when the request is made? that is probably a better fit.
              // but what about links/terminals then? maybe I should do some excel calculations/usecases
              // we don't know how we will fulfill a request when it is made. but we probably need to calculate a "route" for it.
              // for pickup, what about link mining?
              // booting up sheets, and noting down different cases w/ routes might not be a bad idea, we don't want to do this every tick though :thinking:

              const droppedResources = pickup.pos.findInRange(FIND_DROPPED_RESOURCES, 1, {
                filter: request.parameters.resource
              });
              // TOOD: mining container

              const deliveryRoomName = pickup.pos.roomName; // TODO: this will not work with remotes.
              let roomHaulers = haulers.get(deliveryRoomName);
              if (!roomHaulers) {
                roomHaulers = [];
                haulers.set(deliveryRoomName, roomHaulers);
              }
              const freeHaulers = roomHaulers?.reduce<Creep[]>((results, h) => {
                const freeHauler = deref(h);
                if (freeHauler && !freeHauler.memory.ticket && (freeHauler.store.getFreeCapacity() ?? 0) > 0) {
                  results.push(freeHauler);
                }
                return results;
              }, []);

              // TODO: we need to do something smart if we want to assign multiple haulers to the same target. early rcl we might want "swarm" logic
              const hauler = freeHaulers?.pop();
              if (hauler) {
                hauler.memory.ticket = ticket;
                // TODO: give the hauler a task
                // spin up a process for this creep with the goal of delivering resources
                kernel.registerProcess(
                  `${context.processName}:haul:${deliveryRoomName}`,
                  haulingProcess,
                  hauler.id,
                  droppedResources.map(r => r.id),
                  deliveryLocations.map(r => r.id)
                );
                request.creeps.push(hauler.id);
              } else {
                // TODO: request new haulers and return loop to start next tick, how do we decide how big it should be?
                let futureRoomHaulers = futureHaulers.get(deliveryRoomName);
                if (!futureRoomHaulers) {
                  futureRoomHaulers = [];
                  futureHaulers.set(deliveryRoomName, futureRoomHaulers);
                }

                if (futureRoomHaulers.length === 0) {
                  // TODO: only allowing 1 request per room is okay, as long as we only have 1 spawner
                  const creepTicket = requestCreep(
                    {
                      body: [WORK, CARRY, MOVE]
                    },
                    (resolvedCreepTicket, resolvedCreepName) => {
                      futureRoomHaulers = futureHaulers.get(deliveryRoomName);
                      futureRoomHaulers?.splice(futureRoomHaulers.indexOf(resolvedCreepTicket), 1);
                      const resolvedCreep = Game.creeps[resolvedCreepName];
                      if (resolvedCreep) {
                        roomHaulers = haulers.get(deliveryRoomName);
                        roomHaulers?.push(resolvedCreep.id);
                        context.info(`${resolvedCreep.id} pushed to roomHaulers`);
                      }
                    }
                  );

                  futureRoomHaulers.push(creepTicket);
                }

                break;
              }
            }
            // it's a creep/structure/resource, pick it up.
          }
        }
      } else {
        // TODO: delievery request
      }
    }

    const neededHaulers = 4;
    // 1 per source, one for upgraders, one for towers. how do we scale/determine this in a sensible way?
    // it has got to be a question about how much needs to be hauled, how fast(ticks to fulfill request)
    // we might need to calculate our current carry capacity vs needed capacity
    // should a request be accompanied by an amount/tick?

    yield;
  }
}
// a delivery request can specify where it wants it from
// a pickup can specify where it wants it delivered

// if a specific target is not supplied, we fetch / deliver it from anywhere.

// This process is responsible for figuring out how to accomplish theese requests

// scenarios
// move dropped resources near source to any type of storage in local room
// move resources from container near source to any type of storage in local room
// move resource from link to another link, then move resource to any type of stoage in local room
// move resource to terminal
// move resource from terminal
// factories, labs and so forth.

// Should a request be verified, e.g. if we want to pickup 2k energy from a container that does not have 2k energy

export interface DeliveryRequest {
  resource: ResourceConstant;
  amount: number;
  destination: AnyStoreStructure | Creep; // | RoomPosition; // not sure about roomposition, but it would allow us to drop a resource somewhere
}
// do we want requests to be able to requeue itself?

export interface PickupRequest {
  resource: ResourceConstant;
  amount: number;
  pickup: Id<Source | Resource | AnyStoreStructure | Creep> | RoomPosition;
}

function isPickupRequest(object: any): object is PickupRequest {
  return "pickup" in object;
}

// When we start with mining containers how do we make sure that it is emptied in time.
// perhaps we need to be able to indicate a request as a dedicated request?
// can a single hauler move enough energy from both containers once the hauler reaches a big enough size?
// we should probably pickup 1500 energy from a container,then it should never fill in the sources lifetime.

export function requestResource(o: DeliveryRequest | PickupRequest, onSuccess: (ticket: string) => void): string {
  const ticket = uuidv4();

  tickets.set(ticket, { creeps: [], parameters: o, onSuccess });
  return ticket;
}

// How do we prevent making the same request repeatedly? sure we can sleep the thing making the request. but if it has not been fulfilled, then what?

// https://en.wikipedia.org/wiki/Logistics
// point of origin
// point of consumption

/*
Inbound logistics is one of the primary processes of logistics concentrating on purchasing and arranging the inbound movement of materials, parts, or unfinished inventory from suppliers to manufacturing or assembly plants, warehouses, or retail stores.

Outbound logistics is the process related to the storage and movement of the final product and the related information flows from the end of the production line to the end-user.
 */
// Yeah I was considering if empire wide decisions / settings could be applied to the logistics system so when the logistics systems loops over requests it could go "nope"

// mining process with no container, request pickup of N energy every X ticks
// with container request pickup of N(1500) energy every X ticks
// if the expected amount to pickup is not present, it was either stolen or decayed
// what about partially filled requests? should it wait?
// http://wwwmayr.informatik.tu-muenchen.de/konferenzen/Jass08/courses/2/berseneva/paper_berseneva.pdf

type Capacity = { [key in BodyPartConstant]?: number };
function calculateCapacity(creeps: Creep[]): Capacity {
  return creeps.reduce((capacity, creep) => {
    calculateCreepCapacity(
      creep.body.map(body => body.type),
      capacity
    );

    return capacity;
  }, {} as Capacity);
}

function calculateCreepCapacity(body: BodyPartConstant[], initialCapacity: Capacity): Capacity {
  return body.reduce((capacity, part) => {
    capacity[part] = (capacity[part] || 0) + 1;

    return capacity;
  }, initialCapacity);
}

function* haulingProcess<T extends any[]>(
  context: ProcessContext<T>,
  creepId: Id<Creep>,
  resourceIds: Id<Resource>[],
  deliveryLocationIds: Id<AnyStoreStructure>[]
): ProcessGeneratorResult {
  while (true) {
    // TODO: when the creep dies, we should remove it from it's assigned request, perhaps remove it when TTL = 1? what if someone kills it though? we might need to validate assigned creeps when we loop requests.
    let creep = deref(creepId);

    if (creep) {
      const resources = derefRoomObjects(resourceIds);

      for (const resource of resources) {
        if (!creep) {
          break;
        }

        yield* moveToTarget(creep.name, resource.id);
        creep = deref(creepId);
        const resource2 = deref(resource.id);

        if (creep && resource2) {
          creep.pickup(resource2);
          yield; // next tick
        }

        const deliveryLocations = derefRoomObjects(deliveryLocationIds);
        creep = deref(creepId);
        // move to delivery
        while (creep && creep.store.getUsedCapacity() > 0) {
          const deliveryTarget = deliveryLocations.find(structure => {
            const store = structure.store as GenericStore; // getFreeCapacity does not accept all resouce types, depending on structure
            return store?.getFreeCapacity(resource.resourceType) ?? 0 > 0;
          });

          if (creep && deliveryTarget) {
            yield* moveToTarget(creep.name, deliveryTarget.id);
            const deliveryTarget2 = deref<AnyStoreStructure>(deliveryTarget.id);
            creep = deref(creepId);

            if (creep && deliveryTarget2) {
              creep.transfer(deliveryTarget2, resource.resourceType);
            }
          }

          yield;

          creep = deref(creepId);
        }
      }
    }

    yield; // next tick
  }
}
