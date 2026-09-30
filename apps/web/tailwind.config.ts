/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#FFFFFF",
        bgSubtle: "#F2F4F5",
        surface: "#FFFFFF",
        border: "#E1E5E8",
        text: "#33383D",
        textMuted: "#6B7278",
        primary: {
          DEFAULT: "#4C9A6A",
          pressed: "#3D7D57",
          soft: "#E8F2EC",
        },
        brandDark: "#123B4F",
        brandBlue: "#1F6F8B",
        accent: {
          DEFAULT: "#F0C419",
          soft: "#FFF6CC",
          text: "#6B5400",
        },
        danger: {
          DEFAULT: "#B42318",
          soft: "#FCEBEA",
        },
      },
      fontFamily: {
        sans: ['"DM Sans"', "system-ui", "sans-serif"],
        brand: ['"Fraunces"', "Georgia", "serif"],
      },
    },
  },
  plugins: [],
}
