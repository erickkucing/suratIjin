import { db } from "@/db";
import { classes } from "@/db/schema";
import { eq } from "drizzle-orm";
import { generateRandomClassCode } from "./string-utils";

/**
 * Generates a unique 3-character random letter slug for a class.
 * Ensures collision-free code against existing classes in database.
 */
export async function generateUniqueClassSlug(): Promise<string> {
  for (let attempt = 0; attempt < 50; attempt++) {
    const candidate = generateRandomClassCode(3);
    const existing = await db.query.classes.findFirst({
      where: eq(classes.slug, candidate),
    });
    if (!existing) return candidate;
  }
  return generateRandomClassCode(4);
}
