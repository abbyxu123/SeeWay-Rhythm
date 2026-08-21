import { z } from "zod";

export const MemoryScopeSchema = z.enum([
  "identity",
  "preferences",
  "timeline",
  "finance",
  "career",
  "relationship",
]);

export const ProfileScopeSchema = z.enum([
  "birth-data",
  "current-location",
  "finance-profile",
]);

export type MemoryScope = z.infer<typeof MemoryScopeSchema>;
export type ProfileScope = z.infer<typeof ProfileScopeSchema>;
