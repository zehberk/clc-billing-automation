import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
	build: {
		emptyOutDir: false,
		outDir: "dist",
		rollupOptions: {
			input: {
				main: resolve(__dirname, "main.js")
			},
			output: {
				entryFileNames: "main.js"
			}
		},
		sourcemap: true
	}
});
