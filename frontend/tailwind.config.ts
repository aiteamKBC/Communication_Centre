/** @type {import('tailwindcss').Config} */
export default {
    content: [
      "./index.html",
      "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
      extend: {
        colors: {
          'kbc-navy': '#1B2A4A',
          'kbc-navy-light': '#243560',
          'kbc-navy-mid': '#2E4482',
          'kbc-navy-soft': '#3D5A99',
          'kbc-red': '#D13438',
          'kbc-amber': '#F7A800',
          'kbc-green': '#107C10',
          'kbc-bg': '#F3F4F6',
          'kbc-card': '#FFFFFF',
        },
        fontFamily: {
          sans: ['Inter', 'system-ui', 'sans-serif'],
        },
      },
    },
    plugins: [],
  }
