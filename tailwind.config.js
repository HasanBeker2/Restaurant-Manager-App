module.exports = {
  purge: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./public/index.html",
    "./src/index.html",
  ],
  theme: {
    extend: {
      colors: {
        'sky-light': '#E6F3FF',
        'sky-medium': '#B3D9FF',
        'sky-dark': '#80BFFF',
        'cloud-white': '#FFFFFF',
        'cloud-gray': '#F0F0F0',
        'nav-blue': '#2C3E50',  // Dark blue color for navigation icons
        'nav-hover': '#34495E', // Slightly lighter blue for hover state
      },
      boxShadow: {
        'cloud': '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
      },
    },
  },
  variants: {
    extend: {},
  },
  plugins: [],
};