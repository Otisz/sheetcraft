import * as z from "zod";
import { APIReferenceSchema } from "@/features/dnd/catalog/schemas/common";

export const AbilityScoreSchema = z.strictObject({
  index: z.string(),
  name: z.string(),
  full_name: z.string(),
  desc: z.array(z.string()),
  skills: z.array(APIReferenceSchema),
  url: z.string(),
});
