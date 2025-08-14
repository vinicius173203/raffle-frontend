/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        'web3-bg-dark': '#1e1b4b', // Deep indigo for Web3 background
        'web3-bg-mid': '#2c2e6b',
        'web3-bg-light': '#4b4e9b',
        'web3-card-bg': 'rgba(255, 255, 255, 0.1)', // Glassmorphism card
        'web3-input-bg': 'rgba(255, 255, 255, 0.05)',
        'web3-border': 'rgba(255, 255, 255, 0.2)',
        'web3-text-primary': '#e2e8f0', // Light text for contrast
        'web3-text-secondary': '#94a3b8',
        'web3-primary': '#4f46e5', // Indigo for buttons
        'web3-primary-dark': '#4338ca',
        'web3-secondary': '#7c3aed', // Purple for accents
        'web3-secondary-dark': '#6d28d9',
        'web3-accent': '#06b6d4', // Cyan for highlights
        'web3-accent-dark': '#0891b2',
        'web3-success': '#10b981',
        'web3-error': '#ef4444',
        'web3-warning': '#f59e0b',
      },
      boxShadow: {
        'neon': '0 0 10px rgba(79, 70, 229, 0.5), 0 0 20px rgba(79, 70, 229, 0.3)',
        'neon-hover': '0 0 15px rgba(79, 70, 229, 0.7), 0 0 30px rgba(79, 70, 229, 0.5)',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
      },
    },
  },
  plugins: [],
};