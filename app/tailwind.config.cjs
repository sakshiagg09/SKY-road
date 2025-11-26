/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        sapPrimary: '#0a6ed1',
        sapPrimaryDark: '#0854a0',
        sapBackground: '#111820',
        sapSurface: '#161f2b',
        sapBorder: '#293446',
        sapTextPrimary: '#f5f7fa',
        sapTextSecondary: '#a9b4c8'
      },
      borderRadius: {
        xl: '0.9rem'
      }
    },
  },
  plugins: [],
}
