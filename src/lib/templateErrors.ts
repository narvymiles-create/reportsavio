/** Storage and PostgREST errors are often plain objects, not Error instances. */
export function templateErrorMessage(error: unknown): string {
  if (typeof error === "string" && error.trim()) return error;
  if (error && typeof error === "object") {
    const detail = error as { message?: unknown; error?: unknown; details?: unknown; hint?: unknown; code?: unknown };
    const message = [detail.message, detail.error, detail.details].find(value => typeof value === "string" && value.trim());
    if (typeof message === "string") {
      if (/row.level security|permission denied|not authorized/i.test(message)) return "You do not have permission to manage templates for this school. Sign in with a school administrator account.";
      if (/bucket.*not found/i.test(message)) return "Template storage is unavailable. Please try again later.";
      if (/maximum.*size|exceeded.*size|payload too large/i.test(message)) return "The template exceeds the storage file-size limit. Choose a smaller file.";
      if (/fetch|network|connection/i.test(message)) return "The upload could not reach storage. Check your connection and try again.";
      return message;
    }
  }
  return "The template action could not be completed. Please try again.";
}