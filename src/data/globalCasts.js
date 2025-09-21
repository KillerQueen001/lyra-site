import { xrayDemo } from "./xrayDemo";

export const allCasts = Array.from(
  new Map(
    xrayDemo.map((x) => [x.id, { id: x.id, name: x.name, role: x.role, photo: x.photo }])
  ).values()
);