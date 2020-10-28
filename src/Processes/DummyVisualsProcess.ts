import { ProcessContext, ProcessGeneratorResult, YieldAction, kernel } from "../Kernel";

kernel.registerProcess("DummyVisualsProcess", dummyVisualsProcess);

function* dummyVisualsProcess<T extends any[]>(context: ProcessContext<T>): ProcessGeneratorResult {
  // never ending process
  while (true) {
    // Room Visual Test

    // Room Visual with RoomVisual Lib

    // Map Visual Test https://docs.screeps.com/api/#Game.map-visual
    const roomPosition1 = new RoomPosition(25, 25, "W0N0");
    // const roomPosition2 = new RoomPosition(26, 26, "W2N4");
    // const roomPosition2 = new RoomPosition(49, 49, "W2N4");
    Game.map.visual.line(roomPosition1, new RoomPosition(49, 49, "W2N4"), { color: "#ff0000", lineStyle: "dashed" });
    Game.map.visual.line(roomPosition1, new RoomPosition(0, 49, "W2N4"), { color: "#00ff00", lineStyle: "dotted" });
    Game.map.visual.line(roomPosition1, new RoomPosition(49, 0, "W2N4"), { color: "#0000ff", lineStyle: "solid" });
    Game.map.visual.circle(new RoomPosition(20, 21, "W2N4"));
    Game.map.visual.circle(new RoomPosition(25, 25, "W0N0"), {
      fill: "transparent",
      radius: NUKE_RANGE * 50,
      stroke: "#ff0000",
      lineStyle: "dashed"
    });

    Game.map.visual.rect(new RoomPosition(25, 25, "W2N5"), 11, 11, {
      fill: "#00FF00",
      stroke: "#ff0000"
    });

    // the max efficiency area of the tower
    for (const room of Object.values(Game.rooms)) {
      const towers = room.find(FIND_MY_STRUCTURES, { filter: { structureType: STRUCTURE_TOWER } });

      towers.forEach(tower => {
        Game.map.visual.rect(new RoomPosition(tower.pos.x - 5, tower.pos.y - 5, tower.pos.roomName), 11, 11, {
          fill: "transparent",
          stroke: "#ff0000"
        });
      });
    }

    const points = [];
    points.push(roomPosition1);
    points.push(new RoomPosition(20, 21, "W4N4"));
    points.push(new RoomPosition(20, 21, "W3N4"));
    Game.map.visual.poly(points, { fill: "aqua" });

    Game.map.visual.text("Target Target Target Target Target Target\nTarget\n💥", new RoomPosition(11, 14, "W2N4"), {
      color: "#FF0000",
      fontSize: 10
    });

    yield YieldAction.NEXT_TICK;
  }
}
