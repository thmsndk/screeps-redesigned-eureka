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
// https://stackoverflow.com/questions/1349404/generate-random-string-characters-in-javascript
