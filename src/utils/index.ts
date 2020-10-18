// https://stackoverflow.com/questions/1349404/generate-random-string-characters-in-javascript
export function uuidv4(): string {
  // https://stackoverflow.com/questions/105034/how-to-create-guid-uuid
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    // eslint-disable-next-line no-bitwise
    const r = (Math.random() * 16) | 0;
    // eslint-disable-next-line no-bitwise
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// https://github.com/bencbartlett/Overmind/blob/master/src/utilities/utils.ts
export function printRoomName(roomName: string): string {
  return '<a href="#!/room/' + Game.shard.name + "/" + roomName + '">' + roomName + "</a>";
}

export function color(str: string, color: string): string {
  return `<font color='${color}'>${str}</font>`;
}

/**
 * Compute an exponential moving average
 */
export function exponentialMovingAverage(current: number, avg: number | undefined, window: number): number {
  return (current + (avg || 0) * (window - 1)) / window;
}

/**
 * Compute an exponential moving average for unevenly spaced samples
 */
export function irregularExponentialMovingAverage(current: number, avg: number, dt: number, window: number): number {
  return (current * dt + avg * (window - dt)) / window;
}
