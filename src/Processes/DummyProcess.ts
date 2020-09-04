import { ProcessContext, ProcessGeneratorResult, kernel } from "../Kernel/Kernel";

kernel.registerProcess("DummyProcess", dummyProcess);

function* dummyProcess<T extends any[]>(context: ProcessContext<T>): ProcessGeneratorResult {
  // never ending process
  while (true) {
    context.info("Hello from dummy process, yielding");
    yield true;
    context.info("should be done");
    yield;

    break;
  }
}

// TODO: Example processes for a process that is spread over multiple ticks, one that runs multiple times during the same tick.
