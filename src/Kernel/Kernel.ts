/* eslint-disable max-classes-per-file */
import { LogLevel, Logger } from "../Logger";

const log = new Logger("[Kernel]");

export type ProcessGeneratorResult = Generator<boolean | undefined>;
export type ProcessGenerator<T extends any[]> = (context: ProcessContext<T>, ...args: T) => ProcessGeneratorResult;

export class ProcessContext<T extends any[]> {
  public logger: Logger;
  private threads: Set<Thread>; // maybe?
  private kernel: Kernel<T>;
  public processName: string;
  private fn: ProcessGeneratorResult;

  public constructor(_kernel: Kernel<T>, processName: string, fn: ProcessGenerator<T>, ...args: T) {
    this.logger = new Logger(`[${processName}]`);
    this.kernel = _kernel;
    this.threads = new Set<Thread>();
    // add main thread
    this.fn = fn(this, ...args);
    this.processName = processName;
  }

  public next(val?: boolean): IteratorResult<any, boolean> {
    // log.info(`${this.processName}.next called`);
    // if (val === true) {
    //   //   const { value } = this.pidGen.next();
    //   //   this.scheduler = loopScheduler(this.threads, value);
    //   return { done: false, value: false };
    // }
    // const { done } = this.fn.next();
    // return { done: false, value: !done };
    return this.fn.next();
  }

  //   [Symbol.iterator]() {
  //     return this;
  //   }

  // public log(logLevel: LogLevel, message: string): void {
  //   this.logger.log(logLevel, message);
  // }
  public debug(message: string): void {
    this.logger.debug(message);
  }

  public critical(message: string): void {
    this.logger.critical(message);
  }

  public info(message: string): void {
    this.logger.info(message);
  }

  public error(error: string | Error): void {
    this.logger.error(error);
  }
}
type ProcessMap<T extends any[]> = Map<string, ProcessContext<T>>;

class Kernel<T extends any[]> {
  private threads: Map<any, any>;
  private processes: ProcessMap<T>;

  public constructor() {
    log.info(`initialzing kernel`);
    this.threads = new Map();
    this.processes = new Map<string, ProcessContext<T>>();
  }

  public hasProcess(key: string): boolean {
    return this.processes.has(key);
  }

  public registerThread() {
    // inside a process there can be threads
  }

  public registerProcess<T extends any[]>(processName: string, fn: ProcessGenerator<T>, ...args: T) {
    if (!this.processes.has(processName)) {
      log.info(`Registering ${processName}`);
      this.processes.set(processName, new ProcessContext(this, processName, fn, ...args));
    }
  }

  public tick() {
    // log.info(`Current game tick is ${Game.time}`);
    if (Game.cpu.bucket < 1000) {
      log.critical(`[Bucket] ${Game.cpu.bucket} < 1000 waiting for more bucket`);
      return;
    }
    // TODO: scheduler
    // do we want to chop up our cpu in mini "buckets" to limit each process after a specific time to allow other processes to run?
    // https://en.wikipedia.org/wiki/PID_controller
    // https://www.csimn.com/CSI_pages/PIDforDummies.html
    const limit = Game.cpu.limit;
    const scheduler = loop(this.processes, limit);
    let count = 0;
    for (const processName of scheduler) {
      if (typeof processName === "string") {
        // process stopped,
        this.processes.delete(processName);
      }

      if (processName) {
        log.info(`tick ${processName}`);
      }
      count++;
    }

    // TODO: add to stats
    // log.info(
    //   `CPU Limit for tick: ${limit.toFixed(2)}/${Game.cpu.limit} Bucket: ${Game.cpu.bucket} Used ${Game.cpu.getUsed()}`
    // );
    // // // cnt < this.threads.size ? LogLevel.WARN : LogLevel.INFO, // TODO: log
    // log.info(`Ran ${this.processes.size} processes with a total of ${count} iterations`);
  }
}

class Thread {}

export function* sleep(ticks: number): ProcessGeneratorResult {
  const end = Game.time + ticks;
  while (Game.time < end) {
    yield;
  }
}

function* loop<T extends any[]>(processes: ProcessMap<T>, limit: number): Generator<string | undefined> {
  const queue = Array.from(processes); // shuffle them?
  const cpu: { [index: string]: number } = {};
  const iterations: { [index: string]: number } = {};

  // log.info(`${queue.length} processes`);
  for (const process of queue) {
    const processName = process[0];
    const context = process[1];

    try {
      // log.info(`${processName}.next`);
      const start = Game.cpu.getUsed();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const { done, value } = context.next();
      const end = Game.cpu.getUsed();
      const dur = end - start;
      // log.info(`${processName} used ${dur} cpu`);

      iterations[processName] = cpu[processName] || 0;
      iterations[processName]++;

      cpu[processName] = cpu[processName] || 0;
      cpu[processName] += dur;

      if (!done && value === true) {
        // move to end of queue more procesign to be done
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        log.info(`${processName} not done yet ${typeof value} ${value}`);
        queue.push(process);
      }

      if (done) {
        // threads?
        log.info(`${processName} done`);
        processes.delete(processName);
      }
    } catch (error) {
      //   log.error

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      log.critical(`${processName} failed with an error`);
      log.error(error);
      yield processName;
    }

    if (Game.cpu.getUsed() > limit) {
      log.info(`CPU Limit reached`);
      const report = queue
        .slice(queue.lastIndexOf(process))
        //   .map([i] => [i[0], cpu[i[0]]])
        //   .filter(i => i[1] > 2)
        //   .map(([a, b]) => `${a}: ${b.toFixed(3)}`);
        .map(([a, b]) => `${a} `);
      log.info(`remaining: ${report.join(",")}`);
      break;
    }
    yield;
  }
}

export const kernel = new Kernel();
