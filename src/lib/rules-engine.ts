import { sql } from "./db";

interface Rule {
  id: number;
  name: string;
  match_type: "contains" | "exact" | "regex" | "account";
  match_value: string;
  category: string;
  expense_type: string | null;
  priority: number;
  is_active: number;
  times_applied: number;
}

const CATASTROPHIC_REGEX = /(\(.*[+*].*\))[+*]|\(\?[^)]*\(\?/;
const MAX_REGEX_LENGTH = 200;

function isSafeRegex(pattern: string): boolean {
  if (pattern.length > MAX_REGEX_LENGTH) return false;
  if (CATASTROPHIC_REGEX.test(pattern)) return false;
  return true;
}

export async function applyRules(
  description: string,
  account: string | null,
  userId: number
): Promise<{ category: string; expense_type: string | null } | null> {
  const rules = await sql(
    "SELECT * FROM categorization_rules WHERE is_active = 1 AND user_id = $1 ORDER BY priority DESC",
    [userId]
  ) as unknown as Rule[];

  for (const rule of rules) {
    let match = false;
    switch (rule.match_type) {
      case "contains":
        match = description.toLowerCase().includes(rule.match_value.toLowerCase());
        break;
      case "exact":
        match = description.toLowerCase() === rule.match_value.toLowerCase();
        break;
      case "regex":
        try {
          if (!isSafeRegex(rule.match_value)) {
            match = false;
            break;
          }
          match = new RegExp(rule.match_value, "i").test(description);
        } catch {
          match = false;
        }
        break;
      case "account":
        match = account?.toLowerCase() === rule.match_value.toLowerCase();
        break;
    }
    if (match) {
      await sql(
        "UPDATE categorization_rules SET times_applied = times_applied + 1 WHERE id = $1",
        [rule.id]
      );
      return { category: rule.category, expense_type: rule.expense_type };
    }
  }
  return null;
}
