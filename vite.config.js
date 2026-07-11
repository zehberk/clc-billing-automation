import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
	build: {
		emptyOutDir: false,
		outDir: "dist",
		rollupOptions: {
			input: {
				main: resolve(__dirname, "main.js"),
				background: resolve(__dirname, "background.js"),
				paymentDemo: resolve(__dirname, "payment-demo.html")
			},
			output: {
				entryFileNames: "[name].js"
			}
		},
		sourcemap: true
	}
});
