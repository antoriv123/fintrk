export interface SubscriptionInfo {
  slug: string;
  name: string;
  icon: string;
  defaultPrice: Record<string, number>;
}

export const POPULAR_SUBSCRIPTIONS: SubscriptionInfo[] = [
  {
    slug: "netflix",
    name: "Netflix",
    icon: "🎬",
    defaultPrice: {
      EUR: 13.99,
      MXN: 199,
      COP: 38900,
      ARS: 3599,
      CLP: 9490,
    },
  },
  {
    slug: "spotify",
    name: "Spotify",
    icon: "🎵",
    defaultPrice: {
      EUR: 10.99,
      MXN: 129,
      COP: 24900,
      ARS: 2499,
      CLP: 5490,
    },
  },
  {
    slug: "icloud",
    name: "iCloud",
    icon: "☁️",
    defaultPrice: {
      EUR: 2.99,
      MXN: 49,
      COP: 5900,
      ARS: 599,
      CLP: 1490,
    },
  },
  {
    slug: "youtube-premium",
    name: "YouTube Premium",
    icon: "▶️",
    defaultPrice: {
      EUR: 13.99,
      MXN: 129,
      COP: 23900,
      ARS: 2899,
      CLP: 7490,
    },
  },
  {
    slug: "amazon-prime",
    name: "Amazon Prime",
    icon: "📦",
    defaultPrice: {
      EUR: 5.99,
      MXN: 99,
      COP: 14900,
      ARS: 1299,
      CLP: 4490,
    },
  },
  {
    slug: "disney-plus",
    name: "Disney+",
    icon: "✨",
    defaultPrice: {
      EUR: 8.99,
      MXN: 159,
      COP: 23900,
      ARS: 2499,
      CLP: 6490,
    },
  },
  {
    slug: "hbo-max",
    name: "HBO Max",
    icon: "🎭",
    defaultPrice: {
      EUR: 9.99,
      MXN: 149,
      COP: 19900,
      ARS: 2299,
      CLP: 5990,
    },
  },
  {
    slug: "gym",
    name: "Gym",
    icon: "💪",
    defaultPrice: {
      EUR: 30,
      MXN: 500,
      COP: 120000,
      ARS: 15000,
      CLP: 25000,
    },
  },
  {
    slug: "chatgpt",
    name: "ChatGPT",
    icon: "🤖",
    defaultPrice: {
      EUR: 20,
      MXN: 399,
      COP: 79900,
      ARS: 9999,
      CLP: 16990,
    },
  },
  {
    slug: "claude",
    name: "Claude",
    icon: "🧠",
    defaultPrice: {
      EUR: 20,
      MXN: 399,
      COP: 79900,
      ARS: 9999,
      CLP: 16990,
    },
  },
  {
    slug: "apple-music",
    name: "Apple Music",
    icon: "🎶",
    defaultPrice: {
      EUR: 10.99,
      MXN: 129,
      COP: 18900,
      ARS: 2199,
      CLP: 5490,
    },
  },
];
