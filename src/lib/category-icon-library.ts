// Catalogo unificado de iconos disponibles cuando el user crea una categoria
// custom. Cada icono apunta al nombre exportado por lucide-react. El render
// sigue pasando por <CategoryIcon icon={key} /> que mira ICON_MAP en
// components/category-icon.tsx — los nombres aqui DEBEN coincidir con las
// claves de ICON_MAP, si no el icono cae al fallback CircleDot.
//
// Si anades un icono nuevo aqui, anade tambien la clave a ICON_MAP en
// components/category-icon.tsx (importando el simbolo desde lucide-react).

export interface CategoryIconOption {
  key: string;       // Nombre en lucide-react (Home, Coffee, Pizza, ...)
  group: string;     // Grupo logico para agrupar visualmente en el picker
  hint?: string;     // Texto opcional para tooltip / accesibilidad
}

export const CATEGORY_ICON_LIBRARY: CategoryIconOption[] = [
  // Hogar
  { key: "Home", group: "home", hint: "Hogar" },
  { key: "Sofa", group: "home", hint: "Mobiliario" },
  { key: "Lightbulb", group: "home", hint: "Luz / suministros" },
  { key: "Wrench", group: "home", hint: "Reparaciones" },
  { key: "Hammer", group: "home", hint: "Bricolaje" },

  // Comida y bebida
  { key: "UtensilsCrossed", group: "food", hint: "Comer fuera" },
  { key: "Coffee", group: "food", hint: "Cafe" },
  { key: "Wine", group: "food", hint: "Bebidas" },
  { key: "Pizza", group: "food", hint: "Comida rapida" },
  { key: "ShoppingCart", group: "food", hint: "Supermercado" },

  // Transporte
  { key: "Car", group: "transport", hint: "Coche" },
  { key: "Fuel", group: "transport", hint: "Gasolina" },
  { key: "Plane", group: "transport", hint: "Vuelos" },
  { key: "Train", group: "transport", hint: "Tren" },
  { key: "Bike", group: "transport", hint: "Bici" },
  { key: "Bus", group: "transport", hint: "Bus / metro" },

  // Salud y bienestar
  { key: "Heart", group: "health", hint: "Salud" },
  { key: "Pill", group: "health", hint: "Farmacia" },
  { key: "Stethoscope", group: "health", hint: "Medico" },
  { key: "Dumbbell", group: "health", hint: "Deporte / gym" },

  // Ocio y entretenimiento
  { key: "Film", group: "leisure", hint: "Cine" },
  { key: "Music", group: "leisure", hint: "Musica" },
  { key: "Gamepad2", group: "leisure", hint: "Videojuegos" },
  { key: "Camera", group: "leisure", hint: "Fotografia" },
  { key: "Ticket", group: "leisure", hint: "Eventos" },

  // Compras y regalos
  { key: "ShoppingBag", group: "shopping", hint: "Compras" },
  { key: "Shirt", group: "shopping", hint: "Ropa" },
  { key: "Gift", group: "shopping", hint: "Regalos" },

  // Tecnologia y comunicaciones
  { key: "Laptop", group: "tech", hint: "Tecnologia" },
  { key: "Smartphone", group: "tech", hint: "Movil" },
  { key: "Headphones", group: "tech", hint: "Audio" },
  { key: "Wifi", group: "tech", hint: "Internet" },

  // Trabajo y educacion
  { key: "Briefcase", group: "work", hint: "Trabajo" },
  { key: "Building2", group: "work", hint: "Oficina" },
  { key: "Users", group: "work", hint: "Equipo / clientes" },
  { key: "Mail", group: "work", hint: "Correo" },
  { key: "GraduationCap", group: "education", hint: "Educacion" },
  { key: "BookOpen", group: "education", hint: "Libros" },
  { key: "PenTool", group: "education", hint: "Cursos" },

  // Finanzas
  { key: "CreditCard", group: "finance", hint: "Tarjeta" },
  { key: "Wallet", group: "finance", hint: "Cartera" },
  { key: "PiggyBank", group: "finance", hint: "Ahorro" },
  { key: "TrendingUp", group: "finance", hint: "Inversiones" },
  { key: "Coins", group: "finance", hint: "Comisiones" },
  { key: "Banknote", group: "finance", hint: "Efectivo" },
  { key: "Receipt", group: "finance", hint: "Facturas" },

  // Viajes y mascotas
  { key: "MapPin", group: "travel", hint: "Lugares" },
  { key: "Mountain", group: "travel", hint: "Aventura" },
  { key: "Tent", group: "travel", hint: "Camping" },
  { key: "PawPrint", group: "travel", hint: "Mascota" },

  // Otros
  { key: "Star", group: "other", hint: "Favorito" },
  { key: "Sparkles", group: "other", hint: "Capricho" },
  { key: "Flame", group: "other", hint: "Urgente" },
  { key: "Tag", group: "other", hint: "Etiqueta" },
  { key: "ArrowLeftRight", group: "other", hint: "Transferencia" },
  { key: "MoreHorizontal", group: "other", hint: "Otros" },
];

// Paleta de colores presets ofrecidos al user al crear categoria. Verde
// bosque (#2D6A4F) primero por alineacion con la marca. Morado/violet
// excluidos a proposito — se asocian a estética "muy IA".
export const CATEGORY_COLOR_PRESETS: string[] = [
  "#2D6A4F", // verde bosque (primary marca)
  "#3B82F6", // azul
  "#0EA5E9", // cyan
  "#14B8A6", // teal
  "#F59E0B", // amarillo
  "#F4A261", // naranja calido
  "#E76F51", // naranja quemado
  "#EF4444", // rojo
  "#EC4899", // rosa
  "#71717A", // gris
];
