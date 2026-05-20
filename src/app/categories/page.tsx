import { redirect } from "next/navigation";

// Fusionado con /budgets desde 2026-04-20. La vista de categorias vive ahora
// dentro del card de presupuesto + breakdown del dashboard. Mantenemos la ruta
// para no romper enlaces antiguos (bookmarks, push notifications historicas).
export default function CategoriesRedirect() {
  redirect("/budgets");
}
