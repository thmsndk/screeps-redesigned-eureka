import { ProcessContext, ProcessGeneratorResult, kernel } from "../Kernel";

kernel.registerProcess("SpawnProcess", spawnProcess);

// TODO: A spawn process that can handle multiple spawns, the ability to cancel a request spawn request, perhaps a callback, perhaps intershard?
// TODO: we need to have requests, for now we can just utilize fifo, and an "emergency" queue that is checked first.

interface SpawnRequestBase {
  name?: string;
  opts?: SpawnOptions;
}

interface SpawnRequest extends SpawnRequestBase {
  body: BodyPartConstant[];
}

interface ScalingSpawnRequest extends SpawnRequestBase {
  template: BodyPartConstant[];
  max: number;
}

const queue = new Map<
  string,
  { parameters: SpawnRequest | ScalingSpawnRequest; onSuccess: (ticket: string) => void }
>();
function* spawnProcess<T extends any[]>(context: ProcessContext<T>): ProcessGeneratorResult {
  // never ending process
  while (true) {
    const spawns = Object.values(Game.spawns);
    const energyUsed = new Map<string, number>();
    for (const [ticket, request] of queue) {
      let body: BodyPartConstant[];
      if (isScalingSpawnRequest(request.parameters)) {
        // TODO: scale body parts up
        body = request.parameters.template;
      } else {
        body = request.parameters.body;
      }

      const name = request.parameters.name || Game.time.toString();

      const cost = body.reduce((sum, part) => (sum += BODYPART_COST[part]), 0);

      // TODO: determine what spawn to use?
      for (const spawn of spawns) {
        if (spawn.spawning) {
          continue;
        }

        // TODO: #9 take used energy this tick into consideration when determining available energy
        if (spawn.room.energyAvailable < cost) {
          continue;
        }

        const roomEnergyUsed = energyUsed.get(spawn.room.name) ?? 0;
        energyUsed.set(spawn.room.name, roomEnergyUsed + cost);

        spawn.spawnCreep(body, name, request.parameters.opts);
        queue.delete(ticket);
        // TODO: #10 spawn a process that triggers on success once it is finished spawning?
        request.onSuccess(ticket);

        break;
      }
    }
    yield;
  }
}

function isScalingSpawnRequest(object: any): object is ScalingSpawnRequest {
  return "template" in object && "max" in object;
}

// TODO: making this a promise or something would be really neat
export function requestCreep(request: SpawnRequest | ScalingSpawnRequest, onSuccess: (ticket: string) => void): string {
  // TODO: support for fulfilling requests from other rooms.
  // TODO: requests should have an objective reference?

  const ticket = new Date().getTime().toString(); // TODO: get a better ticket

  queue.set(ticket, { parameters: request, onSuccess });

  // TODO: A ticket should either be a creep name or a ticket, so you can exchange the ticket for a creepName or creepId at a later point in time.
  return ticket;
}
