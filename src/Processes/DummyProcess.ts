import { ProcessContext, kernel } from "../Kernel/Kernel";

// TODO: restartthread on register?
kernel.registerProcess("DummyProcess", dummyProcess);

function* dummyProcess(context: ProcessContext): Generator {
  // never ending process
  while (true) {
    context.info("Hello from dummy process, yielding");
    yield true;
    context.info("should be done");
    yield;

    break;
  }
}
