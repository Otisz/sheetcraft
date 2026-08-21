import * as z from "zod";
import { APIReferenceSchema } from "@/features/dnd/catalog/schemas/common";

export const SkillSchema = z.strictObject({
  index: z.string(),
  name: z.string(),
  desc: z.array(z.string()),
  ability_score: APIReferenceSchema,
  url: z.string(),
});
