import { ErrorMapper } from "utils/ErrorMapper";

export enum LogLevel {
  DEBUG = "debug",
  INFO = "info",
  WARNING = "warning",
  CRITICAL = "critical",
  ERROR = "error"
}

export class Logger {
  private prefix: string;
  public constructor(prefix: string) {
    this.prefix = prefix;
  }

  public debug(message: string): void {
    if (Memory.logLevel === LogLevel.DEBUG) {
      this.log(LogLevel.DEBUG, message);
    }
  }

  public info(message: string): void {
    this.log(LogLevel.INFO, message);
  }
  public warning(message: string): void {
    this.log(LogLevel.WARNING, message);
  }
  public critical(message: string): void {
    this.log(LogLevel.CRITICAL, message);
  }
  public error(error: string | Error): void {
    this.log(LogLevel.ERROR, `<span style='color:red'>${_.escape(ErrorMapper.sourceMappedStackTrace(error))}</span>`);
  }
  public log(logLevel: LogLevel, message: string): void {
    console.log(`[${Game.time}] [${logLevel}] ${this.prefix} ${message}`);
  }
}
