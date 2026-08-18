import { redirect } from "next/navigation";

// /login era un señuelo (notFound) mientras fintrk.app era un producto
// público con el formulario escondido en /gate/e. En una instancia
// self-hosted esa ofuscación solo consigue que el dueño se quede fuera al
// escribir la URL obvia, así que redirige al formulario real.
export default function LoginPage() {
  redirect("/gate/e");
}
