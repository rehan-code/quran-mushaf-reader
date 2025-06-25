import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        'surah-name-v4-icon': ['surah-name-v4-icon', 'sans-serif'],
        'surah-name-v4': ['surah-name-v4', 'sans-serif'],
        'bismillah': ['bismillah', 'sans-serif'],
        'quran-icon': ['quran-icon', 'sans-serif'],
        'me_quran': ['me_quran', 'serif'],
        'indopak-nastaleeq': ['indopak-nastaleeq', 'serif'],
        'qpc-nastaleeq': ['qpc-nastaleeq', 'serif'],
        'digitalkhatt': ['digitalkhatt', 'sans-serif'],
      },
      colors: {
        'custom-green': '#4CAF50',
        'custom-blue': '#007BFF',
        'custom-blue-hover': '#0056b3',
        'custom-bg': '#f8f0da',
        'dark-mode-bg': '#222',
        'dark-mode-text': '#eee',
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-conic":
          "conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))",
      },
    },
  },
  plugins: [],
};
export default config;
