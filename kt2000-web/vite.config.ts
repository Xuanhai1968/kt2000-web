import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { "/api": "http://localhost:5000" },
  },
  build: {
    // Vite 8 chạy Rolldown nên là rolldownOptions/advancedChunks, KHÔNG phải
    // rollupOptions/manualChunks kiểu cũ (viết kiểu cũ là tsc chặn ngay).
    rolldownOptions: {
      output: {
        // Tách antd ra file riêng: nó chiếm phần lớn bundle nhưng gần như không đổi,
        // nên trình duyệt cache được qua các lần deploy thay vì tải lại cả cục 1.1 MB.
        advancedChunks: {
          groups: [
            { name: "antd", test: /node_modules[\\/](antd|@ant-design|rc-)/ },
            { name: "react", test: /node_modules[\\/](react|react-dom|react-router)/ },
          ],
        },
      },
    },
  },
})
