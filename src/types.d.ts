// example declaration file - remove these and add your own custom typings

// memory extension samples
interface CreepMemory {
  role?: string;
  room?: string;
  working?: boolean;
  target?: Id<RoomObject>;
  task: string;
}

interface Memory {
  uuid: number;
  log: any;
  logLevel: import("Logger").LogLevel;
}

// `global` extension samples
declare namespace NodeJS {
  interface Global {
    log: any;
  }
}
