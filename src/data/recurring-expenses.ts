export interface RecurringExpenseInfo {
  slug: string;
  name: string;
  icon: string;
  category: string;
  defaultAmount: Record<string, number>;
}

export const RECURRING_EXPENSES: RecurringExpenseInfo[] = [
  {
    slug: "alquiler",
    name: "Alquiler",
    icon: "🏠",
    category: "vivienda",
    defaultAmount: {
      EUR: 750,
      MXN: 8000,
      COP: 1500000,
      ARS: 200000,
      CLP: 400000,
    },
  },
  {
    slug: "telefono",
    name: "Teléfono",
    icon: "📱",
    category: "servicios",
    defaultAmount: {
      EUR: 25,
      MXN: 300,
      COP: 50000,
      ARS: 8000,
      CLP: 15000,
    },
  },
  {
    slug: "luz-gas",
    name: "Luz/Gas",
    icon: "⚡",
    category: "servicios",
    defaultAmount: {
      EUR: 80,
      MXN: 1000,
      COP: 200000,
      ARS: 30000,
      CLP: 50000,
    },
  },
  {
    slug: "internet",
    name: "Internet",
    icon: "🌐",
    category: "servicios",
    defaultAmount: {
      EUR: 35,
      MXN: 500,
      COP: 80000,
      ARS: 12000,
      CLP: 25000,
    },
  },
  {
    slug: "seguro",
    name: "Seguro",
    icon: "🛡️",
    category: "seguros",
    defaultAmount: {
      EUR: 60,
      MXN: 800,
      COP: 150000,
      ARS: 20000,
      CLP: 40000,
    },
  },
  {
    slug: "transporte",
    name: "Transporte",
    icon: "🚌",
    category: "transporte",
    defaultAmount: {
      EUR: 40,
      MXN: 600,
      COP: 100000,
      ARS: 15000,
      CLP: 30000,
    },
  },
];
