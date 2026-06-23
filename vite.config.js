import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
	build: {
		emptyOutDir: false,
		outDir: "dist",
		rollupOptions: {
			input: {
				main: resolve(__dirname, "main.js"),
				background: resolve(__dirname, "background.js")
			},
			output: {
				entryFileNames: "[name].js"
			}
		},
		sourcemap: true
	}
});
