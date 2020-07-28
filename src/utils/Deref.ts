export const deref = <T>(id: Id<T>): T | false => {
  const roomObject = Game.getObjectById(id);
  if (roomObject) {
    return roomObject;
  }
  return false;
};

export const derefRoomObjects = <T>(list: Id<T>[]): T[] => {
  const result = list.reduce<T[]>((results, id) => {
    const ro = deref(id);
    if (ro) {
      results.push(ro);
    }
    return results;
  }, []);

  return result;
};
