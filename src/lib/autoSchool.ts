import { supabase } from "@/integrations/supabase/client";

/** One in-flight school creation per signed-in user, so several protected pages can't create two schools. */
const pending = new Map<string, Promise<string | null>>();

/**
 * Creates the signed-in user's school without asking for details first.
 * The school starts as "My School"; the admin fills in its real details on the School Info page.
 * Returns an error message, or null on success.
 */
export function ensureSchoolForUser(userId: string): Promise<string | null> {
  let p = pending.get(userId);
  if (!p) {
    p = (async () => {
      const { error } = await supabase.rpc("create_school_for_current_user" as any, {
        _name: "My School", _email: null, _phone: null, _address: null,
      });
      if (error && !/already belongs to a school/i.test(error.message)) {
        pending.delete(userId);
        return error.message;
      }
      return null;
    })();
    pending.set(userId, p);
  }
  return p;
}
