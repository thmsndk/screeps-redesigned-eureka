import { ProcessContext, ProcessGeneratorResult, kernel } from "../Kernel/Kernel";

// TODO: restartthread on register?
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
