import type { RequestUser } from "./request-user.js";

export interface RequestWithUser {
  headers: Record<string, string | string[] | undefined>;
  user?: RequestUser;
}
