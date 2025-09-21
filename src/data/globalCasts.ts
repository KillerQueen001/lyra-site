import type { XRayItem } from "../components/XRayPanel";
import { xrayDemo } from "./xrayDemo";

export type CastBrief = {
  id: string;
  name: string;
  role: string;
  photo: string;
};

export const allCasts: CastBrief[] = Array.from(
  new Map(
    (xrayDemo as XRayItem[]).map((x) => [x.id, { id: x.id, name: x.name, role: x.role, photo: x.photo }])
  ).values()
);
