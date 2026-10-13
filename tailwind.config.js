/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#103B3A',
        forest: '#073D3A',
        teal: '#138F84',
        mint: '#95DCC4',
        cream: '#F5F3EB',
        paper: '#FFFEFA',
        coral: '#D66A52',
        cobalt: '#2B70D5',
      },
      fontFamily: {
        sans: ['Atkinson Hyperlegible', 'sans-serif'],
        display: ['DM Serif Display', 'serif'],
      },
      boxShadow: {
        soft: '0 16px 50px rgba(16,59,58,.10)',
        lift: '0 22px 70px rgba(7,61,58,.17)',
      },
    },
  },
  plugins: [],
}
