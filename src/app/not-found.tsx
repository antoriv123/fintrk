import Link from "next/link";
import { Home } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 px-6 text-center">
      <div className="text-6xl font-bold text-muted-foreground/30">404</div>
      <div>
        <p className="text-xl font-bold mb-2">Pagina no encontrada</p>
        <p className="text-muted-foreground text-sm max-w-xs mx-auto">
          La pagina que buscas no existe o fue movida.
        </p>
      </div>
      <Button asChild className="gap-2">
        <Link href="/dashboard">
          <Home size={16} />
          Ir al inicio
        </Link>
      </Button>
    </div>
  );
}
